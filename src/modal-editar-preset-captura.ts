import { App, Modal, Setting, TFile, setIcon } from "obsidian";
import {
	AcaoBotao,
	ConfigEfetivaGrupo,
	ID_DATA_ACAO,
	ID_STATUS,
	PresetCaptura,
	PropriedadeDefinida,
} from "./tipos";
import { SugestorArquivos } from "./sugestor-arquivos";
import { ModalEscolherIcone } from "./modal-escolher-icone";

function gerarId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Editor de um preset de captura. É gêmeo do ModalEditarBotaoAcao — a diferença é só o contexto: os
// valores aqui são aplicados na CRIAÇÃO da tarefa, não numa tarefa que já existe. É uma cópia
// consciente, e não um componente compartilhado: os dois editores tendem a divergir (um preset não
// vai ganhar "excluir tarefa", por exemplo), e o acoplamento custaria mais do que a duplicação.
export class ModalEditarPresetCaptura extends Modal {
	private nome: string;
	private icone: string;
	private acoes: AcaoBotao[];

	constructor(
		app: App,
		private presetExistente: PresetCaptura | null,
		private configuracoes: ConfigEfetivaGrupo,
		private aoSalvar: (preset: PresetCaptura) => void
	) {
		super(app);
		this.nome = presetExistente?.nome ?? "";
		this.icone = presetExistente?.icone ?? "";
		// Cópia profunda: sem ela, mexer nos campos aqui dentro editaria o objeto salvo na hora, e
		// fechar o modal no X (sem salvar) deixaria as alterações aplicadas mesmo assim.
		this.acoes = JSON.parse(JSON.stringify(presetExistente?.acoes ?? []));
	}

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
		contentEl.createEl("h2", { text: this.presetExistente ? "Editar preset" : "Novo preset de captura" });

		new Setting(contentEl)
			.setName("Nome do preset")
			.setDesc("É o texto do botão na área de captura da barra lateral.")
			.addText((text) =>
				text
					.setPlaceholder("Ex: Hoje")
					.setValue(this.nome)
					.onChange((valor) => (this.nome = valor))
			);

		this.renderizarCampoIcone(contentEl.createDiv());

		contentEl.createEl("h3", { text: "O que este preset preenche" });
		contentEl.createEl("p", {
			text: "Ao clicar no preset, a tarefa é criada já com estes valores — quantos campos você quiser, de uma vez.",
			cls: "setting-item-description",
		});

		const listaAcoes = contentEl.createDiv();
		this.renderizarAcoes(listaAcoes);

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("+ Adicionar campo").onClick(() => {
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
						id: this.presetExistente?.id ?? gerarId(),
						nome: this.nome.trim(),
						visivel: this.presetExistente?.visivel ?? true,
						icone: this.icone || undefined,
						acoes: this.acoes,
					});
					this.close();
				})
		);
	}

	// O campo do ícone se redesenha sozinho (recebe o próprio container) pra atualizar a prévia depois
	// da escolha, sem reconstruir o modal inteiro — que perderia o nome e os campos já preenchidos.
	private renderizarCampoIcone(container: HTMLElement): void {
		container.empty();

		const setting = new Setting(container).setName("Ícone").setDesc(this.icone || "Nenhum ícone escolhido");

		if (this.icone) {
			setting.settingEl.createDiv({ cls: "mytasks-icone-previa" }, (el) => setIcon(el, this.icone));
		}

		setting.addButton((btn) =>
			btn.setButtonText(this.icone ? "Trocar ícone" : "Escolher ícone").onClick(() => {
				new ModalEscolherIcone(this.app, "Ícone do preset", this.icone || undefined, (novo) => {
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
				text: "Nenhum campo ainda — o preset criaria a tarefa sem preencher nada. Adicione pelo menos um abaixo.",
				cls: "setting-item-description",
			});
			return;
		}

		this.acoes.forEach((acao, indice) => {
			const card = container.createDiv({ cls: "mytasks-acao-botao-card" });

			new Setting(card)
				.setName(`Campo ${indice + 1}`)
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
						.setTooltip("Remover este campo")
						.onClick(() => {
							this.acoes.splice(indice, 1);
							this.renderizarAcoes(container);
						})
				);

			this.renderizarValorDaAcao(card, acao, container);
		});
	}

	private renderizarValorDaAcao(card: HTMLElement, acao: AcaoBotao, containerPai: HTMLElement): void {
		if (acao.campo === ID_DATA_ACAO) {
			// Ação recém-trocada pro prazo nasce como {modo:"fixo"} sem valor, que não é um estado
			// válido aqui. Normaliza o MODELO pra "hoje" — não só o que aparece no dropdown: como
			// setValue() não dispara onChange, mostrar "Hoje" sem corrigir `acao.modo` faria o preset
			// salvo nascer SEM prazo (modo fixo + valor vazio = limpar) em vez de marcar hoje.
			if (acao.modo === "fixo" && !acao.valor) acao.modo = "hoje";

			new Setting(card).setName("Prazo").addDropdown((dropdown) => {
				dropdown.addOption("hoje", "Hoje");
				dropdown.addOption("dias", "Daqui a X dias");
				dropdown.addOption("fixo", "Data fixa");
				dropdown.addOption("limpar", "Sem prazo");
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
					.setDesc("1 = amanhã, 7 = daqui a uma semana.")
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
			new Setting(card).setName("Status").addDropdown((dropdown) => {
				for (const opcao of this.configuracoes.status.opcoes) dropdown.addOption(opcao.valor, opcao.valor);
				// Sem valor salvo, o dropdown já mostraria a primeira opção — assumir esse valor deixa o
				// que está na tela igual ao que será gravado, mesmo se ela salvar sem tocar no campo.
				if (!acao.valor) acao.valor = this.configuracoes.status.opcoes[0]?.valor ?? "";
				dropdown.setValue(acao.valor).onChange((valor) => (acao.valor = valor));
			});
			return;
		}

		const def = this.definicaoDaPropriedade(acao.campo);
		const setting = new Setting(card).setName("Valor");

		if (def?.tipo === "selecao" && (def.opcoes?.length ?? 0) > 0) {
			setting.addDropdown((dropdown) => {
				dropdown.addOption("", "— não preencher —");
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
			.setDesc(def?.tipo === "lista" ? "Separe vários valores com vírgula." : "Deixe vazio para não preencher.")
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
