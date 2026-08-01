import { App, FuzzyMatch, FuzzySuggestModal, getIconIds, setIcon } from "obsidian";

/**
 * Busca de ícones Lucide no estilo da paleta de comandos do Obsidian.
 *
 * Portado do plugin Base Tabs (mesmo motor de busca). É uma cópia, e não um import: cada plugin é
 * um repositório independente, sem código compartilhado entre eles.
 *
 * A busca fuzzy, o ranqueamento, a navegação por teclado e a rolagem virtualizada vêm todos de
 * `FuzzySuggestModal` — por isso a lista pode conter os ~1300 ícones sem corte: só o que está
 * visível é renderizado. (A versão anterior filtrava por substring, cortava em 60 resultados e
 * mostrava uma grade fixa de sugestões enquanto o campo estava vazio.)
 *
 * Aqui os ids são guardados SEM o prefixo `lucide-`, que é o formato já gravado nos botões de ação
 * e o que `setIcon` recebe. Não mudar isso sem migrar os dados salvos.
 */

const SEM_ICONE = "Sem ícone";

let idsCache: string[] | null = null;

/** Todos os ícones que o Obsidian suporta (Lucide), sem o prefixo "lucide-". */
function todosOsIcones(): string[] {
	if (!idsCache) {
		idsCache = getIconIds().map((id) => (id.startsWith("lucide-") ? id.slice("lucide-".length) : id));
	}
	return idsCache;
}

export class ModalEscolherIcone extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private titulo: string,
		private valorInicial: string | undefined,
		private aoEscolher: (icone: string | undefined) => void
	) {
		super(app);
		this.setPlaceholder(`${this.titulo} — busque por nome`);
		this.setInstructions([
			{ command: "↑↓", purpose: "navegar" },
			{ command: "↵", purpose: "escolher" },
			{ command: "esc", purpose: "cancelar" },
		]);
	}

	getItems(): string[] {
		// "Sem ícone" primeiro, e a lista inteira depois — sem slice: o modal só renderiza o visível.
		return [SEM_ICONE, ...todosOsIcones()];
	}

	getItemText(icone: string): string {
		return icone;
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		// Abrir já com o ícone atual no campo mostra onde o botão está antes de trocar.
		if (this.valorInicial) {
			this.inputEl.value = this.valorInicial;
			this.inputEl.trigger("input");
		}
	}

	renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
		el.addClass("mytasks-icon-suggestion");
		const nome = el.createSpan();
		nome.setText(match.item);
		if (match.item === SEM_ICONE) {
			el.addClass("cm-em");
			return;
		}
		setIcon(el.createSpan(), match.item);
	}

	onChooseItem(icone: string): void {
		this.aoEscolher(icone === SEM_ICONE ? undefined : icone);
	}
}
