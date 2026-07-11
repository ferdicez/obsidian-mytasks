import { App, Modal, Setting } from "obsidian";
import { OpcaoSelecao, PropriedadeDefinida, TipoPropriedade } from "./tipos";
import { ListaOpcoesGerenciada } from "./lista-opcoes-gerenciada";
import { RepositorioTarefas } from "./repositorio-tarefas";

const ROTULOS_TIPO: Record<TipoPropriedade, string> = {
	texto: "Texto",
	selecao: "Seleção (opções fixas)",
	data: "Data",
	link_arquivo: "Link para arquivo",
	lista: "Lista de tags (várias por tarefa)",
};

function gerarId(rotulo: string): string {
	return rotulo
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export class ModalEditarPropriedade extends Modal {
	private rotulo: string;
	private tipo: TipoPropriedade;
	private opcoes: OpcaoSelecao[];

	constructor(
		app: App,
		private propriedadeExistente: PropriedadeDefinida | null,
		private proximaOrdem: number,
		private aoSalvar: (propriedade: PropriedadeDefinida) => void,
		private repositorio?: RepositorioTarefas
	) {
		super(app);
		this.rotulo = propriedadeExistente?.rotulo ?? "";
		this.tipo = propriedadeExistente?.tipo ?? "texto";
		this.opcoes = (propriedadeExistente?.opcoes ?? []).map((o) => ({ ...o }));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.propriedadeExistente ? "Editar propriedade" : "Nova propriedade" });

		new Setting(contentEl).setName("Nome").addText((text) =>
			text.setValue(this.rotulo).onChange((valor) => (this.rotulo = valor))
		);

		new Setting(contentEl).setName("Tipo").addDropdown((dropdown) => {
			for (const chave of Object.keys(ROTULOS_TIPO) as TipoPropriedade[]) {
				dropdown.addOption(chave, ROTULOS_TIPO[chave]);
			}
			dropdown.setValue(this.tipo).onChange((valor) => {
				this.tipo = valor as TipoPropriedade;
				divOpcoes.toggle(this.tipo === "selecao");
			});
		});

		const divOpcoes = contentEl.createDiv();
		divOpcoes.createEl("p", { text: "Opções", cls: "setting-item-name" });
		const containerLista = divOpcoes.createDiv();
		const propriedadeId = this.propriedadeExistente?.id;
		new ListaOpcoesGerenciada(containerLista, this.opcoes, {
			estaEmUso: (valor) =>
				propriedadeId ? this.repositorio?.valoresUsados(propriedadeId).includes(valor) ?? false : false,
			aoMudar: (opcoes) => (this.opcoes = opcoes),
		});
		divOpcoes.toggle(this.tipo === "selecao");

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(() => {
					if (!this.rotulo.trim()) return;
					const id = this.propriedadeExistente?.id ?? gerarId(this.rotulo);
					if (!id) return;

					this.aoSalvar({
						id,
						rotulo: this.rotulo.trim(),
						tipo: this.tipo,
						ordem: this.propriedadeExistente?.ordem ?? this.proximaOrdem,
						opcoes: this.tipo === "selecao" ? this.opcoes.filter((o) => o.valor.trim()) : undefined,
					});
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
