import { ItemView, TAbstractFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import type MyTasksPlugin from "./main";
import { GrupoTarefas, arquivoEhTarefaRelevante, configDoGrupo, grupoAtivoOuPrimeiro, tarefaPertenceAoGrupo } from "./tipos";
import { MotorLista } from "./motor-lista";

export const TIPO_VISTA_LISTA_ABA = "mytasks-lista-aba";

// Versão em tela cheia da Lista. Também é por grupo (grupoId no view state), mas sem seletor de grupo — o
// comando abre o grupo default (ou o último aberto por essa leaf, restaurado pelo view state).
export class VistaListaAba extends ItemView {
	private motor: MotorLista | null = null;
	private grupoId: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: MyTasksPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TIPO_VISTA_LISTA_ABA;
	}

	getDisplayText(): string {
		return `Lista — ${this.grupoAtivo().nome}`;
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
		if (!container) return;
		container.empty();
		container.addClass("mytasks-container-aba");

		const grupo = this.grupoAtivo();
		const configEfetiva = configDoGrupo(this.plugin.configuracoes, grupo);

		this.motor = new MotorLista(container, {
			app: this.app,
			repositorio: this.plugin.repositorioDoGrupo(grupo.id),
			configuracoes: configEfetiva,
			mostrarToggleInbox: true,
			rotuloModoTarefas: grupo.nome,
			agrupamentoInicial: configEfetiva.agrupamentoPadraoLista,
			filtroInicialId: configEfetiva.filtroPadraoListaId,
			filtro: (t) => tarefaPertenceAoGrupo(t, grupo, this.plugin.configuracoes),
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
