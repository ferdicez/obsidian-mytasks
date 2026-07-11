import { Menu, setIcon } from "obsidian";
import { ConfiguracoesGestorTarefas, ID_STATUS, TipoAgrupamento } from "./tipos";

export interface OpcoesSeletorAgrupamento {
	configuracoes: ConfiguracoesGestorTarefas;
	agrupamentoAtual: TipoAgrupamento;
	permitirNenhum: boolean;
	permitirDia: boolean;
	aoEscolher: (agrupamento: TipoAgrupamento) => void;
}

export function rotuloAgrupamento(agrupamento: TipoAgrupamento, configuracoes: ConfiguracoesGestorTarefas): string {
	if (agrupamento === "nenhum") return "nenhum";
	if (agrupamento === "dia") return "por dia";
	if (agrupamento === ID_STATUS) return configuracoes.status.rotulo || "status";
	return configuracoes.propriedades.find((p) => p.id === agrupamento)?.rotulo ?? agrupamento;
}

export class SeletorAgrupamento {
	private botaoTexto: HTMLElement;
	private agrupamentoAtual: TipoAgrupamento;

	constructor(private container: HTMLElement, private opcoes: OpcoesSeletorAgrupamento) {
		this.agrupamentoAtual = opcoes.agrupamentoAtual;

		const botao = container.createEl("button", { cls: "mytasks-seletor-discreto" });
		const icone = botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		setIcon(icone, "layout-grid");
		this.botaoTexto = botao.createSpan({ cls: "mytasks-seletor-discreto-texto" });
		this.atualizarTexto();
		const chevron = botao.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
		setIcon(chevron, "chevrons-up-down");

		botao.addEventListener("click", (evento) => this.abrirMenu(evento));
	}

	private atualizarTexto(): void {
		this.botaoTexto.setText(
			this.agrupamentoAtual === "nenhum" ? "Sem agrupamento" : rotuloAgrupamento(this.agrupamentoAtual, this.opcoes.configuracoes)
		);
	}

	private opcoesValidas(): TipoAgrupamento[] {
		const { configuracoes, permitirNenhum, permitirDia } = this.opcoes;
		const lista: TipoAgrupamento[] = [];
		if (permitirNenhum) lista.push("nenhum");
		if (permitirDia) lista.push("dia");
		lista.push(ID_STATUS);
		for (const def of configuracoes.propriedades) {
			if (def.tipo === "selecao") lista.push(def.id);
		}
		return lista;
	}

	private abrirMenu(evento: MouseEvent): void {
		const menu = new Menu();
		for (const agrupamento of this.opcoesValidas()) {
			menu.addItem((item) =>
				item
					.setTitle(rotuloAgrupamento(agrupamento, this.opcoes.configuracoes))
					.setChecked(agrupamento === this.agrupamentoAtual)
					.onClick(() => {
						this.agrupamentoAtual = agrupamento;
						this.atualizarTexto();
						this.opcoes.aoEscolher(agrupamento);
					})
			);
		}
		menu.showAtMouseEvent(evento);
	}
}
