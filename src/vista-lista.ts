import { ItemView, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import type MyTasksPlugin from "./main";
import {
	GrupoTarefas,
	arquivoEhTarefaRelevante,
	configDoGrupo,
	grupoAtivoOuPrimeiro,
	tarefaPertenceAoGrupo,
} from "./tipos";
import { AreaCaptura } from "./area-captura";
import { MotorLista } from "./motor-lista";
import { observarMudancasDoVault } from "./observador-vault";

export const TIPO_VISTA_LISTA = "mytasks-lista";

// A Lista da sidebar tem UMA instância por grupo. O grupo é guardado no view state (grupoId), a forma
// idiomática do Obsidian de distinguir várias leaves do mesmo tipo de view (sobrevive a reinício).
export class VistaLista extends ItemView {
	private motor: MotorLista | null = null;
	private captura: AreaCaptura | null = null;
	private grupoId: string | null = null;
	// Aba visível. "inbox" mostra a caixa de entrada (captura simples + lista do Inbox); "demandas"
	// é a área de captura de novas tarefas, com os campos e presets. Escolha dela.
	private modo: "inbox" | "demandas" = "inbox";

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

	async onOpen() {
		this.renderizar();

		// O observador só interessa ao modo Inbox, que é o único que mostra conteúdo do vault. No modo
		// demandas ele NÃO redesenha: apagaria o que estivesse sendo digitado no meio de uma captura.
		observarMudancasDoVault({
			app: this.app,
			registerEvent: (ref) => this.registerEvent(ref),
			ehRelevante: (caminho) => this.arquivoRelevante(caminho),
			redesenhar: () => {
				if (this.modo === "inbox") this.motor?.renderizar();
			},
		});
	}

	// Chamada por salvarConfiguracoes: mudar os campos/presets em Configurações precisa aparecer aqui
	// na hora. Sem isso a sidebar mostra a configuração de quando foi aberta (ver redesenharCapturas).
	redesenhar(): void {
		this.renderizar();
	}

	// Duas abas: "inbox" (a caixa de entrada de sempre, com a lista) e "demandas" (só a área de
	// captura, com campos e presets). Pra VER as tarefas do grupo ela usa o Kanban, o Calendário ou
	// a Lista em aba — a aba demandas é só de entrada.
	private renderizar(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();

		const grupo = this.grupoAtivo();
		const configEfetiva = configDoGrupo(this.plugin.configuracoes, grupo);
		const repositorio = this.plugin.repositorioDoGrupo(grupo.id);

		this.desenharToggle(container, grupo);

		if (this.modo === "inbox") {
			this.captura = null;
			// O MotorLista desenha o próprio toggle quando `mostrarToggleInbox` está ligado — aqui ele
			// fica DESLIGADO, porque o toggle acima é da view (ele alterna inbox/demandas, não
			// inbox/tarefas). `filtroInbox` prende o motor à caixa de entrada.
			this.motor = new MotorLista(container.createDiv(), {
				app: this.app,
				repositorio,
				configuracoes: configEfetiva,
				modoInicial: "inbox",
				permitirTrocaAgrupamento: false,
				permitirEdicaoFiltro: false,
				filtro: (t) => tarefaPertenceAoGrupo(t, grupo, this.plugin.configuracoes),
			});
			this.motor.renderizar();
			return;
		}

		this.motor = null;
		this.captura = new AreaCaptura(container.createDiv({ cls: "mytasks-sidebar-captura" }), {
			app: this.app,
			repositorio,
			configuracoes: configEfetiva,
			placeholder: `Adicionar em ${grupo.nome}...`,
			mostrarCampos: true,
			aoCapturar: () => {},
		});
		this.captura.renderizar();
	}

	// As duas pastilhas do topo. Mesma casca visual do toggle antigo do MotorLista, pra não mudar a
	// aparência que ela já conhece — o que mudou é o que a segunda aba mostra.
	private desenharToggle(container: HTMLElement, grupo: GrupoTarefas): void {
		const linha = container.createDiv({ cls: "mytasks-cabecalho" });
		const toggle = linha.createDiv({ cls: "mytasks-toggle-inbox" });

		const botaoInbox = toggle.createEl("button", { attr: { "aria-label": "Inbox" } });
		setIcon(botaoInbox, "inbox");
		botaoInbox.toggleClass("mytasks-toggle-ativo", this.modo === "inbox");
		botaoInbox.addEventListener("click", () => {
			if (this.modo === "inbox") return;
			this.modo = "inbox";
			this.renderizar();
		});

		const botaoDemandas = toggle.createEl("button", { text: grupo.nome });
		botaoDemandas.toggleClass("mytasks-toggle-ativo", this.modo === "demandas");
		botaoDemandas.addEventListener("click", () => {
			if (this.modo === "demandas") return;
			this.modo = "demandas";
			this.renderizar();
		});
	}

	private arquivoRelevante(caminho: string): boolean {
		return arquivoEhTarefaRelevante(configDoGrupo(this.plugin.configuracoes, this.grupoAtivo()), caminho);
	}

	async onClose() {
		this.motor?.destruir();
		this.motor = null;
		this.captura = null;
	}
}
