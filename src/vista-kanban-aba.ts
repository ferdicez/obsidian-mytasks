import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConfiguracoesGestorTarefas, arquivoEhTarefaRelevante } from "./tipos";
import { MotorKanban } from "./motor-kanban";

export const TIPO_VISTA_KANBAN_ABA = "mytasks-kanban-aba";

export class VistaKanbanAba extends ItemView {
	private motor: MotorKanban | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private repositorio: RepositorioTarefas,
		private configuracoes: ConfiguracoesGestorTarefas
	) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_KANBAN_ABA;
	}

	getDisplayText(): string {
		return "Kanban de tarefas";
	}

	getIcon(): string {
		return "square-kanban";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mytasks-container-aba");

		this.motor = new MotorKanban(container, {
			app: this.app,
			repositorio: this.repositorio,
			configuracoes: this.configuracoes,
			agrupamentoInicial: this.configuracoes.agrupamentoPadraoKanban,
			filtroInicialId: this.configuracoes.filtroPadraoKanbanId,
		});
		this.motor.renderizar();

		this.registerEvent(
			this.app.metadataCache.on("changed", (arquivo: TAbstractFile) => {
				if (this.arquivoRelevante(arquivo)) this.motor?.renderizar();
			})
		);
	}

	private arquivoRelevante(arquivo: TAbstractFile): boolean {
		return arquivoEhTarefaRelevante(this.configuracoes, arquivo.path);
	}

	async onClose() {
		this.motor?.destruir();
	}
}
