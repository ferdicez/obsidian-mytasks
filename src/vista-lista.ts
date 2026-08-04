import { ItemView, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type MyTasksPlugin from "./main";
import { GrupoTarefas, configDoGrupo, grupoAtivoOuPrimeiro, primeiraOpcaoStatus } from "./tipos";
import { AreaCaptura } from "./area-captura";

export const TIPO_VISTA_LISTA = "mytasks-lista";

// A Lista da sidebar tem UMA instância por grupo. O grupo é guardado no view state (grupoId), a forma
// idiomática do Obsidian de distinguir várias leaves do mesmo tipo de view (sobrevive a reinício).
export class VistaLista extends ItemView {
	private capturaInbox: AreaCaptura | null = null;
	private capturaDemandas: AreaCaptura | null = null;
	private grupoId: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MyTasksPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_LISTA;
	}

	getDisplayText(): string {
		return this.grupoAtivo().nome;
	}

	getIcon(): string {
		return this.grupoAtivo().icone;
	}

	getState(): Record<string, unknown> {
		return { grupoId: this.grupoId };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === "object" && "grupoId" in state) {
			const id = (state as { grupoId: unknown }).grupoId;
			this.grupoId = typeof id === "string" ? id : null;
		}
		this.renderizar();
		return super.setState(state, result);
	}

	private grupoAtivo(): GrupoTarefas {
		return grupoAtivoOuPrimeiro(this.plugin.configuracoes, this.grupoId);
	}

	// Sem observador do vault de propósito: esta view não mostra mais nada que venha do vault, e
	// redesenhar a cada mudança de arquivo apagaria o que ela estivesse digitando no meio da captura.
	async onOpen() {
		this.renderizar();
	}

	// Chamada por salvarConfiguracoes: mudar os campos/presets em Configurações precisa aparecer aqui
	// na hora. Sem isso a sidebar mostra a configuração de quando foi aberta (ver redesenharCapturas).
	redesenhar(): void {
		this.renderizar();
	}

	// A barra lateral é SÓ captura — não lista tarefas. São dois blocos empilhados, na ordem do print
	// dela: o do Inbox (captura crua, sem propriedades) e o de demandas (com as pastilhas embaixo do
	// campo). Para VER as tarefas ela usa a Lista em aba, o Kanban ou o Calendário.
	private renderizar(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass("mytasks-sidebar-captura");

		const grupo = this.grupoAtivo();
		const configEfetiva = configDoGrupo(this.plugin.configuracoes, grupo);
		const repositorio = this.plugin.repositorioDoGrupo(grupo.id);

		// Bloco 1 — Inbox: só título e campo. Cai sempre no Inbox (primeira opção de status), que é o
		// comportamento que a captura do Inbox sempre teve.
		this.capturaInbox = new AreaCaptura(container.createDiv(), {
			app: this.app,
			repositorio,
			configuracoes: configEfetiva,
			titulo: "inbox",
			icone: "inbox",
			placeholder: "Adicionar ao Inbox...",
			mostrarCampos: false,
			statusFixo: primeiraOpcaoStatus(configEfetiva.status) ?? "",
			aoCapturar: () => {},
		});
		this.capturaInbox.renderizar();

		// Bloco 2 — demandas: mesmo campo, com as pastilhas de propriedade e os presets embaixo.
		this.capturaDemandas = new AreaCaptura(container.createDiv(), {
			app: this.app,
			repositorio,
			configuracoes: configEfetiva,
			titulo: grupo.nome.toLowerCase(),
			icone: grupo.icone,
			placeholder: `Adicionar em ${grupo.nome}...`,
			mostrarCampos: true,
			aoCapturar: () => {},
		});
		this.capturaDemandas.renderizar();
	}

	async onClose() {
		this.capturaInbox = null;
		this.capturaDemandas = null;
	}
}
