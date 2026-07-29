import { ItemView, TAbstractFile, WorkspaceLeaf } from "obsidian";
import type MyTasksPlugin from "./main";
import { GrupoTarefas, arquivoEhTarefaRelevante, configDoGrupo, grupoAtivoOuPrimeiro, tarefaPertenceAoGrupo } from "./tipos";
import { MotorCalendario } from "./motor-calendario";

export const TIPO_VISTA_CALENDARIO_ABA = "mytasks-calendario-aba";

export class VistaCalendarioAba extends ItemView {
	private motor: MotorCalendario | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MyTasksPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_CALENDARIO_ABA;
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
		container.addClass("mytasks-container-aba");

		const grupo = this.grupoAtivo();
		const configEfetiva = configDoGrupo(this.plugin.configuracoes, grupo);

		this.motor = new MotorCalendario(container, {
			app: this.app,
			repositorio: this.plugin.repositorioDoGrupo(grupo.id),
			configuracoes: configEfetiva,
			// "semana-horarios" é a chave histórica do modo "Dia" (ver tipos.ts).
			modoInicial: "semana-horarios",
			filtroInicialId: configEfetiva.filtroPadraoCalendarioId,
			filtro: (t) => tarefaPertenceAoGrupo(t, grupo, this.plugin.configuracoes),
			configuracoesGlobais: this.plugin.configuracoes,
			grupoAtivoId: grupo.id,
			calendariosExternos: this.plugin.calendariosExternos,
			aoTrocarGrupo: async (grupoId) => {
				this.plugin.configuracoes.grupoAtivoCalendarioId = grupoId;
				await this.plugin.salvarConfiguracoes();
				this.renderizar();
			},
		});
		this.motor.renderizar();

		// Busca em segundo plano ao abrir: desenha na hora com o que está em cache e se redesenha
		// sozinho quando a resposta chegar. Respeita o intervalo configurado (não busca a cada abertura).
		void this.plugin.calendariosExternos.atualizarTodos();
	}

	// Redesenha só a grade, preservando modo/data/filtro que a usuária escolheu. Chamado pelo plugin
	// quando uma agenda externa termina de atualizar.
	redesenhar(): void {
		this.motor?.renderizar();
	}

	private arquivoRelevante(arquivo: TAbstractFile): boolean {
		return arquivoEhTarefaRelevante(configDoGrupo(this.plugin.configuracoes, this.grupoAtivo()), arquivo.path);
	}

	async onClose() {
		this.motor?.destruir();
	}
}
