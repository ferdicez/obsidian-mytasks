import { App, Modal, Setting, setIcon } from "obsidian";

export interface DadosGrupo {
	nome: string;
	valorDiscriminador: string;
	icone: string;
}

// Modal para criar/editar a identidade de um grupo (nome, valor do discriminador, ícone). As demais
// configurações do grupo (status, propriedades, etc.) são editadas nas 5 páginas normais.
export class ModalEditarGrupo extends Modal {
	private dados: DadosGrupo;

	constructor(
		app: App,
		existente: DadosGrupo | null,
		private aoConfirmar: (dados: DadosGrupo) => void | Promise<void>
	) {
		super(app);
		this.dados = existente
			? { ...existente }
			: { nome: "", valorDiscriminador: "", icone: "check-square" };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("mytasks-modal-cards");
		contentEl.createEl("h3", { text: "Grupo de tarefas" });

		new Setting(contentEl)
			.setName("Nome")
			.setDesc("Nome exibido do grupo (ex: Demandas, Conteúdo).")
			.addText((text) =>
				text.setValue(this.dados.nome).onChange((valor) => {
					this.dados.nome = valor;
				})
			);

		new Setting(contentEl)
			.setName("Valor da propriedade")
			.setDesc("Valor do discriminador que identifica as tarefas deste grupo (ex: demanda).")
			.addText((text) =>
				text.setValue(this.dados.valorDiscriminador).onChange((valor) => {
					this.dados.valorDiscriminador = valor.trim();
				})
			);

		let previewIcone: HTMLElement;
		const settingIcone = new Setting(contentEl)
			.setName("Ícone")
			.setDesc("Nome de um ícone Lucide (lucide.dev/icons). Aparece na barra lateral e no seletor de grupo.")
			.addText((text) =>
				text.setValue(this.dados.icone).onChange((valor) => {
					this.dados.icone = valor.trim() || "check-square";
					previewIcone.empty();
					setIcon(previewIcone, this.dados.icone);
				})
			);
		previewIcone = settingIcone.controlEl.createSpan({ cls: "mytasks-config-grupo-icone" });
		setIcon(previewIcone, this.dados.icone);

		new Setting(contentEl).setClass("mytasks-modal-acao").addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(async () => {
					if (!this.dados.nome.trim()) {
						this.dados.nome = "Grupo";
					}
					await this.aoConfirmar(this.dados);
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
