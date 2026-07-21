import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import type MyTasksPlugin from "./main";
import { GrupoTarefas, arquivoEhTarefaRelevante, configDoGrupo, grupoAtivoOuPrimeiro, tarefaPertenceAoGrupo } from "./tipos";
import { MotorKanban } from "./motor-kanban";

export const TIPO_VISTA_KANBAN_ABA = "mytasks-kanban-aba";

export class VistaKanbanAba extends ItemView {
	private motor: MotorKanban | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MyTasksPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_KANBAN_ABA;
	}

	getDisplayText(): string {
		return "kanban de tarefas";
	}

	getIcon(): string {
		return "square-kanban";
	}

	private grupoAtivo(): GrupoTarefas {
		return grupoAtivoOuPrimeiro(this.plugin.configuracoes, this.plugin.configuracoes.grupoAtivoKanbanId);
	}

	async onOpen() {
		this.renderizar();

		this.registerEvent(
			this.app.metadataCache.on("changed", (arquivo: TAbstractFile) => {
				if (this.arquivoRelevante(arquivo)) this.motor?.renderizar();
			})
		);
	}

	private renderizar(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mytasks-container-aba");

		const grupo = this.grupoAtivo();
		const configEfetiva = configDoGrupo(this.plugin.configuracoes, grupo);

		this.motor = new MotorKanban(container, {
			app: this.app,
			repositorio: this.plugin.repositorioDoGrupo(grupo.id),
			configuracoes: configEfetiva,
			agrupamentoInicial: configEfetiva.agrupamentoPadraoKanban,
			filtroInicialId: configEfetiva.filtroPadraoKanbanId,
			filtro: (t) => tarefaPertenceAoGrupo(t, grupo, this.plugin.configuracoes),
			configuracoesGlobais: this.plugin.configuracoes,
			grupoAtivoId: grupo.id,
			aoTrocarGrupo: async (grupoId) => {
				this.plugin.configuracoes.grupoAtivoKanbanId = grupoId;
				await this.plugin.salvarConfiguracoes();
				this.renderizar();
			},
		});
		this.motor.renderizar();
	}

	private arquivoRelevante(arquivo: TAbstractFile): boolean {
		return arquivoEhTarefaRelevante(configDoGrupo(this.plugin.configuracoes, this.grupoAtivo()), arquivo.path);
	}

	async onClose() {
		this.motor?.destruir();
	}
}
