import { App, Modal, Setting } from "obsidian";
import { CondicaoFiltro, ConfiguracoesGestorTarefas, FiltroSalvo } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConstrutorFiltro } from "./construtor-filtro";

function gerarId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `filtro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ModalEditarFiltroSalvo extends Modal {
	private nome: string;
	private condicoes: CondicaoFiltro[];

	constructor(
		app: App,
		private filtroExistente: FiltroSalvo | null,
		private configuracoes: ConfiguracoesGestorTarefas,
		private repositorio: RepositorioTarefas,
		private aoSalvar: (filtro: FiltroSalvo) => void
	) {
		super(app);
		this.nome = filtroExistente?.nome ?? "";
		this.condicoes = (filtroExistente?.condicoes ?? []).map((c) => ({ ...c, valores: [...c.valores] }));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("mytasks-modal-filtro");
		contentEl.createEl("h2", { text: this.filtroExistente ? "Editar filtro" : "Novo filtro" });

		new Setting(contentEl).setName("Nome").addText((text) =>
			text.setValue(this.nome).onChange((valor) => (this.nome = valor))
		);

		contentEl.createEl("h3", { text: "Condições" });
		const divFiltro = contentEl.createDiv();
		new ConstrutorFiltro(divFiltro, {
			app: this.app,
			configuracoes: this.configuracoes,
			repositorio: this.repositorio,
			condicoesIniciais: this.condicoes,
			aoMudar: (condicoes) => (this.condicoes = condicoes),
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(() => {
					if (!this.nome.trim()) return;
					this.aoSalvar({
						id: this.filtroExistente?.id ?? gerarId(),
						nome: this.nome.trim(),
						condicoes: this.condicoes,
					});
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
