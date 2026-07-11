import { App, Modal, Setting } from "obsidian";
import { CondicaoFiltro, ConfiguracoesGestorTarefas, ID_STATUS, ModoCalendario, ROTULOS_MODO, TipoAgrupamento, TipoView, VisualizacaoSalva } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ConstrutorFiltro } from "./construtor-filtro";

const ROTULOS_TIPO_VIEW: Record<TipoView, string> = {
	lista: "Lista",
	calendario: "Calendário",
	kanban: "Kanban",
};

function gerarId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ModalEditarVisualizacaoSalva extends Modal {
	private nome: string;
	private tipoView: TipoView;
	private condicoes: CondicaoFiltro[];
	private agrupamento: TipoAgrupamento;
	private modoCalendario: ModoCalendario;
	private filtrosExtrasIds: string[];
	private divCodigoEmbed?: HTMLElement;

	constructor(
		app: App,
		private visualizacaoExistente: VisualizacaoSalva | null,
		private configuracoes: ConfiguracoesGestorTarefas,
		private repositorio: RepositorioTarefas,
		private aoSalvar: (visualizacao: VisualizacaoSalva) => void
	) {
		super(app);
		this.nome = visualizacaoExistente?.nome ?? "";
		this.tipoView = visualizacaoExistente?.tipoView ?? "lista";
		this.condicoes = (visualizacaoExistente?.condicoes ?? []).map((c) => ({ ...c, valores: [...c.valores] }));
		this.agrupamento = visualizacaoExistente?.agrupamento ?? (this.tipoView === "kanban" ? ID_STATUS : "nenhum");
		this.modoCalendario = visualizacaoExistente?.modoCalendario ?? "mes";
		this.filtrosExtrasIds = [...(visualizacaoExistente?.filtrosExtrasIds ?? [])];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", {
			text: this.visualizacaoExistente ? "Editar visualização" : "Nova visualização",
		});

		new Setting(contentEl).setName("Nome").addText((text) =>
			text.setValue(this.nome).onChange((valor) => {
				this.nome = valor;
				this.atualizarCodigoEmbed();
			})
		);

		new Setting(contentEl).setName("Tipo de view").addDropdown((dropdown) => {
			for (const chave of Object.keys(ROTULOS_TIPO_VIEW) as TipoView[]) {
				dropdown.addOption(chave, ROTULOS_TIPO_VIEW[chave]);
			}
			dropdown.setValue(this.tipoView).onChange((valor) => {
				this.tipoView = valor as TipoView;
				this.agrupamento = this.tipoView === "kanban" ? ID_STATUS : "nenhum";
				this.modoCalendario = "mes";
				this.renderizarCamposCondicionais(divCondicional);
				this.atualizarCodigoEmbed();
			});
		});

		const divCondicional = contentEl.createDiv();
		this.renderizarCamposCondicionais(divCondicional);

		contentEl.createEl("h3", { text: "Filtro" });
		const divFiltro = contentEl.createDiv();
		new ConstrutorFiltro(divFiltro, {
			app: this.app,
			configuracoes: this.configuracoes,
			repositorio: this.repositorio,
			condicoesIniciais: this.condicoes,
			aoMudar: (condicoes) => (this.condicoes = condicoes),
		});

		if (this.tipoView !== "calendario") {
			contentEl.createEl("h3", { text: "Filtro móvel (opcional)" });
			contentEl.createEl("p", {
				text: "Escolha quais Filtros salvos ficam disponíveis para ligar/desligar na hora, quando esta visualização estiver embutida numa nota — eles se somam ao filtro fixo acima, sem substituí-lo.",
				cls: "setting-item-description",
			});
			this.renderizarFiltrosExtras(contentEl);

			contentEl.createEl("h3", { text: "Código para embutir na nota" });
			this.divCodigoEmbed = contentEl.createEl("pre");
			this.atualizarCodigoEmbed();

			new Setting(contentEl).addButton((btn) =>
				btn.setButtonText("Copiar código").onClick(async () => {
					await navigator.clipboard.writeText(this.gerarCodigoEmbed());
					btn.setButtonText("Copiado!");
					setTimeout(() => btn.setButtonText("Copiar código"), 1500);
				})
			);
		}

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(() => {
					if (!this.nome.trim()) return;
					this.aoSalvar({
						id: this.visualizacaoExistente?.id ?? gerarId(),
						nome: this.nome.trim(),
						tipoView: this.tipoView,
						condicoes: this.condicoes,
						agrupamento: this.tipoView === "calendario" ? undefined : this.agrupamento,
						modoCalendario: this.tipoView === "calendario" ? this.modoCalendario : undefined,
						filtrosExtrasIds: this.tipoView === "calendario" ? undefined : this.filtrosExtrasIds,
					});
					this.close();
				})
		);
	}

	private renderizarCamposCondicionais(container: HTMLElement): void {
		container.empty();

		if (this.tipoView === "calendario") {
			new Setting(container).setName("Modo inicial").addDropdown((dropdown) => {
				for (const chave of Object.keys(ROTULOS_MODO) as ModoCalendario[]) {
					dropdown.addOption(chave, ROTULOS_MODO[chave]);
				}
				dropdown.setValue(this.modoCalendario).onChange((valor) => {
					this.modoCalendario = valor as ModoCalendario;
				});
			});
			return;
		}

		const setting = new Setting(container).setName("Agrupar por");
		setting.addDropdown((dropdown) => {
			if (this.tipoView === "lista") {
				dropdown.addOption("nenhum", "Nenhum");
				dropdown.addOption("dia", "Por dia");
			}
			dropdown.addOption(ID_STATUS, this.configuracoes.status.rotulo || "Status");
			for (const def of this.configuracoes.propriedades) {
				if (def.tipo === "selecao") dropdown.addOption(def.id, def.rotulo);
			}
			dropdown.setValue(this.agrupamento).onChange((valor) => {
				this.agrupamento = valor;
				this.atualizarCodigoEmbed();
			});
		});
	}

	private renderizarFiltrosExtras(container: HTMLElement): void {
		const filtrosSalvos = this.configuracoes.filtrosSalvos;
		if (filtrosSalvos.length === 0) {
			container.createEl("p", {
				text: "Nenhum filtro cadastrado ainda — crie em Configurações → Filtros para poder disponibilizá-lo aqui.",
				cls: "setting-item-description",
			});
			return;
		}

		for (const filtro of filtrosSalvos) {
			new Setting(container).setName(filtro.nome).addToggle((toggle) =>
				toggle.setValue(this.filtrosExtrasIds.includes(filtro.id)).onChange((valor) => {
					if (valor) {
						if (!this.filtrosExtrasIds.includes(filtro.id)) this.filtrosExtrasIds.push(filtro.id);
					} else {
						this.filtrosExtrasIds = this.filtrosExtrasIds.filter((id) => id !== filtro.id);
					}
				})
			);
		}
	}

	private gerarCodigoEmbed(): string {
		const linguagem = this.tipoView === "kanban" ? "mytasks-kanban" : "mytasks-lista";
		const nome = this.nome.trim() || "(nomeie a visualização acima)";
		return "```" + linguagem + "\nview: " + nome + "\n```";
	}

	private atualizarCodigoEmbed(): void {
		if (!this.divCodigoEmbed) return;
		this.divCodigoEmbed.setText(this.gerarCodigoEmbed());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
