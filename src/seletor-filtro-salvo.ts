import { Menu, setIcon } from "obsidian";
import { CondicaoFiltro, ConfiguracoesGestorTarefas } from "./tipos";

export interface OpcoesSeletorFiltroSalvo {
	configuracoes: ConfiguracoesGestorTarefas;
	filtroAtualId: string | null;
	aoEscolher: (filtroId: string | null, condicoes: CondicaoFiltro[]) => void;
	// Restringe as opções do menu a estes IDs (ex: "filtro móvel" de uma visualização embutida). Sem isso, mostra todos os Filtros salvos.
	restringirAIds?: string[];
}

export class SeletorFiltroSalvo {
	private botaoTexto: HTMLElement;
	private filtroAtualId: string | null;

	constructor(private container: HTMLElement, private opcoes: OpcoesSeletorFiltroSalvo) {
		this.filtroAtualId = opcoes.filtroAtualId;

		const botao = container.createEl("button", { cls: "mytasks-seletor-discreto" });
		const icone = botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		setIcon(icone, "filter");
		this.botaoTexto = botao.createSpan({ cls: "mytasks-seletor-discreto-texto" });
		this.atualizarTexto();
		const chevron = botao.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
		setIcon(chevron, "chevrons-up-down");

		botao.addEventListener("click", (evento) => this.abrirMenu(evento));
	}

	private opcoesDisponiveis() {
		const { filtrosSalvos } = this.opcoes.configuracoes;
		if (!this.opcoes.restringirAIds) return filtrosSalvos;
		return filtrosSalvos.filter((f) => this.opcoes.restringirAIds!.includes(f.id));
	}

	private atualizarTexto(): void {
		if (!this.filtroAtualId) {
			this.botaoTexto.setText("Sem filtro");
			return;
		}
		const filtro = this.opcoesDisponiveis().find((f) => f.id === this.filtroAtualId);
		this.botaoTexto.setText(filtro?.nome ?? "Sem filtro");
	}

	private abrirMenu(evento: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("nenhum")
				.setChecked(this.filtroAtualId === null)
				.onClick(() => {
					this.filtroAtualId = null;
					this.atualizarTexto();
					this.opcoes.aoEscolher(null, []);
				})
		);
		for (const filtro of this.opcoesDisponiveis()) {
			menu.addItem((item) =>
				item
					.setTitle(filtro.nome)
					.setChecked(this.filtroAtualId === filtro.id)
					.onClick(() => {
						this.filtroAtualId = filtro.id;
						this.atualizarTexto();
						this.opcoes.aoEscolher(filtro.id, filtro.condicoes.map((c) => ({ ...c, valores: [...c.valores] })));
					})
			);
		}
		menu.showAtMouseEvent(evento);
	}
}
