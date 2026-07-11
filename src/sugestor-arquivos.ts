import { AbstractInputSuggest, App, TFile } from "obsidian";

export class SugestorArquivos extends AbstractInputSuggest<TFile> {
	constructor(app: App, private inputEl: HTMLInputElement, private aoSelecionar: (arquivo: TFile) => void) {
		super(app, inputEl);
		this.inputEl.addEventListener("input", () => this.aoDigitar());
	}

	private aoDigitar(): void {
		if (!this.inputEl.value.endsWith("[[")) return;
		this.inputEl.value = "";
		this.open();
	}

	getSuggestions(query: string): TFile[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.toLowerCase().includes(q))
			.slice(0, 50);
	}

	renderSuggestion(arquivo: TFile, el: HTMLElement): void {
		el.setText(arquivo.path);
	}

	selectSuggestion(arquivo: TFile): void {
		this.setValue(arquivo.basename);
		this.aoSelecionar(arquivo);
		this.close();
	}
}
