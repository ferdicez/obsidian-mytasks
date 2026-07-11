import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConfiguracoesGestorTarefas } from "./tipos";
import { MotorLista } from "./motor-lista";

export const TIPO_VISTA_LISTA = "mytasks-lista";

export class VistaLista extends ItemView {
	private motor: MotorLista | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private repositorio: RepositorioTarefas,
		private configuracoes: ConfiguracoesGestorTarefas
	) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_LISTA;
	}

	getDisplayText(): string {
		return "Tarefas";
	}

	getIcon(): string {
		return "check-square";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		this.motor = new MotorLista(container, {
			app: this.app,
			repositorio: this.repositorio,
			configuracoes: this.configuracoes,
			mostrarToggleInbox: true,
		});
		this.motor.renderizar();

		this.registerEvent(
			this.app.metadataCache.on("changed", (arquivo: TAbstractFile) => {
				if (this.arquivoRelevante(arquivo)) this.motor?.renderizar();
			})
		);
	}

	private arquivoRelevante(arquivo: TAbstractFile): boolean {
		const pasta = this.configuracoes.pastaTarefas;
		return arquivo.path.startsWith(pasta + "/") || arquivo.parent?.path === pasta;
	}

	async onClose() {
		this.motor?.destruir();
	}
}
