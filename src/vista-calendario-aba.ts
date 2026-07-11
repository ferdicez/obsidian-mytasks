import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConfiguracoesGestorTarefas, arquivoEhTarefaRelevante } from "./tipos";
import { MotorCalendario } from "./motor-calendario";

export const TIPO_VISTA_CALENDARIO_ABA = "mytasks-calendario-aba";

export class VistaCalendarioAba extends ItemView {
	private motor: MotorCalendario | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private repositorio: RepositorioTarefas,
		private configuracoes: ConfiguracoesGestorTarefas
	) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_CALENDARIO_ABA;
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
		container.addClass("mytasks-container-aba");

		this.motor = new MotorCalendario(container, {
			app: this.app,
			repositorio: this.repositorio,
			configuracoes: this.configuracoes,
			modoInicial: "semana-kanban",
			filtroInicialId: this.configuracoes.filtroPadraoCalendarioId,
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
