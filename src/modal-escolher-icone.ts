import { App, Modal, getIconIds, setIcon } from "obsidian";

// Portado do plugin Base Tabs (mesmo motor de busca do Lucide). É uma cópia, e não um import: cada
// plugin é um repositório independente, sem código compartilhado entre eles.

let idsCache: string[] | null = null;

/** Todos os ícones que o Obsidian suporta (Lucide), sem o prefixo "lucide-". */
function todosOsIcones(): string[] {
	if (!idsCache) {
		idsCache = getIconIds().map((id) => (id.startsWith("lucide-") ? id.slice("lucide-".length) : id));
	}
	return idsCache;
}

const MAX_RESULTADOS = 60;

// Mostrados antes de digitar qualquer coisa, pra grade não abrir vazia. São os que mais combinam com
// botões de tarefa (prazo, status, prioridade) — atalho pro caso comum, sem tirar a busca de ninguém.
const SUGESTOES = [
	"sun",
	"calendar",
	"calendar-clock",
	"calendar-x",
	"clock",
	"arrow-right",
	"arrow-up",
	"arrow-down",
	"inbox",
	"check",
	"check-circle",
	"circle-play",
	"pause",
	"flag",
	"star",
	"zap",
	"flame",
	"tag",
	"user",
	"folder",
	"archive",
	"trash",
];

/**
 * Modal com busca + grade de ícones Lucide. Digitar filtra por substring; clicar seleciona e fecha.
 * `aoEscolher(undefined)` limpa o ícone.
 */
export class ModalEscolherIcone extends Modal {
	private inputEl!: HTMLInputElement;
	private resultadosEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private valor: string | undefined;

	constructor(
		app: App,
		private titulo: string,
		valorInicial: string | undefined,
		private aoEscolher: (icone: string | undefined) => void
	) {
		super(app);
		this.valor = valorInicial;
	}

	onOpen(): void {
		this.titleEl.setText(this.titulo);
		const wrap = this.contentEl.createDiv({ cls: "mytasks-icon-picker" });

		const linha = wrap.createDiv({ cls: "mytasks-icon-picker-preview" });
		this.previewEl = linha.createSpan({ cls: "mytasks-icon-picker-preview-icon" });
		this.renderPreview();

		this.inputEl = linha.createEl("input", {
			type: "text",
			placeholder: "Buscar ícone (ex.: calendar, star, check)...",
			cls: "mytasks-icon-picker-search",
		});

		const limpar = linha.createEl("button", { text: "Sem ícone", cls: "mytasks-icon-picker-clear" });
		limpar.addEventListener("click", () => {
			this.valor = undefined;
			this.aoEscolher(undefined);
			this.close();
		});

		this.resultadosEl = wrap.createDiv({ cls: "mytasks-icon-picker-results" });

		this.inputEl.addEventListener("input", () => this.renderResultados(this.inputEl.value.trim().toLowerCase()));
		this.renderResultados("");
		window.setTimeout(() => this.inputEl.focus(), 0);
	}

	private renderPreview(): void {
		this.previewEl.empty();
		if (this.valor) setIcon(this.previewEl, this.valor);
	}

	private renderResultados(query: string): void {
		this.resultadosEl.empty();

		// Sem busca, mostra as sugestões — filtradas contra a lista real do Obsidian, pra que um nome
		// que mude de uma versão do Lucide pra outra apenas suma da grade em vez de virar célula vazia.
		if (!query) {
			const disponiveis = new Set(todosOsIcones());
			this.desenharCelulas(SUGESTOES.filter((id) => disponiveis.has(id)));
			return;
		}

		const matches = todosOsIcones()
			.filter((id) => id.includes(query))
			.slice(0, MAX_RESULTADOS);

		if (matches.length === 0) {
			this.resultadosEl.createEl("p", {
				cls: "setting-item-description",
				text: "Nenhum ícone encontrado.",
			});
			return;
		}

		this.desenharCelulas(matches);
	}

	private desenharCelulas(ids: string[]): void {
		for (const id of ids) {
			const celula = this.resultadosEl.createDiv({ cls: "mytasks-icon-picker-cell", attr: { title: id } });
			setIcon(celula, id);
			if (id === this.valor) celula.addClass("mytasks-icon-picker-cell-ativa");
			celula.addEventListener("click", () => {
				this.valor = id;
				this.aoEscolher(id);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
