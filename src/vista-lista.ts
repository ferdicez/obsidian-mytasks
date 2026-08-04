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

		// O toggle vive DENTRO do mesmo container do conteúdo, e não solto acima dele: é
		// `.mytasks-container` que carrega o padding lateral da sidebar (8px 12px). Com o toggle fora,
		// ele encostava na borda enquanto a lista respirava — o desalinhamento que ela viu.
		if (this.modo === "inbox") {
			this.captura = null;
			// O MotorLista desenha o próprio toggle quando `mostrarToggleInbox` está ligado — aqui ele
			// fica DESLIGADO, porque o toggle é da view (alterna inbox/demandas, não inbox/tarefas).
			// `modoInicial` prende o motor à caixa de entrada.
			this.motor = new MotorLista(container, {
				app: this.app,
				repositorio,
				configuracoes: configEfetiva,
				modoInicial: "inbox",
				permitirTrocaAgrupamento: false,
				permitirEdicaoFiltro: false,
				filtro: (t) => tarefaPertenceAoGrupo(t, grupo, this.plugin.configuracoes),
				// Desenhado pelo motor no lugar do toggle antigo, na PRIMEIRA linha do cabeçalho —
				// assim o espaçamento é exatamente o de antes, em vez de uma linha extra por fora.
				aoDesenharCabecalho: (cabecalho) => this.desenharToggle(cabecalho, grupo),
			});
			this.motor.renderizar();
			return;
		}

		// Mesma árvore que o MotorLista monta no modo Inbox, pros dois ficarem idênticos: o container
		// com o padding da sidebar, o toggle numa linha `.mytasks-cabecalho`, e o campo de captura
		// numa SEGUNDA linha `.mytasks-cabecalho` (é ela que dá a altura e a largura do input lá).
		this.motor = null;
		container.addClass("mytasks-container");
		this.desenharToggle(container.createDiv({ cls: "mytasks-cabecalho" }), grupo);

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

	// As duas pastilhas do topo, desenhadas DENTRO da linha de cabeçalho que o motor (ou a área de
	// captura) já cria — mesma casca visual do toggle antigo do MotorLista, pra não mudar a aparência
	// que ela já conhece. O que mudou é o que a segunda aba mostra.
	private desenharToggle(linha: HTMLElement, grupo: GrupoTarefas): void {
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

		// Botão "+" no canto direito da MESMA linha das pastilhas, só no modo demandas — no Inbox o
		// Enter continua sendo o único caminho, como ela pediu. `mousedown` com preventDefault em vez
		// de `click`: o clique tira o foco do input antes de disparar, e um campo de valor em edição
		// (busca de arquivo, texto livre) fecharia pelo blur sem ter gravado.
		//
		// É uma DIV com role="button", não um <button>: o tema estiliza `button` na sidebar com regras
		// que venciam tudo aqui — o botão saía cinza, sem ícone e com altura própria, e nem !important
		// resolvia de forma confiável. Numa div não existe essa disputa. O toggle ao lado escapa porque
		// os botões dele estão sob `.mytasks-toggle-inbox button`, seletor mais específico.
		//
		// O "+" é TEXTO, não `setIcon`: o svg do Lucide saiu invisível aqui pelo mesmo motivo.
		if (this.modo === "demandas") {
			const botaoAdicionar = linha.createDiv({
				cls: "mytasks-captura-adicionar",
				text: "+",
				attr: { role: "button", tabindex: "0", "aria-label": "Adicionar tarefa" },
			});
			botaoAdicionar.addEventListener("mousedown", (evento) => {
				evento.preventDefault();
				this.captura?.capturarAgora();
			});
			// Uma div com role="button" não dispara por teclado sozinha, diferente de um <button>.
			botaoAdicionar.addEventListener("keydown", (evento) => {
				if (evento.key !== "Enter" && evento.key !== " ") return;
				evento.preventDefault();
				this.captura?.capturarAgora();
			});
		}
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
