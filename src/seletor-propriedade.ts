import { AbstractInputSuggest, App, setIcon } from "obsidian";
import { TipoPropriedade } from "./tipos";

export type TipoPropriedadeFiltro = TipoPropriedade | "status";

export interface OpcaoPropriedade {
	id: string;
	rotulo: string;
	tipo: TipoPropriedadeFiltro;
}

const ICONE_POR_TIPO: Record<TipoPropriedadeFiltro, string> = {
	status: "list-checks",
	selecao: "list",
	texto: "text",
	data: "calendar",
	link_arquivo: "link",
	lista: "tags",
};

// Dropdown buscável de propriedade (status/prazo/propriedades customizadas), com ícone do tipo — usado
// no construtor de filtro pra trocar a propriedade de uma condição depois de criada (antes era um rótulo
// fixo). Modelado em SugestorArquivos (mesmo padrão de AbstractInputSuggest já usado no plugin).
export class SeletorPropriedade extends AbstractInputSuggest<OpcaoPropriedade> {
	constructor(
		app: App,
		private inputEl: HTMLInputElement,
		private opcoesDisponiveis: OpcaoPropriedade[],
		private aoSelecionar: (opcao: OpcaoPropriedade) => void
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): OpcaoPropriedade[] {
		const q = query.toLowerCase();
		return this.opcoesDisponiveis.filter((o) => o.rotulo.toLowerCase().includes(q));
	}

	renderSuggestion(opcao: OpcaoPropriedade, el: HTMLElement): void {
		el.addClass("mytasks-seletor-propriedade-item");
		const icone = el.createSpan({ cls: "mytasks-seletor-propriedade-icone" });
		setIcon(icone, ICONE_POR_TIPO[opcao.tipo]);
		el.createSpan({ text: opcao.rotulo });
	}

	selectSuggestion(opcao: OpcaoPropriedade): void {
		this.setValue(opcao.rotulo);
		this.aoSelecionar(opcao);
		this.close();
	}
}
