import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import type MyTasksPlugin from "./main";
import { GrupoTarefas, arquivoEhTarefaRelevante, configDoGrupo, grupoAtivoOuPrimeiro, tarefaPertenceAoGrupo } from "./tipos";
import { MotorCalendario } from "./motor-calendario";

export const TIPO_VISTA_CALENDARIO_SIDEBAR = "mytasks-calendario-sidebar";

export class VistaCalendarioSidebar extends ItemView {
	private motor: MotorCalendario | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MyTasksPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_CALENDARIO_SIDEBAR;
	}

	getDisplayText(): string {
		return "calendário de tarefas";
	}

	getIcon(): string {
		return "calendar-days";
	}

	private grupoAtivo(): GrupoTarefas {
		return grupoAtivoOuPrimeiro(this.plugin.configuracoes, this.plugin.configuracoes.grupoAtivoCalendarioId);
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
		container.addClass("mytasks-container");

		const grupo = this.grupoAtivo();
		const configEfetiva = configDoGrupo(this.plugin.configuracoes, grupo);

		this.motor = new MotorCalendario(container, {
			app: this.app,
			repositorio: this.plugin.repositorioDoGrupo(grupo.id),
			configuracoes: configEfetiva,
			modoInicial: "semana-kanban",
			filtroInicialId: configEfetiva.filtroPadraoCalendarioId,
			filtro: (t) => tarefaPertenceAoGrupo(t, grupo, this.plugin.configuracoes),
			configuracoesGlobais: this.plugin.configuracoes,
			grupoAtivoId: grupo.id,
			aoTrocarGrupo: async (grupoId) => {
				this.plugin.configuracoes.grupoAtivoCalendarioId = grupoId;
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
