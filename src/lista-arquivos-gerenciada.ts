import { App, Setting, TFile } from "obsidian";
import { SugestorArquivos } from "./sugestor-arquivos";

export interface OpcoesListaArquivosGerenciada {
	aoMudar: (caminhos: string[]) => void;
}

// Gerencia a lista fixa de arquivos de uma propriedade "link para arquivo" (Configurações). Quando essa
// lista tem pelo menos 1 item, o campo vira um dropdown restrito a ela ao criar/editar tarefa — em vez
// de precisar buscar o arquivo toda vez.
export class ListaArquivosGerenciada {
	private caminhos: string[];

	constructor(private app: App, private container: HTMLElement, caminhosIniciais: string[], private config: OpcoesListaArquivosGerenciada) {
		this.caminhos = [...caminhosIniciais];
		this.renderizar();
	}

	private renderizar(): void {
		this.container.empty();
		const caixa = this.container.createDiv({ cls: "mytasks-cores-caixa" });

		this.caminhos.forEach((caminho, indice) => {
			const arquivo = this.app.vault.getAbstractFileByPath(caminho);
			const rotulo = arquivo?.name.replace(/\.md$/, "") ?? caminho;
			new Setting(caixa)
				.setClass("mytasks-cor-linha")
				.setName(rotulo)
				.setDesc(caminho)
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Remover")
						.onClick(() => {
							this.caminhos.splice(indice, 1);
							this.config.aoMudar(this.caminhos);
							this.renderizar();
						})
				);
		});

		new Setting(caixa).addSearch((search) => {
			search.setPlaceholder("Buscar arquivo para adicionar…");
			new SugestorArquivos(this.app, search.inputEl, (arquivo: TFile) => {
				if (!this.caminhos.includes(arquivo.path)) {
					this.caminhos.push(arquivo.path);
					this.config.aoMudar(this.caminhos);
					this.renderizar();
				}
				search.setValue("");
			});
		});
	}

	obterCaminhos(): string[] {
		return this.caminhos;
	}
}
