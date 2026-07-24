import { App, Modal, Setting } from "obsidian";
import { ConfigEfetivaGrupo, FiltroSalvo, GrupoFiltro, clonarGrupoFiltro, grupoFiltroVazio } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConstrutorFiltro } from "./construtor-filtro";

function gerarId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `filtro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ModalEditarFiltroSalvo extends Modal {
	private nome: string;
	private raiz: GrupoFiltro;

	constructor(
		app: App,
		private filtroExistente: FiltroSalvo | null,
		private configuracoes: ConfigEfetivaGrupo,
		private repositorio: RepositorioTarefas,
		private aoSalvar: (filtro: FiltroSalvo) => void
	) {
		super(app);
		this.nome = filtroExistente?.nome ?? "";
		this.raiz = filtroExistente ? clonarGrupoFiltro(filtroExistente.raiz) : grupoFiltroVazio();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("mytasks-modal-filtro");
		contentEl.addClass("mytasks-modal-cards");
		contentEl.createEl("h2", { text: this.filtroExistente ? "Editar filtro" : "Novo filtro" });

		new Setting(contentEl).setName("Nome").addText((text) =>
			text.setValue(this.nome).onChange((valor) => (this.nome = valor))
		);

		contentEl.createEl("h3", { text: "Condições" });
		const divFiltro = contentEl.createDiv({ cls: "mytasks-construtor-filtro-card" });
		new ConstrutorFiltro(divFiltro, {
			app: this.app,
			configuracoes: this.configuracoes,
			repositorio: this.repositorio,
			raizInicial: this.raiz,
			aoMudar: (raiz) => (this.raiz = raiz),
		});

		new Setting(contentEl).setClass("mytasks-modal-acao").addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(() => {
					if (!this.nome.trim()) return;
					this.aoSalvar({
						id: this.filtroExistente?.id ?? gerarId(),
						nome: this.nome.trim(),
						raiz: this.raiz,
					});
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
