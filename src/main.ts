import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
	CONFIGURACOES_PADRAO,
	ConfiguracoesGestorTarefas,
	GRUPO_PADRAO,
	GrupoTarefas,
	arquivoEhTarefaRelevante,
	configDoGrupo,
	grupoAtivoOuPrimeiro,
	normalizarChave,
} from "./tipos";
import { RepositorioTarefas, renomearChaveEmArquivos } from "./repositorio-tarefas";
import { VistaLista, TIPO_VISTA_LISTA } from "./vista-lista";
import { VistaListaAba, TIPO_VISTA_LISTA_ABA } from "./vista-lista-aba";
import { VistaCalendarioSidebar, TIPO_VISTA_CALENDARIO_SIDEBAR } from "./vista-calendario-sidebar";
import { VistaCalendarioAba, TIPO_VISTA_CALENDARIO_ABA } from "./vista-calendario-aba";
import { VistaKanbanAba, TIPO_VISTA_KANBAN_ABA } from "./vista-kanban-aba";
import { registrarProcessadorCalendario } from "./embed-calendario";
import { registrarProcessadorLista } from "./embed-lista";
import { registrarProcessadorKanban } from "./embed-kanban";
import { AbaConfiguracoes } from "./configuracoes";

export default class MyTasksPlugin extends Plugin {
	configuracoes: ConfiguracoesGestorTarefas = CONFIGURACOES_PADRAO;
	// Repositório do grupo default (primeiro grupo). Views/embeds ainda single-group nesta fase o usam;
	// na Fase 4 cada view pega o repositório do seu próprio grupo via repositorioDoGrupo().
	repositorio!: RepositorioTarefas;
	private repositoriosPorGrupo = new Map<string, RepositorioTarefas>();
	private ribbonsDeGrupos: HTMLElement[] = [];

	// Uma instância de RepositorioTarefas por grupo, memoizada. Cada uma lê a config EFETIVA do seu grupo
	// (pastas, chave de data, propriedades, status próprios) — mantém o repositório stateless e desacoplado da UI.
	repositorioDoGrupo(grupoId: string): RepositorioTarefas {
		let repo = this.repositoriosPorGrupo.get(grupoId);
		if (!repo) {
			repo = new RepositorioTarefas(this.app, () => {
				const grupo = grupoAtivoOuPrimeiro(this.configuracoes, grupoId);
				return configDoGrupo(this.configuracoes, grupo);
			});
			this.repositoriosPorGrupo.set(grupoId, repo);
		}
		return repo;
	}

	grupoDefault(): GrupoTarefas {
		return this.configuracoes.grupos[0];
	}

	// A qual grupo um arquivo pertence (primeiro grupo pra cuja pasta/filtro ele é relevante), ou null se
	// nenhum. Usada pelo comando "Concluir tarefa atual" pra descobrir a config efetiva certa (chaves,
	// opções de status) a partir do arquivo aberto, sem ele precisar saber de qual grupo é.
	grupoDoArquivo(caminho: string): GrupoTarefas | null {
		for (const grupo of this.configuracoes.grupos) {
			const config = configDoGrupo(this.configuracoes, grupo);
			if (arquivoEhTarefaRelevante(config, caminho)) return grupo;
		}
		return null;
	}

	// Renomeia a chave do discriminador de grupo (propriedadeGrupo, campo global) no frontmatter — diferente
	// de RepositorioTarefas.renomearChaveFrontmatter (escopado a UM grupo), essa chave atravessa TODOS os
	// grupos, então soma os arquivos relevantes de cada um (deduplicados por caminho, já que um arquivo não
	// pode ser relevante a dois grupos ao mesmo tempo na prática, mas a união evita processar 2x por engano).
	async renomearChavePropriedadeGrupo(chaveAntiga: string, chaveNova: string): Promise<number> {
		const caminhos = new Set<string>();
		const arquivos: TFile[] = [];
		for (const grupo of this.configuracoes.grupos) {
			const config = configDoGrupo(this.configuracoes, grupo);
			for (const arquivo of this.app.vault.getMarkdownFiles()) {
				if (caminhos.has(arquivo.path)) continue;
				if (arquivoEhTarefaRelevante(config, arquivo.path)) {
					caminhos.add(arquivo.path);
					arquivos.push(arquivo);
				}
			}
		}
		return renomearChaveEmArquivos(this.app, arquivos, chaveAntiga, chaveNova);
	}

	async onload() {
		await this.carregarConfiguracoes();

		this.repositorio = this.repositorioDoGrupo(this.grupoDefault().id);

		this.registerView(TIPO_VISTA_LISTA, (leaf) => new VistaLista(leaf, this));
		this.registerView(TIPO_VISTA_LISTA_ABA, (leaf) => new VistaListaAba(leaf, this));
		this.registerView(TIPO_VISTA_CALENDARIO_SIDEBAR, (leaf) => new VistaCalendarioSidebar(leaf, this));
		this.registerView(TIPO_VISTA_CALENDARIO_ABA, (leaf) => new VistaCalendarioAba(leaf, this));
		this.registerView(TIPO_VISTA_KANBAN_ABA, (leaf) => new VistaKanbanAba(leaf, this));

		registrarProcessadorCalendario(
			(linguagem, handler) => this.registerMarkdownCodeBlockProcessor(linguagem, handler),
			this.app,
			this.repositorio,
			() => configDoGrupo(this.configuracoes, this.grupoDefault())
		);

		registrarProcessadorLista(
			(linguagem, handler) => this.registerMarkdownCodeBlockProcessor(linguagem, handler),
			this.app,
			this.repositorio,
			() => configDoGrupo(this.configuracoes, this.grupoDefault())
		);

		registrarProcessadorKanban(
			(linguagem, handler) => this.registerMarkdownCodeBlockProcessor(linguagem, handler),
			this.app,
			this.repositorio,
			() => configDoGrupo(this.configuracoes, this.grupoDefault())
		);

		// Um ícone de ribbon por grupo (a Lista da sidebar) — cada um abre a lista do seu grupo.
		this.registrarRibbonsDeGrupos();

		this.addRibbonIcon("calendar-days", "Abrir calendário de tarefas", () => {
			this.ativarVistaCalendarioAba();
		});

		this.addRibbonIcon("square-kanban", "Abrir kanban de tarefas", () => {
			this.ativarVistaKanbanAba();
		});

		this.addCommand({
			id: "abrir-lista-tarefas",
			name: "Abrir lista de tarefas",
			callback: () => this.ativarVistaLista(this.grupoDefault().id),
		});

		this.addCommand({
			id: "abrir-lista-tarefas-aba",
			name: "Abrir lista de tarefas (tela cheia)",
			callback: () => this.ativarVistaListaAba(),
		});

		this.addCommand({
			id: "abrir-calendario-tarefas-sidebar",
			name: "Abrir calendário de tarefas (barra lateral)",
			callback: () => this.ativarVistaCalendarioSidebar(),
		});

		this.addCommand({
			id: "abrir-calendario-tarefas-aba",
			name: "Abrir calendário de tarefas (tela cheia)",
			callback: () => this.ativarVistaCalendarioAba(),
		});

		this.addCommand({
			id: "abrir-kanban-tarefas-aba",
			name: "Abrir kanban de tarefas (tela cheia)",
			callback: () => this.ativarVistaKanbanAba(),
		});

		// Alvo do botão Meta Bind "Concluir tarefa" colado na nota (ver meta-bind-tarefa.ts) — só fica
		// disponível com uma tarefa aberta, daí o checkCallback em vez de callback fixo.
		this.addCommand({
			id: "concluir-tarefa-atual",
			name: "Concluir tarefa atual",
			checkCallback: (checking) => {
				const arquivo = this.app.workspace.getActiveFile();
				if (!arquivo) return false;
				const grupo = this.grupoDoArquivo(arquivo.path);
				if (!grupo) return false;
				if (!checking) this.repositorioDoGrupo(grupo.id).concluirTarefaAtual(arquivo);
				return true;
			},
		});

		this.addSettingTab(new AbaConfiguracoes(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(TIPO_VISTA_LISTA);
		this.app.workspace.detachLeavesOfType(TIPO_VISTA_LISTA_ABA);
		this.app.workspace.detachLeavesOfType(TIPO_VISTA_CALENDARIO_SIDEBAR);
		this.app.workspace.detachLeavesOfType(TIPO_VISTA_CALENDARIO_ABA);
		this.app.workspace.detachLeavesOfType(TIPO_VISTA_KANBAN_ABA);
	}

	// (Re)cria os ícones de ribbon da Lista, um por grupo. Chamado no onload e sempre que grupos/ícones mudam.
	registrarRibbonsDeGrupos(): void {
		for (const el of this.ribbonsDeGrupos) el.remove();
		this.ribbonsDeGrupos = [];
		for (const grupo of this.configuracoes.grupos) {
			const el = this.addRibbonIcon(grupo.icone, `Abrir ${grupo.nome}`, () => this.ativarVistaLista(grupo.id));
			this.ribbonsDeGrupos.push(el);
		}
	}

	async ativarVistaLista(grupoId: string) {
		const { workspace } = this.app;
		// Procura uma leaf da Lista já aberta com esse grupoId; senão cria uma nova na sidebar direita.
		const existente = workspace
			.getLeavesOfType(TIPO_VISTA_LISTA)
			.find((leaf) => (leaf.getViewState().state as { grupoId?: string } | undefined)?.grupoId === grupoId);

		let leaf: WorkspaceLeaf | null = existente ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: TIPO_VISTA_LISTA, active: true, state: { grupoId } });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	async ativarVistaListaAba() {
		const { workspace } = this.app;
		const folhasExistentes = workspace.getLeavesOfType(TIPO_VISTA_LISTA_ABA);

		let leaf: WorkspaceLeaf;
		if (folhasExistentes.length > 0) {
			leaf = folhasExistentes[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: TIPO_VISTA_LISTA_ABA, active: true, state: { grupoId: this.grupoDefault().id } });
		}

		workspace.revealLeaf(leaf);
	}

	async ativarVistaCalendarioSidebar() {
		await this.ativarVistaEmSidebar(TIPO_VISTA_CALENDARIO_SIDEBAR);
	}

	private async ativarVistaEmSidebar(tipoView: string) {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const folhasExistentes = workspace.getLeavesOfType(tipoView);

		if (folhasExistentes.length > 0) {
			leaf = folhasExistentes[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: tipoView, active: true });
		}

		if (leaf) workspace.revealLeaf(leaf);
	}

	async ativarVistaCalendarioAba() {
		const { workspace } = this.app;
		const folhasExistentes = workspace.getLeavesOfType(TIPO_VISTA_CALENDARIO_ABA);

		let leaf: WorkspaceLeaf;
		if (folhasExistentes.length > 0) {
			leaf = folhasExistentes[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: TIPO_VISTA_CALENDARIO_ABA, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	async ativarVistaKanbanAba() {
		const { workspace } = this.app;
		const folhasExistentes = workspace.getLeavesOfType(TIPO_VISTA_KANBAN_ABA);

		let leaf: WorkspaceLeaf;
		if (folhasExistentes.length > 0) {
			leaf = folhasExistentes[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: TIPO_VISTA_KANBAN_ABA, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	async carregarConfiguracoes() {
		const dadosSalvos = ((await this.loadData()) ?? {}) as Record<string, unknown>;

		// Formato antigo (single-group): tinha os campos planos no topo (status/…) e nenhum `grupos`.
		// Envelopamos essa config plana como o PRIMEIRO grupo, sem clobber — os campos planos viram do grupo.
		const ehFormatoAntigo = dadosSalvos.grupos === undefined && dadosSalvos.status !== undefined;

		let precisaSalvar = false;

		if (ehFormatoAntigo) {
			const grupo = { ...GRUPO_PADRAO, ...dadosSalvos } as GrupoTarefas;
			grupo.id = "grupo_padrao";
			grupo.valorDiscriminador = "";
			grupo.nome = "Tarefas";
			grupo.icone = "check-square";
			// Remove campos que não pertencem ao grupo (vieram do topo antigo, se existirem).
			delete (grupo as unknown as Record<string, unknown>).grupos;
			delete (grupo as unknown as Record<string, unknown>).propriedadeGrupo;
			this.migrarCamposDeGrupo(grupo, dadosSalvos);
			this.configuracoes = {
				propriedadeGrupo: null,
				grupos: [grupo],
				grupoAtivoKanbanId: grupo.id,
				grupoAtivoCalendarioId: grupo.id,
			};
			precisaSalvar = true; // grava já no formato novo (idempotente)
		} else {
			this.configuracoes = Object.assign({}, CONFIGURACOES_PADRAO, dadosSalvos);
			if (this.configuracoes.grupos.length === 0) {
				this.configuracoes.grupos = [{ ...GRUPO_PADRAO }];
			}
			// Garante campos novos de grupo em instalações já no formato novo + reaplica migrações por grupo.
			const gruposSalvos = (dadosSalvos.grupos ?? []) as Record<string, unknown>[];
			this.configuracoes.grupos = this.configuracoes.grupos.map((grupoSalvo, i) => {
				const grupo = Object.assign({}, GRUPO_PADRAO, grupoSalvo) as GrupoTarefas;
				this.migrarCamposDeGrupo(grupo, gruposSalvos[i] ?? {});
				return grupo;
			});
		}

		if (precisaSalvar) {
			await this.salvarConfiguracoes();
		}
	}

	// Reaplica as migrações de campo (que antes eram globais) agora no escopo de UM grupo.
	private migrarCamposDeGrupo(grupo: GrupoTarefas, dadosDoGrupo: Record<string, unknown>): void {
		// Chave técnica da data ausente: deriva da normalização do rótulo salvo.
		if (!grupo.dataTarefa.chave) {
			grupo.dataTarefa.chave = normalizarChave(grupo.dataTarefa.rotulo);
		}

		// Chave técnica do status ausente: config salva antes de ConfigStatus ganhar `chave` — o merge raso
		// do Object.assign(GRUPO_PADRAO, grupoSalvo) substitui o objeto `status` inteiro, perdendo o default.
		// Sempre "status" (nunca deriva do rótulo) — é a chave real que já está em toda tarefa existente.
		if (!grupo.status.chave) {
			grupo.status.chave = "status";
		}

		// `destaque` (campo único antigo) -> `destaques` (um dono por estilo).
		const destaqueAntigo = dadosDoGrupo.destaque as
			| { propriedadeId: string; estilo: "checkbox" | "linha" | "borda"; espessuraCheckbox?: "fina" | "media" | "grossa" }
			| null
			| undefined;
		if (destaqueAntigo && Object.keys(grupo.destaques ?? {}).length === 0) {
			grupo.destaques = {
				[destaqueAntigo.estilo]: {
					propriedadeId: destaqueAntigo.propriedadeId,
					estilo: destaqueAntigo.estilo,
					espessuraCheckbox: destaqueAntigo.espessuraCheckbox ?? "media",
				},
			};
		}

		// `calendarioPropriedadesVisiveis` (campo único) -> `...PorModo`, preservando só na semana-kanban.
		const calendarioPropriedadesVisiveisAntigo = dadosDoGrupo.calendarioPropriedadesVisiveis as string[] | null | undefined;
		if (calendarioPropriedadesVisiveisAntigo !== undefined && !dadosDoGrupo.calendarioPropriedadesVisiveisPorModo) {
			grupo.calendarioPropriedadesVisiveisPorModo = {
				mes: [],
				"semana-horarios": [],
				"semana-kanban": calendarioPropriedadesVisiveisAntigo,
				ano: [],
			};
		}

		// Estilo de destaque "linha inteira" foi removido — descarta qualquer entrada salva desse estilo.
		if (grupo.destaques && "linha" in grupo.destaques) {
			delete (grupo.destaques as Record<string, unknown>).linha;
		}

		// `condicoes: CondicaoFiltro[]` (lista plana antiga) -> `raiz: GrupoFiltro` (árvore E/OU/NENHUM).
		// Envelopa como um único grupo "e" com as condições antigas como folhas — mesmo comportamento de
		// sempre (tudo combinado com E), só que agora representável na árvore nova.
		for (const filtro of grupo.filtrosSalvos) this.migrarCondicoesLegadas(filtro);
		for (const view of grupo.visualizacoesSalvas) this.migrarCondicoesLegadas(view);
	}

	private migrarCondicoesLegadas(itemTipado: unknown): void {
		const item = itemTipado as Record<string, unknown>;
		if (item.raiz) return; // já migrado (idempotente)
		const condicoesAntigas = (item.condicoes ?? []) as Record<string, unknown>[];
		item.raiz = {
			tipo: "grupo",
			combinador: "e",
			itens: condicoesAntigas.map((c) => ({ tipo: "condicao", ...c })),
		};
		delete item.condicoes;
	}

	async salvarConfiguracoes() {
		await this.saveData(this.configuracoes);
	}
}
