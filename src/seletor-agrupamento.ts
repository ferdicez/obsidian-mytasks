import { Menu, setIcon } from "obsidian";
import { ConfiguracoesGestorTarefas, ID_STATUS, TipoAgrupamento } from "./tipos";

export interface OpcoesSeletorAgrupamento {
	configuracoes: ConfiguracoesGestorTarefas;
	agrupamentoAtual: TipoAgrupamento;
	permitirNenhum: boolean;
	permitirDia: boolean;
	aoEscolher: (agrupamento: TipoAgrupamento) => void;
	// Elemento cuja borda esquerda define onde o menu abre (ex: o cabeçalho inteiro, pra descer sempre
	// alinhado com o início da coluna, independente de qual botão foi clicado). Sem isso, usa o próprio botão.
	elementoAlinhamento?: HTMLElement;
}

export function rotuloAgrupamento(agrupamento: TipoAgrupamento, configuracoes: ConfiguracoesGestorTarefas): string {
	if (agrupamento === "nenhum") return "nenhum";
	if (agrupamento === "dia") return "por dia";
	if (agrupamento === ID_STATUS) return configuracoes.status.rotulo || "status";
	return configuracoes.propriedades.find((p) => p.id === agrupamento)?.rotulo ?? agrupamento;
}

export function opcoesDeAgrupamento(
	configuracoes: ConfiguracoesGestorTarefas,
	permitirNenhum: boolean,
	permitirDia: boolean
): TipoAgrupamento[] {
	const lista: TipoAgrupamento[] = [];
	if (permitirNenhum) lista.push("nenhum");
	if (permitirDia) lista.push("dia");
	lista.push(ID_STATUS);
	for (const def of configuracoes.propriedades) {
		if (def.tipo === "selecao") lista.push(def.id);
	}
	return lista;
}

export class SeletorAgrupamento {
	private botao: HTMLButtonElement;
	private agrupamentoAtual: TipoAgrupamento;

	constructor(private container: HTMLElement, private opcoes: OpcoesSeletorAgrupamento) {
		this.agrupamentoAtual = opcoes.agrupamentoAtual;

		this.botao = container.createEl("button", {
			cls: "mytasks-seletor-discreto mytasks-seletor-so-icone",
			attr: { "aria-label": "Agrupamento" },
		});
		const icone = this.botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		setIcon(icone, "layout-grid");
		const chevron = this.botao.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
		setIcon(chevron, "chevrons-up-down");

		this.botao.addEventListener("click", () => this.abrirMenu());
	}

	private opcoesValidas(): TipoAgrupamento[] {
		return opcoesDeAgrupamento(this.opcoes.configuracoes, this.opcoes.permitirNenhum, this.opcoes.permitirDia);
	}

	private abrirMenu(): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		menu.addItem((item) => item.setTitle("selecionar agrupamento").setDisabled(true));
		menu.addSeparator();
		for (const agrupamento of this.opcoesValidas()) {
			menu.addItem((item) =>
				item
					.setTitle(rotuloAgrupamento(agrupamento, this.opcoes.configuracoes))
					.setChecked(agrupamento === this.agrupamentoAtual)
					.onClick(() => {
						this.agrupamentoAtual = agrupamento;
						this.opcoes.aoEscolher(agrupamento);
					})
			);
		}
		const retanguloBotao = this.botao.getBoundingClientRect();
		const x = (this.opcoes.elementoAlinhamento ?? this.botao).getBoundingClientRect().left;
		menu.showAtPosition({ x, y: retanguloBotao.bottom + 4 });
	}
}
