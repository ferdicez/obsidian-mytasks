import { App, Modal, Setting } from "obsidian";

// Cadastro/edição de uma agenda externa: nome e URL do .ics. Dois campos só — a cor e o
// liga/desliga são editados direto na lista em Configurações.

export interface DadosCalendarioExterno {
	nome: string;
	url: string;
}

export class ModalEditarCalendarioExterno extends Modal {
	private nome: string;
	private url: string;

	constructor(
		app: App,
		existente: DadosCalendarioExterno | null,
		private aoSalvar: (dados: DadosCalendarioExterno) => void | Promise<void>
	) {
		super(app);
		this.nome = existente?.nome ?? "";
		this.url = existente?.url ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("mytasks-modal-cards");
		contentEl.createEl("h3", { text: this.url ? "Editar agenda" : "Adicionar agenda do Google" });

		new Setting(contentEl)
			.setName("Nome")
			.setDesc("Como esta agenda aparece nos detalhes de um compromisso.")
			.addText((text) =>
				text
					.setPlaceholder("Pessoal")
					.setValue(this.nome)
					.onChange((valor) => (this.nome = valor))
			);

		new Setting(contentEl)
			.setName("URL (endereço secreto em formato iCal)")
			.setDesc(
				"Google Agenda → configurações da agenda → Integrar agenda → Endereço secreto em formato iCal. Aceita também o formato webcal://"
			)
			.addText((text) =>
				text
					.setPlaceholder("https://calendar.google.com/calendar/ical/.../basic.ics")
					.setValue(this.url)
					.onChange((valor) => (this.url = valor))
			);

		const acao = new Setting(contentEl);
		acao.setClass("mytasks-modal-acao");
		acao.addButton((btn) =>
			btn
				.setButtonText(this.url ? "Salvar" : "Adicionar")
				.setCta()
				.onClick(async () => {
					const url = this.url.trim();
					if (!url) return;
					await this.aoSalvar({
						// Nome em branco não impede o cadastro: cai num rótulo genérico em vez de barrar.
						nome: this.nome.trim() || "Agenda",
						url,
					});
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
