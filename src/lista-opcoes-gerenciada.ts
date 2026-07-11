import { Setting } from "obsidian";
import { OpcaoSelecao } from "./tipos";

export interface OpcoesListaOpcoesGerenciada {
	aoMudar: (opcoes: OpcaoSelecao[]) => void;
	aoRenomear?: (valorAntigo: string, valorNovo: string) => void;
	estaEmUso?: (valor: string) => boolean;
	rotuloBotaoAdicionar?: string;
	/** Quando true, a primeira e a última opção são fixas: sem mover/excluir, só rótulo e cor editáveis. */
	extremosFixos?: boolean;
	descricaoPrimeira?: string;
	descricaoUltima?: string;
}

export class ListaOpcoesGerenciada {
	private opcoes: OpcaoSelecao[];

	constructor(private container: HTMLElement, opcoesIniciais: OpcaoSelecao[], private config: OpcoesListaOpcoesGerenciada) {
		this.opcoes = opcoesIniciais.map((o) => ({ ...o }));
		this.renderizar();
	}

	private renderizar(): void {
		this.container.empty();
		const caixa = this.container.createDiv({ cls: "mytasks-cores-caixa" });
		const fixos = this.config.extremosFixos ?? false;

		this.opcoes.forEach((opcao, indice) => {
			const ehPrimeira = indice === 0;
			const ehUltima = indice === this.opcoes.length - 1;
			const fixa = fixos && (ehPrimeira || ehUltima);

			const linha = new Setting(caixa).setClass("mytasks-cor-linha");
			if (fixa) {
				const descricao = ehPrimeira ? this.config.descricaoPrimeira : this.config.descricaoUltima;
				if (descricao) linha.setDesc(descricao);
			}

			linha.addText((text) => {
				text.setValue(opcao.valor).onChange((valorNovo) => {
					const valorAntigo = opcao.valor;
					const novo = valorNovo.trim();
					if (!novo || novo === valorAntigo) return;
					opcao.valor = novo;
					this.config.aoRenomear?.(valorAntigo, novo);
					this.config.aoMudar(this.opcoes);
				});
			});

			linha.addColorPicker((picker) =>
				picker.setValue(opcao.cor ?? "#888888").onChange((valor) => {
					opcao.cor = valor;
					this.config.aoMudar(this.opcoes);
				})
			);

			if (!fixa) {
				linha.addExtraButton((btn) =>
					btn
						.setIcon("arrow-up")
						.setTooltip("Mover para cima")
						.setDisabled(indice === (fixos ? 1 : 0))
						.onClick(() => {
							const limite = fixos ? 1 : 0;
							if (indice <= limite) return;
							[this.opcoes[indice - 1], this.opcoes[indice]] = [this.opcoes[indice], this.opcoes[indice - 1]];
							this.config.aoMudar(this.opcoes);
							this.renderizar();
						})
				);
				linha.addExtraButton((btn) =>
					btn
						.setIcon("arrow-down")
						.setTooltip("Mover para baixo")
						.setDisabled(indice === this.opcoes.length - (fixos ? 2 : 1))
						.onClick(() => {
							const limite = this.opcoes.length - (fixos ? 2 : 1);
							if (indice >= limite) return;
							[this.opcoes[indice + 1], this.opcoes[indice]] = [this.opcoes[indice], this.opcoes[indice + 1]];
							this.config.aoMudar(this.opcoes);
							this.renderizar();
						})
				);
				linha.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Remover")
						.onClick(() => {
							const emUso = this.config.estaEmUso?.(opcao.valor) ?? false;
							if (emUso && !confirm(`"${opcao.valor}" está em uso por alguma tarefa. Remover mesmo assim?`)) {
								return;
							}
							this.opcoes.splice(indice, 1);
							this.config.aoMudar(this.opcoes);
							this.renderizar();
						})
				);
			}
		});

		new Setting(caixa).addButton((btn) =>
			btn
				.setButtonText(this.config.rotuloBotaoAdicionar ?? "+ Adicionar opção")
				.setCta()
				.onClick(() => {
					const posicao = fixos ? Math.max(this.opcoes.length - 1, 0) : this.opcoes.length;
					this.opcoes.splice(posicao, 0, { valor: "" });
					this.config.aoMudar(this.opcoes);
					this.renderizar();
				})
		);
	}

	obterOpcoes(): OpcaoSelecao[] {
		return this.opcoes;
	}
}
