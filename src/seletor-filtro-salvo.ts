import { Menu, setIcon } from "obsidian";
import { CondicaoFiltro, ConfigEfetivaGrupo } from "./tipos";

export interface OpcoesSeletorFiltroSalvo {
	configuracoes: ConfigEfetivaGrupo;
	filtroAtualId: string | null;
	aoEscolher: (filtroId: string | null, condicoes: CondicaoFiltro[]) => void;
	// Restringe as opções do menu a estes IDs (ex: "filtro móvel" de uma visualização embutida). Sem isso, mostra todos os Filtros salvos.
	restringirAIds?: string[];
	// Elemento cuja borda esquerda define onde o menu abre (ex: o cabeçalho inteiro, pra descer sempre
	// alinhado com o início da coluna, independente de qual botão foi clicado). Sem isso, usa o próprio botão.
	elementoAlinhamento?: HTMLElement;
}

export class SeletorFiltroSalvo {
	private botao: HTMLButtonElement;
	private filtroAtualId: string | null;

	constructor(private container: HTMLElement, private opcoes: OpcoesSeletorFiltroSalvo) {
		this.filtroAtualId = opcoes.filtroAtualId;

		this.botao = container.createEl("button", {
			cls: "mytasks-seletor-discreto mytasks-seletor-so-icone",
			attr: { "aria-label": "Filtro" },
		});
		const icone = this.botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		setIcon(icone, "filter");
		const chevron = this.botao.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
		setIcon(chevron, "chevrons-up-down");

		this.botao.addEventListener("click", () => this.abrirMenu());
	}

	private opcoesDisponiveis() {
		const { filtrosSalvos } = this.opcoes.configuracoes;
		if (!this.opcoes.restringirAIds) return filtrosSalvos;
		return filtrosSalvos.filter((f) => this.opcoes.restringirAIds!.includes(f.id));
	}

	private abrirMenu(): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		menu.addItem((item) => item.setTitle("selecionar filtro").setDisabled(true));
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("nenhum")
				.setChecked(this.filtroAtualId === null)
				.onClick(() => {
					this.filtroAtualId = null;
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
						this.opcoes.aoEscolher(filtro.id, filtro.condicoes.map((c) => ({ ...c, valores: [...c.valores] })));
					})
			);
		}
		const retanguloBotao = this.botao.getBoundingClientRect();
		const x = (this.opcoes.elementoAlinhamento ?? this.botao).getBoundingClientRect().left;
		menu.showAtPosition({ x, y: retanguloBotao.bottom + 4 });
	}
}
