import { App, setIcon } from "obsidian";
import {
	ConfigEfetivaGrupo,
	ConfiguracoesGestorTarefas,
	GrupoFiltro,
	ID_STATUS,
	Tarefa,
	TipoAgrupamento,
	clonarGrupoFiltro,
	grupoFiltroVazio,
	obterFiltroSalvo,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ID_DATA_ENTRADA, desenharCartaoTarefa, FORMATO_DRAG_TAREFA } from "./render-tarefa";
import { CHAVE_SEM_VALOR, agruparTarefas } from "./motor-agrupamento";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";
import { SeletorAgrupamento } from "./seletor-agrupamento";
import { SeletorGrupo } from "./seletor-grupo";

export interface OpcoesMotorKanban {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfigEfetivaGrupo;
	agrupamentoInicial?: TipoAgrupamento;
	// Subagrupamento pré-selecionado ao abrir (seções dentro de cada coluna). Ausente = "nenhum".
	subagrupamentoInicial?: TipoAgrupamento;
	filtro?: (tarefa: Tarefa) => boolean;
	// Filtro salvo pré-selecionado ao abrir (ex: filtro padrão configurado em Configurações, ou o filtro
	// móvel padrão de uma Visualização salva — nesse caso deve ser um dos IDs presentes em filtrosExtrasIds).
	filtroInicialId?: string | null;
	permitirTrocaAgrupamento?: boolean;
	permitirEdicaoFiltro?: boolean;
	permitirCriarTarefa?: boolean;
	// Restringe o SeletorFiltroSalvo do cabeçalho a só estes IDs (usado no embed, "filtro móvel" da visualização).
	// Sem isso, o seletor mostra todos os Filtros salvos (comportamento da Lista/Kanban geral).
	filtrosExtrasIds?: string[];
	// Seletor de grupo (view única): config global para listar grupos + grupo ativo + callback de troca.
	// Só desenha o ícone quando há mais de um grupo. Ausente = embed/contexto sem troca de grupo.
	configuracoesGlobais?: ConfiguracoesGestorTarefas;
	grupoAtivoId?: string;
	aoTrocarGrupo?: (grupoId: string) => void;
}

export class MotorKanban {
	private agrupamento: TipoAgrupamento;
	// Segundo nível: divide as tarefas DENTRO de cada coluna em seções. "nenhum" = lista corrida (padrão).
	private subagrupamento: TipoAgrupamento = "nenhum";
	private grupoFiltro: GrupoFiltro = grupoFiltroVazio();
	private filtroSalvoId: string | null = null;
	private areaGrade: HTMLElement | null = null;

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesMotorKanban) {
		this.agrupamento = opcoes.agrupamentoInicial ?? ID_STATUS;
		this.subagrupamento = opcoes.subagrupamentoInicial ?? "nenhum";

		const filtroInicial = opcoes.filtroInicialId ? obterFiltroSalvo(opcoes.configuracoes, opcoes.filtroInicialId) : undefined;
		if (filtroInicial) {
			this.filtroSalvoId = filtroInicial.id;
			this.grupoFiltro = clonarGrupoFiltro(filtroInicial.raiz);
		}
	}

	renderizar(): void {
		this.containerEl.empty();
		this.containerEl.addClass("mytasks-kanban");

		this.desenharCabecalho();
		this.areaGrade = this.containerEl.createDiv({ cls: "mytasks-kanban-grade" });
		this.renderizarGrade();
	}

	destruir(): void {}

	private tarefasFiltradas(): Tarefa[] {
		const todas = this.opcoes.repositorio.listarTarefas();
		const filtroInterativo = compilarFiltro(this.grupoFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
		return todas.filter((t) => (this.opcoes.filtro ? this.opcoes.filtro(t) : true)).filter(filtroInterativo);
	}

	private colunas() {
		return agruparTarefas(this.tarefasFiltradas(), this.agrupamento, this.opcoes.configuracoes, this.opcoes.app);
	}

	// Subagrupamento efetivo: "nenhum" quando desligado, ou quando ele coincide com o agrupamento das
	// colunas — subdividir a coluna "fazer" por status renderia uma única seção "fazer" dentro dela,
	// só ruído. Nesse caso a coluna desenha a lista corrida de sempre.
	private subagrupamentoEfetivo(): TipoAgrupamento {
		if (this.subagrupamento === "nenhum") return "nenhum";
		return this.subagrupamento === this.agrupamento ? "nenhum" : this.subagrupamento;
	}

	private propriedadesMeta() {
		const { kanbanPropriedadesVisiveis, propriedades } = this.opcoes.configuracoes;
		return kanbanPropriedadesVisiveis ? propriedades.filter((p) => kanbanPropriedadesVisiveis.includes(p.id)) : propriedades;
	}

	private ocultarNaMeta(): string[] {
		const { kanbanPropriedadesVisiveis } = this.opcoes.configuracoes;
		const ocultarDataEntrada = kanbanPropriedadesVisiveis !== null && !kanbanPropriedadesVisiveis.includes(ID_DATA_ENTRADA);
		const ocultarStatus = kanbanPropriedadesVisiveis !== null && !kanbanPropriedadesVisiveis.includes(ID_STATUS);
		return [
			this.agrupamento,
			...(ocultarDataEntrada ? [ID_DATA_ENTRADA] : []),
			...(ocultarStatus ? [ID_STATUS] : []),
		];
	}

	private renderizarGrade(): void {
		if (!this.areaGrade) return;
		this.areaGrade.empty();

		const colunas = this.colunas();
		if (colunas.length === 0) {
			this.areaGrade.createEl("p", {
				text: "Esta propriedade ainda não tem opções configuradas em Configurações → Propriedades customizadas.",
				cls: "mytasks-vazio",
			});
			return;
		}

		for (const coluna of colunas) {
			const colunaEl = this.areaGrade.createDiv({ cls: "mytasks-kanban-coluna" });

			const cabecalhoColuna = colunaEl.createDiv({ cls: "mytasks-kanban-cabecalho-coluna" });
			if (coluna.cor) cabecalhoColuna.style.setProperty("--mytasks-cor-coluna", coluna.cor);
			cabecalhoColuna.createEl("span", { text: coluna.rotulo, cls: "mytasks-kanban-titulo-coluna" });
			cabecalhoColuna.createEl("span", { text: String(coluna.tarefas.length), cls: "mytasks-kanban-contagem-coluna" });

			const listaColuna = colunaEl.createDiv({ cls: "mytasks-kanban-lista-coluna" });
			const subagrupamento = this.subagrupamentoEfetivo();

			if (subagrupamento === "nenhum") {
				for (const tarefa of coluna.tarefas) this.desenharCartao(listaColuna, tarefa);
			} else {
				// Reusa o MESMO motor de agrupamento das colunas, agora sobre as tarefas de uma coluna só.
				// Seção vazia é omitida: o agrupamento por opções fixas devolve um cluster por opção
				// configurada, e desenhar "pessoal (0)" em toda coluna que não tem nenhuma seria ruído.
				for (const secao of agruparTarefas(coluna.tarefas, subagrupamento, this.opcoes.configuracoes, this.opcoes.app)) {
					if (secao.tarefas.length === 0) continue;
					const secaoEl = listaColuna.createDiv({ cls: "mytasks-kanban-secao" });
					secaoEl.createDiv({ cls: "mytasks-kanban-cabecalho-secao", text: secao.rotulo });
					const listaSecao = secaoEl.createDiv({ cls: "mytasks-kanban-lista-secao" });
					for (const tarefa of secao.tarefas) this.desenharCartao(listaSecao, tarefa);
					this.registrarAlvoDeSoltura(secaoEl, coluna.chave, secao.chave);
				}
			}

			this.registrarAlvoDeSoltura(colunaEl, coluna.chave);
		}
	}

	private desenharCartao(container: HTMLElement, tarefa: Tarefa): void {
		desenharCartaoTarefa(container, this.opcoes.app, this.opcoes.repositorio, this.opcoes.configuracoes, tarefa, {
			propriedadesMeta: this.propriedadesMeta(),
			ocultarNaMeta: this.ocultarNaMeta(),
			aoAtualizar: () => this.renderizar(),
		});
	}

	// Grava um valor de agrupamento na tarefa. Usado tanto pela coluna (agrupamento principal) quanto
	// pela seção (subagrupamento) — a diferença entre os dois é só QUAL agrupamento está sendo gravado.
	private async gravarValorDeAgrupamento(tarefa: Tarefa, agrupamento: TipoAgrupamento, valor: string): Promise<void> {
		if (agrupamento === ID_STATUS) {
			await this.opcoes.repositorio.atualizarStatus(tarefa, valor);
			return;
		}
		// A seção "outros" reúne quem não tem valor — soltar ali LIMPA a propriedade (null), em vez de
		// gravar a string "__sem_valor__" no frontmatter.
		await this.opcoes.repositorio.atualizarPropriedade(
			tarefa,
			agrupamento,
			valor === CHAVE_SEM_VALOR ? null : valor
		);
	}

	// Registra um alvo de soltura. Sem `valorSecao`, é a coluna inteira e grava só o agrupamento
	// principal (comportamento de sempre). Com `valorSecao`, é uma seção de subagrupamento e grava
	// TAMBÉM o valor do subagrupamento — soltar em "pessoal" dentro de "feito" muda as duas coisas.
	private registrarAlvoDeSoltura(elemento: HTMLElement, valorColuna: string, valorSecao?: string): void {
		elemento.addEventListener("dragover", (evento) => {
			if (!evento.dataTransfer?.types.includes(FORMATO_DRAG_TAREFA)) return;
			evento.preventDefault();
			// A seção fica DENTRO da coluna: sem parar a propagação, as duas acenderiam ao mesmo tempo
			// e a usuária não saberia onde vai soltar. O alvo mais interno vence.
			evento.stopPropagation();
			elemento.addClass("mytasks-kanban-alvo-soltura");
		});
		elemento.addEventListener("dragleave", () => elemento.removeClass("mytasks-kanban-alvo-soltura"));
		elemento.addEventListener("drop", async (evento) => {
			const caminho = evento.dataTransfer?.getData(FORMATO_DRAG_TAREFA);
			elemento.removeClass("mytasks-kanban-alvo-soltura");
			if (!caminho) return;
			evento.preventDefault();
			evento.stopPropagation();
			const tarefa = this.tarefasFiltradas().find((t) => t.caminho === caminho);
			if (!tarefa) return;

			// Subagrupamento PRIMEIRO: concluir uma tarefa recorrente pode reescrever/mover o arquivo
			// (ver atualizarStatus), e a `tarefa` em mãos apontaria pro caminho antigo. Gravando a
			// propriedade antes, ela vai pro arquivo certo; o status por último fecha a operação.
			const subagrupamento = this.subagrupamentoEfetivo();
			if (valorSecao !== undefined && subagrupamento !== "nenhum") {
				await this.gravarValorDeAgrupamento(tarefa, subagrupamento, valorSecao);
			}
			await this.gravarValorDeAgrupamento(tarefa, this.agrupamento, valorColuna);
			this.renderizar();
		});
	}

	private desenharCabecalho(): void {
		const cabecalho = this.containerEl.createDiv({ cls: "mytasks-cabecalho" });

		// Ícone discreto de troca de grupo, ANTES da palavra "Kanban" (só quando há mais de um grupo).
		if (this.opcoes.configuracoesGlobais && this.opcoes.grupoAtivoId && this.opcoes.aoTrocarGrupo) {
			const cfgGlobal = this.opcoes.configuracoesGlobais;
			if (cfgGlobal.grupos.length > 1) {
				new SeletorGrupo(cabecalho, {
					configuracoes: cfgGlobal,
					grupoAtivoId: this.opcoes.grupoAtivoId,
					icone: "square-kanban",
					aoEscolher: (grupoId) => this.opcoes.aoTrocarGrupo!(grupoId),
				});
			}
		}

		cabecalho.createEl("h3", { text: "kanban" });

		// Agrupamento como abas lado a lado (igual às visualizações do Calendário), não como menu:
		// trocar de agrupamento é a ação mais frequente do Kanban, então fica sempre à vista.
		if (this.opcoes.permitirTrocaAgrupamento !== false) {
			new SeletorAgrupamento(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				agrupamentoAtual: this.agrupamento,
				permitirNenhum: false,
				permitirDia: false,
				apresentacao: "abas",
				aoEscolher: (agrupamento) => {
					this.agrupamento = agrupamento;
					this.renderizarGrade();
				},
			});
		}

		// Subagrupamento: botão discreto ANTES do filtro. Menu (não abas) de propósito — as abas do
		// cabeçalho já são o agrupamento principal, e uma segunda fileira igual competiria por espaço
		// e confundiria os dois níveis.
		if (this.opcoes.permitirTrocaAgrupamento !== false) {
			new SeletorAgrupamento(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				agrupamentoAtual: this.subagrupamento,
				permitirNenhum: true,
				permitirDia: false,
				// Escolha dela. "rows-3" desenha faixas horizontais empilhadas — é a leitura certa pro
				// subagrupamento (seções dentro de uma coluna). As alternativas cobrem versões do
				// Obsidian em que esse nome ainda não existe: "rows" é o nome antigo do mesmo ícone,
				// e "layout-grid" é o último recurso pra nunca cair num botão vazio.
				icone: ["rows-3", "rows", "layout-grid"],
				rotulo: "subagrupamento",
				excluir: () => this.agrupamento,
				// Sem `elementoAlinhamento`: o menu desce colado no próprio botão, igual ao do filtro
				// ao lado. Alinhar pelo cabeçalho inteiro jogava o menu lá pra borda esquerda da view,
				// longe do botão clicado — os dois seletores vizinhos abriam em lugares diferentes.
				aoEscolher: (agrupamento) => {
					this.subagrupamento = agrupamento;
					this.renderizarGrade();
				},
			});
		}

		const filtroMovelVazio = this.opcoes.filtrosExtrasIds && this.opcoes.filtrosExtrasIds.length === 0;
		if (this.opcoes.permitirEdicaoFiltro !== false && !filtroMovelVazio) {
			new SeletorFiltroSalvo(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				filtroAtualId: this.filtroSalvoId,
				restringirAIds: this.opcoes.filtrosExtrasIds,
				aoEscolher: (filtroId, raiz) => {
					this.filtroSalvoId = filtroId;
					this.grupoFiltro = raiz;
					this.renderizarGrade();
				},
			});
		}

		if (this.opcoes.permitirCriarTarefa !== false) {
			const botaoNova = cabecalho.createEl("button", { cls: "mytasks-botao-nova-tarefa mytasks-seletor-discreto" });
			const iconeNova = botaoNova.createSpan({ cls: "mytasks-seletor-discreto-icone" });
			setIcon(iconeNova, "square-plus");
			botaoNova.createSpan({ cls: "mytasks-seletor-discreto-texto", text: "nova tarefa" });
			botaoNova.addEventListener("click", async () => {
				const arquivo = await this.opcoes.repositorio.criarTarefaEmBranco();
				this.renderizar();
				this.opcoes.app.workspace.openLinkText(arquivo.path, "", false);
			});
		}
	}
}
