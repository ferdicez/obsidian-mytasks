import { ItemView, WorkspaceLeaf } from "obsidian";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConfiguracoesGestorTarefas } from "./tipos";
import { MotorCalendario } from "./motor-calendario";

export const TIPO_VISTA_CALENDARIO_SIDEBAR = "mytasks-calendario-sidebar";

export class VistaCalendarioSidebar extends ItemView {
	private motor: MotorCalendario | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private repositorio: RepositorioTarefas,
		private configuracoes: ConfiguracoesGestorTarefas
	) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_CALENDARIO_SIDEBAR;
	}

	getDisplayText(): string {
		return "Calendário de tarefas";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mytasks-container");

		this.motor = new MotorCalendario(container, {
			app: this.app,
			repositorio: this.repositorio,
			configuracoes: this.configuracoes,
			modoInicial: "semana-kanban",
			filtroInicialId: this.configuracoes.filtroPadraoCalendarioId,
		});
		this.motor.renderizar();
	}

	async onClose() {
		this.motor?.destruir();
	}
}
