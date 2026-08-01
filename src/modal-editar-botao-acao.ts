import { App, Modal, Setting, TFile, setIcon } from "obsidian";
import {
	AcaoBotao,
	BotaoAcao,
	ConfigEfetivaGrupo,
	ID_DATA_ACAO,
	ID_STATUS,
	PropriedadeDefinida,
} from "./tipos";
import { SugestorArquivos } from "./sugestor-arquivos";
import { ModalEscolherIcone } from "./modal-escolher-icone";

function gerarId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `botao_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ModalEditarBotaoAcao extends Modal {
	private nome: string;
	private icone: string;
	private acoes: AcaoBotao[];

	constructor(
		app: App,
		private botaoExistente: BotaoAcao | null,
		private configuracoes: ConfigEfetivaGrupo,
		private aoSalvar: (botao: BotaoAcao) => void
	) {
		super(app);
		this.nome = botaoExistente?.nome ?? "";
		this.icone = botaoExistente?.icone ?? "";
		// Cópia profunda: sem ela, mexer nos campos aqui dentro editaria o objeto salvo na hora, e
		// fechar o modal no X (sem salvar) deixaria as alterações aplicadas mesmo assim.
		this.acoes = JSON.parse(JSON.stringify(botaoExistente?.acoes ?? []));
	}

	// Campos que um botão pode alterar: os dois fixos + as propriedades customizadas do grupo.
	private camposDisponiveis(): { id: string; rotulo: string }[] {
		return [
			{ id: ID_STATUS, rotulo: this.configuracoes.status.rotulo || "Status" },
			{ id: ID_DATA_ACAO, rotulo: this.configuracoes.dataTarefa.rotulo || "Prazo" },
			...this.configuracoes.propriedades.map((p) => ({ id: p.id, rotulo: p.rotulo })),
		];
	}

	private definicaoDaPropriedade(campoId: string): PropriedadeDefinida | undefined {
		return this.configuracoes.propriedades.find((p) => p.id === campoId);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("mytasks-modal-cards");
		contentEl.createEl("h2", { text: this.botaoExistente ? "Editar botão" : "Novo botão" });

		new Setting(contentEl)
			.setName("Nome do botão")
			.setDesc("É o texto que aparece no menu do clique direito.")
			.addText((text) =>
				text
					.setPlaceholder("Ex: Fazer hoje")
					.setValue(this.nome)
					.onChange((valor) => (this.nome = valor))
			);

		this.renderizarCampoIcone(contentEl.createDiv());

		contentEl.createEl("h3", { text: "O que este botão faz" });
		contentEl.createEl("p", {
			text: "Um botão pode alterar quantos campos você quiser — todos de uma vez, num clique só.",
			cls: "setting-item-description",
		});

		const listaAcoes = contentEl.createDiv();
		this.renderizarAcoes(listaAcoes);

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("+ Adicionar ação").onClick(() => {
				this.acoes.push({ campo: ID_STATUS, modo: "fixo", valor: "" });
				this.renderizarAcoes(listaAcoes);
			})
		);

		new Setting(contentEl).setClass("mytasks-modal-acao").addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(() => {
					if (!this.nome.trim()) return;
					this.aoSalvar({
						id: this.botaoExistente?.id ?? gerarId(),
						nome: this.nome.trim(),
						visivel: this.botaoExistente?.visivel ?? true,
						icone: this.icone || undefined,
						acoes: this.acoes,
					});
					this.close();
				})
		);
	}

	// O campo do ícone se redesenha sozinho (recebe o próprio container) pra atualizar a prévia depois
	// da escolha, sem reconstruir o modal inteiro — que perderia o nome e as ações já preenchidos.
	private renderizarCampoIcone(container: HTMLElement): void {
		container.empty();

		const setting = new Setting(container).setName("Ícone").setDesc(this.icone || "Nenhum ícone escolhido");

		// Prévia do ícone atual, à esquerda dos botões, pra ela ver o que escolheu sem fechar o modal.
		if (this.icone) {
			setting.settingEl.createDiv({ cls: "mytasks-icone-previa" }, (el) => setIcon(el, this.icone));
		}

		setting.addButton((btn) =>
			btn.setButtonText(this.icone ? "Trocar ícone" : "Escolher ícone").onClick(() => {
				new ModalEscolherIcone(this.app, "Ícone do botão", this.icone || undefined, (novo) => {
					this.icone = novo ?? "";
					this.renderizarCampoIcone(container);
				}).open();
			})
		);

		if (this.icone) {
			setting.addExtraButton((btn) =>
				btn
					.setIcon("x")
					.setTooltip("Tirar o ícone")
					.onClick(() => {
						this.icone = "";
						this.renderizarCampoIcone(container);
					})
			);
		}
	}

	private renderizarAcoes(container: HTMLElement): void {
		container.empty();

		if (this.acoes.length === 0) {
			container.createEl("p", {
				text: "Nenhuma ação ainda — o botão não faria nada. Adicione pelo menos uma abaixo.",
				cls: "setting-item-description",
			});
			return;
		}

		this.acoes.forEach((acao, indice) => {
			const card = container.createDiv({ cls: "mytasks-acao-botao-card" });

			new Setting(card)
				.setName(`Ação ${indice + 1}`)
				.addDropdown((dropdown) => {
					for (const campo of this.camposDisponiveis()) dropdown.addOption(campo.id, campo.rotulo);
					dropdown.setValue(acao.campo).onChange((valor) => {
						acao.campo = valor;
						// O valor anterior era de OUTRO campo (um status onde agora se espera uma data,
						// por exemplo). Zera pra não gravar lixo, e o modo volta pro padrão do campo novo.
						acao.modo = "fixo";
						delete acao.valor;
						delete acao.dias;
						this.renderizarAcoes(container);
					});
				})
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Remover esta ação")
						.onClick(() => {
							this.acoes.splice(indice, 1);
							this.renderizarAcoes(container);
						})
				);

			this.renderizarValorDaAcao(card, acao, container);
		});
	}

	// O editor do VALOR muda conforme o campo escolhido: o prazo ganha os modos relativos (hoje /
	// daqui a X dias / limpar), uma propriedade de seleção vira dropdown das opções cadastradas, e o
	// resto é digitado à mão — que foi exatamente o que ela pediu.
	private renderizarValorDaAcao(card: HTMLElement, acao: AcaoBotao, containerPai: HTMLElement): void {
		if (acao.campo === ID_DATA_ACAO) {
			// Ação recém-trocada pro prazo nasce como {modo:"fixo"} sem valor, que não é um estado
			// válido aqui. Normaliza o MODELO pra "hoje" — não só o que aparece no dropdown: como
			// setValue() não dispara onChange, mostrar "Hoje" sem corrigir `acao.modo` faria o botão
			// salvo APAGAR o prazo (modo fixo + valor vazio = limpar) em vez de marcar hoje.
			if (acao.modo === "fixo" && !acao.valor) acao.modo = "hoje";

			new Setting(card).setName("Novo prazo").addDropdown((dropdown) => {
				dropdown.addOption("hoje", "Hoje");
				dropdown.addOption("dias", "Daqui a X dias");
				dropdown.addOption("fixo", "Data fixa");
				dropdown.addOption("limpar", "Tirar o prazo (sem data)");
				dropdown.setValue(acao.modo);
				dropdown.onChange((valor) => {
					acao.modo = valor as AcaoBotao["modo"];
					if (acao.modo === "dias" && acao.dias === undefined) acao.dias = 1;
					this.renderizarAcoes(containerPai);
				});
			});

			if (acao.modo === "dias") {
				new Setting(card)
					.setName("Quantos dias a partir de hoje")
					.setDesc("1 = amanhã, 7 = daqui a uma semana. Aceita número negativo para trazer a tarefa para trás.")
					.addText((text) => {
						text.inputEl.type = "number";
						text.setValue(String(acao.dias ?? 1)).onChange((valor) => {
							const numero = Number(valor);
							acao.dias = Number.isFinite(numero) ? numero : 0;
						});
					});
			}

			if (acao.modo === "fixo") {
				new Setting(card).setName("Data").addText((text) => {
					text.inputEl.type = "date";
					text.setValue(acao.valor ?? "").onChange((valor) => (acao.valor = valor));
				});
			}
			return;
		}

		if (acao.campo === ID_STATUS) {
			new Setting(card).setName("Novo status").addDropdown((dropdown) => {
				for (const opcao of this.configuracoes.status.opcoes) dropdown.addOption(opcao.valor, opcao.valor);
				// Sem valor salvo, o dropdown já mostraria a primeira opção — assumir esse valor deixa o
				// que está na tela igual ao que será gravado, mesmo se ela salvar sem tocar no campo.
				if (!acao.valor) acao.valor = this.configuracoes.status.opcoes[0]?.valor ?? "";
				dropdown.setValue(acao.valor).onChange((valor) => (acao.valor = valor));
			});
			return;
		}

		const def = this.definicaoDaPropriedade(acao.campo);
		const setting = new Setting(card).setName("Novo valor");

		if (def?.tipo === "selecao" && (def.opcoes?.length ?? 0) > 0) {
			setting.addDropdown((dropdown) => {
				dropdown.addOption("", "— limpar o valor —");
				for (const opcao of def.opcoes ?? []) dropdown.addOption(opcao.valor, opcao.valor);
				dropdown.setValue(acao.valor ?? "");
				dropdown.onChange((valor) => {
					acao.valor = valor;
					acao.modo = valor ? "fixo" : "limpar";
				});
			});
			return;
		}

		if (def?.tipo === "data") {
			setting.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(acao.valor ?? "").onChange((valor) => {
					acao.valor = valor;
					acao.modo = valor ? "fixo" : "limpar";
				});
			});
			return;
		}

		if (def?.tipo === "link_arquivo") {
			setting.addSearch((search) => {
				search.setPlaceholder("Buscar nota...");
				if (acao.valor) {
					const arquivo = this.app.vault.getAbstractFileByPath(acao.valor);
					if (arquivo) search.setValue(arquivo.name.replace(/\.md$/, ""));
				}
				new SugestorArquivos(this.app, search.inputEl, (arquivo: TFile) => {
					acao.valor = arquivo.path;
					acao.modo = "fixo";
				});
				search.inputEl.addEventListener("input", () => {
					if (!search.inputEl.value) {
						acao.valor = "";
						acao.modo = "limpar";
					}
				});
			});
			return;
		}

		// texto e lista: digitado à mão. Em lista, vírgulas viram itens separados.
		setting
			.setDesc(def?.tipo === "lista" ? "Separe vários valores com vírgula. Deixe vazio para limpar o campo." : "Deixe vazio para limpar o campo.")
			.addText((text) => {
				text.setValue(acao.valor ?? "").onChange((valor) => {
					acao.valor = valor;
					acao.modo = valor ? "fixo" : "limpar";
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
