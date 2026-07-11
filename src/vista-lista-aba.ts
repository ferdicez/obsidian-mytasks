import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConfiguracoesGestorTarefas, arquivoEhTarefaRelevante } from "./tipos";
import { MotorLista } from "./motor-lista";

export const TIPO_VISTA_LISTA_ABA = "mytasks-lista-aba";

export class VistaListaAba extends ItemView {
	private motor: MotorLista | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private repositorio: RepositorioTarefas,
		private configuracoes: ConfiguracoesGestorTarefas
	) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_LISTA_ABA;
	}

	getDisplayText(): string {
		return "Lista de tarefas";
	}

	getIcon(): string {
		return "check-square";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mytasks-container-aba");

		this.motor = new MotorLista(container, {
			app: this.app,
			repositorio: this.repositorio,
			configuracoes: this.configuracoes,
			mostrarToggleInbox: true,
			agrupamentoInicial: this.configuracoes.agrupamentoPadraoLista,
			filtroInicialId: this.configuracoes.filtroPadraoListaId,
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
