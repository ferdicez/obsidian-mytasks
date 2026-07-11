import { Plugin, WorkspaceLeaf } from "obsidian";
import { CONFIGURACOES_PADRAO, ConfiguracoesGestorTarefas, normalizarChave } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
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
	repositorio!: RepositorioTarefas;

	async onload() {
		await this.carregarConfiguracoes();

		this.repositorio = new RepositorioTarefas(this.app, () => this.configuracoes);

		this.registerView(
			TIPO_VISTA_LISTA,
			(leaf) => new VistaLista(leaf, this.repositorio, this.configuracoes)
		);
		this.registerView(
			TIPO_VISTA_LISTA_ABA,
			(leaf) => new VistaListaAba(leaf, this.repositorio, this.configuracoes)
		);
		this.registerView(
			TIPO_VISTA_CALENDARIO_SIDEBAR,
			(leaf) => new VistaCalendarioSidebar(leaf, this.repositorio, this.configuracoes)
		);
		this.registerView(
			TIPO_VISTA_CALENDARIO_ABA,
			(leaf) => new VistaCalendarioAba(leaf, this.repositorio, this.configuracoes)
		);

		registrarProcessadorCalendario(
			(linguagem, handler) => this.registerMarkdownCodeBlockProcessor(linguagem, handler),
			this.app,
			this.repositorio,
			() => this.configuracoes
		);

		registrarProcessadorLista(
			(linguagem, handler) => this.registerMarkdownCodeBlockProcessor(linguagem, handler),
			this.app,
			this.repositorio,
			() => this.configuracoes
		);

		this.registerView(
			TIPO_VISTA_KANBAN_ABA,
			(leaf) => new VistaKanbanAba(leaf, this.repositorio, this.configuracoes)
		);

		registrarProcessadorKanban(
			(linguagem, handler) => this.registerMarkdownCodeBlockProcessor(linguagem, handler),
			this.app,
			this.repositorio,
			() => this.configuracoes
		);

		this.addRibbonIcon("check-square", "Abrir My Tasks", () => {
			this.ativarVistaLista();
		});

		this.addRibbonIcon("calendar-days", "Abrir Calendário de Tarefas", () => {
			this.ativarVistaCalendarioAba();
		});

		this.addRibbonIcon("square-kanban", "Abrir Kanban de Tarefas", () => {
			this.ativarVistaKanbanAba();
		});

		this.addCommand({
			id: "abrir-lista-tarefas",
			name: "Abrir lista de tarefas",
			callback: () => this.ativarVistaLista(),
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
			name: "Abrir Kanban de tarefas (tela cheia)",
			callback: () => this.ativarVistaKanbanAba(),
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

	async ativarVistaLista() {
		await this.ativarVistaEmSidebar(TIPO_VISTA_LISTA);
	}

	async ativarVistaListaAba() {
		const { workspace } = this.app;
		const folhasExistentes = workspace.getLeavesOfType(TIPO_VISTA_LISTA_ABA);

		let leaf: WorkspaceLeaf;
		if (folhasExistentes.length > 0) {
			leaf = folhasExistentes[0];
		} else {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: TIPO_VISTA_LISTA_ABA, active: true });
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
		this.configuracoes = Object.assign({}, CONFIGURACOES_PADRAO, dadosSalvos);

		// Instalações salvas antes do campo `chave` existir: assume que a chave técnica já usada
		// no frontmatter das notas segue a normalização do rótulo salvo (é o caso quando a chave
		// nunca foi renomeada manualmente, ou quando foi renomeada com o mesmo texto do rótulo).
		if (!this.configuracoes.dataTarefa.chave) {
			this.configuracoes.dataTarefa.chave = normalizarChave(this.configuracoes.dataTarefa.rotulo);
		}

		// Migração: até a versão anterior, só uma propriedade podia controlar o destaque visual
		// (campo único `destaque`). Agora cada estilo (checkbox/linha/borda) tem seu próprio dono,
		// então o valor antigo vira a entrada correspondente ao estilo que ele já usava.
		const destaqueAntigo = dadosSalvos.destaque as
			| { propriedadeId: string; estilo: "checkbox" | "linha" | "borda"; espessuraCheckbox?: "fina" | "media" | "grossa" }
			| null
			| undefined;
		if (destaqueAntigo && Object.keys(this.configuracoes.destaques).length === 0) {
			this.configuracoes.destaques = {
				[destaqueAntigo.estilo]: {
					propriedadeId: destaqueAntigo.propriedadeId,
					estilo: destaqueAntigo.estilo,
					espessuraCheckbox: destaqueAntigo.espessuraCheckbox ?? "media",
				},
			};
			await this.salvarConfiguracoes();
		}

		// Migração: antes, "propriedades visíveis no calendário" era um único campo, usado apenas
		// pela visão semana-kanban (as outras sempre ocultavam tudo). Preserva esse valor só nela;
		// as demais visões começam vazias (comportamento visual que já existia) até serem configuradas.
		const calendarioPropriedadesVisiveisAntigo = dadosSalvos.calendarioPropriedadesVisiveis as string[] | null | undefined;
		if (calendarioPropriedadesVisiveisAntigo !== undefined && !dadosSalvos.calendarioPropriedadesVisiveisPorModo) {
			this.configuracoes.calendarioPropriedadesVisiveisPorModo = {
				mes: [],
				"semana-horarios": [],
				"semana-kanban": calendarioPropriedadesVisiveisAntigo,
				ano: [],
			};
			await this.salvarConfiguracoes();
		}
	}

	async salvarConfiguracoes() {
		await this.saveData(this.configuracoes);
	}
}
