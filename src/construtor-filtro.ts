import { App, Menu, Setting, TFile } from "obsidian";
import {
	AncoraPeriodo,
	CombinacaoPeriodos,
	CondicaoFiltro,
	ConfiguracoesGestorTarefas,
	ID_STATUS,
	OperadorPeriodo,
	PeriodoFiltro,
	periodosDaCondicao,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { CampoTags } from "./campo-tags";
import { SugestorArquivos } from "./sugestor-arquivos";
import { ID_DATA } from "./render-tarefa";

const ROTULOS_OPERADOR_PERIODO: Record<OperadorPeriodo, string> = {
	antes: "antes de",
	depois: "depois de",
	"referente-a": "referente a",
};

const ANCORAS_POR_OPERADOR: Record<OperadorPeriodo, { valor: AncoraPeriodo; rotulo: string }[]> = {
	antes: [
		{ valor: "hoje", rotulo: "hoje" },
		{ valor: "amanha", rotulo: "amanhã" },
		{ valor: "ontem", rotulo: "ontem" },
		{ valor: "dia-especifico", rotulo: "dia específico" },
	],
	depois: [
		{ valor: "hoje", rotulo: "hoje" },
		{ valor: "amanha", rotulo: "amanhã" },
		{ valor: "ontem", rotulo: "ontem" },
		{ valor: "dia-especifico", rotulo: "dia específico" },
	],
	"referente-a": [
		{ valor: "hoje", rotulo: "hoje" },
		{ valor: "esta-semana", rotulo: "esta semana" },
		{ valor: "este-mes", rotulo: "este mês" },
		{ valor: "proximos-dias", rotulo: "próximos dias" },
		{ valor: "proximo-mes", rotulo: "próximo mês" },
		{ valor: "ultimos-dias", rotulo: "últimos dias" },
		{ valor: "ultimo-mes", rotulo: "último mês" },
	],
};

export interface OpcoesConstrutorFiltro {
	app: App;
	configuracoes: ConfiguracoesGestorTarefas;
	repositorio: RepositorioTarefas;
	condicoesIniciais: CondicaoFiltro[];
	aoMudar: (condicoes: CondicaoFiltro[]) => void;
}

export class ConstrutorFiltro {
	private condicoes: CondicaoFiltro[];
	private containerLinhas: HTMLElement;

	constructor(private container: HTMLElement, private opcoes: OpcoesConstrutorFiltro) {
		this.condicoes = opcoes.condicoesIniciais.map((c) => ({ ...c, valores: [...c.valores] }));

		const wrapper = container.createDiv({ cls: "mytasks-construtor-filtro" });
		this.containerLinhas = wrapper.createDiv({ cls: "mytasks-construtor-filtro-linhas" });
		this.renderizarLinhas();

		new Setting(wrapper).addButton((btn) =>
			btn
				.setButtonText("+ Adicionar filtro")
				.onClick((evento) => this.abrirMenuNovaCondicao(evento as unknown as MouseEvent))
		);
	}

	private removerSeVazia(condicao: CondicaoFiltro): void {
		const vazia = condicao.operador === "igual" && condicao.valores.length === 0;
		if (!vazia) return;
		const indice = this.condicoes.indexOf(condicao);
		if (indice >= 0) this.condicoes.splice(indice, 1);
	}

	private rotuloPropriedade(propriedadeId: string): string {
		if (propriedadeId === ID_STATUS) return this.opcoes.configuracoes.status.rotulo || "Status";
		if (propriedadeId === ID_DATA) return this.opcoes.configuracoes.dataTarefa.rotulo || "Data";
		return this.opcoes.configuracoes.propriedades.find((p) => p.id === propriedadeId)?.rotulo ?? propriedadeId;
	}

	private tipoPropriedade(propriedadeId: string): "status" | "selecao" | "link_arquivo" | "texto" | "lista" | "data" {
		if (propriedadeId === ID_STATUS) return "status";
		if (propriedadeId === ID_DATA) return "data";
		const def = this.opcoes.configuracoes.propriedades.find((p) => p.id === propriedadeId);
		return def?.tipo ?? "texto";
	}

	private abrirMenuNovaCondicao(evento: MouseEvent): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item.setTitle(this.opcoes.configuracoes.status.rotulo || "Status").onClick(() => {
				this.condicoes.push({ propriedadeId: ID_STATUS, operador: "igual", valores: [] });
				this.emitirMudanca();
			})
		);
		menu.addItem((item) =>
			item.setTitle(this.opcoes.configuracoes.dataTarefa.rotulo || "Data").onClick(() => {
				this.condicoes.push({ propriedadeId: ID_DATA, operador: "periodo", valores: [] });
				this.emitirMudanca();
			})
		);
		for (const def of this.opcoes.configuracoes.propriedades) {
			menu.addItem((item) =>
				item.setTitle(def.rotulo).onClick(() => {
					this.condicoes.push({ propriedadeId: def.id, operador: "igual", valores: [] });
					this.emitirMudanca();
				})
			);
		}
		menu.showAtMouseEvent(evento);
	}

	private emitirMudanca(): void {
		this.renderizarLinhas();
		this.notificarMudanca();
	}

	private notificarMudanca(): void {
		this.opcoes.aoMudar(this.condicoes.map((c) => ({ ...c, valores: [...c.valores] })));
	}

	private renderizarLinhas(): void {
		this.containerLinhas.empty();
		this.condicoes.forEach((condicao, indice) => this.renderizarLinha(condicao, indice));
	}

	private renderizarLinha(condicao: CondicaoFiltro, indice: number): void {
		const linha = this.containerLinhas.createDiv({ cls: "mytasks-construtor-filtro-linha" });

		const setting = new Setting(linha).setName(this.rotuloPropriedade(condicao.propriedadeId));
		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remover filtro")
				.onClick(() => {
					this.condicoes.splice(indice, 1);
					this.emitirMudanca();
				})
		);

		const tipo = this.tipoPropriedade(condicao.propriedadeId);
		const areaValor = linha.createDiv({ cls: "mytasks-construtor-filtro-valor" });

		if (tipo === "link_arquivo") {
			this.renderizarCampoArquivo(areaValor, condicao);
		} else if (tipo === "data") {
			this.renderizarCampoPeriodo(areaValor, condicao.propriedadeId);
		} else if (tipo === "status" || tipo === "selecao") {
			this.renderizarCampoTags(areaValor, condicao, this.valoresDeOpcoes(condicao.propriedadeId, tipo));
		} else {
			this.renderizarCampoTags(areaValor, condicao, this.opcoes.repositorio.valoresUsados(condicao.propriedadeId));
		}
	}

	private valoresDeOpcoes(propriedadeId: string, tipo: "status" | "selecao"): string[] {
		if (tipo === "status") return this.opcoes.configuracoes.status.opcoes.map((o) => o.valor);
		const def = this.opcoes.configuracoes.propriedades.find((p) => p.id === propriedadeId);
		return (def?.opcoes ?? []).map((o) => o.valor);
	}

	private renderizarCampoTags(container: HTMLElement, condicao: CondicaoFiltro, sugestoes: string[]): void {
		new CampoTags(container, condicao.valores, sugestoes, (valores) => {
			condicao.operador = "igual";
			condicao.valores = valores;
			this.notificarMudanca();
		});
	}

	private renderizarCampoPeriodo(container: HTMLElement, propriedadeId: string): void {
		const condicaoAtual = this.condicoes.find((c) => c.propriedadeId === propriedadeId);
		// Trabalha sempre sobre uma lista de períodos (normalizando o legado `periodo` único).
		const periodos = condicaoAtual ? periodosDaCondicao(condicaoAtual) : [];

		const persistir = () => {
			if (periodos.length === 0) {
				if (condicaoAtual) {
					const indice = this.condicoes.indexOf(condicaoAtual);
					if (indice >= 0) this.condicoes.splice(indice, 1);
				}
				this.emitirMudanca();
				return;
			}
			const condicao = condicaoAtual ?? { propriedadeId, operador: "periodo" as const, valores: [] };
			condicao.operador = "periodo";
			condicao.periodos = periodos;
			delete condicao.periodo; // migra do formato antigo (único) para a lista
			condicao.combinacaoPeriodos = condicao.combinacaoPeriodos ?? "ou";
			if (!this.condicoes.includes(condicao)) this.condicoes.push(condicao);
			this.emitirMudanca();
		};

		periodos.forEach((periodo, indicePeriodo) => {
			// O seletor E/OU vai ENTRE um prazo e o seguinte (antes de cada período a partir do 2º).
			if (indicePeriodo > 0 && condicaoAtual) {
				new Setting(container).setName("combinar prazos").addDropdown((dropdown) => {
					dropdown.addOption("ou", "OU");
					dropdown.addOption("e", "E");
					dropdown.setValue(condicaoAtual.combinacaoPeriodos ?? "ou").onChange((valor) => {
						condicaoAtual.combinacaoPeriodos = valor as CombinacaoPeriodos;
						this.notificarMudanca();
					});
				});
			}
			this.renderizarUmPeriodo(container, periodos, periodo, indicePeriodo, persistir);
		});

		new Setting(container).addButton((btn) =>
			btn.setButtonText("+ adicionar prazo").onClick(() => {
				const operador: OperadorPeriodo = "referente-a";
				periodos.push({ operador, ancora: ANCORAS_POR_OPERADOR[operador][0].valor });
				persistir();
			})
		);
	}

	private renderizarUmPeriodo(
		container: HTMLElement,
		periodos: PeriodoFiltro[],
		periodo: PeriodoFiltro,
		indicePeriodo: number,
		persistir: () => void
	): void {
		const settingOperador = new Setting(container).setName(periodos.length > 1 ? `prazo ${indicePeriodo + 1}` : "período");
		settingOperador.addDropdown((dropdown) => {
			for (const chave of Object.keys(ROTULOS_OPERADOR_PERIODO) as OperadorPeriodo[]) {
				dropdown.addOption(chave, ROTULOS_OPERADOR_PERIODO[chave]);
			}
			dropdown.setValue(periodo.operador).onChange((valor) => {
				const operador = valor as OperadorPeriodo;
				periodos[indicePeriodo] = { operador, ancora: ANCORAS_POR_OPERADOR[operador][0].valor };
				persistir();
			});
		});
		settingOperador.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remover prazo")
				.onClick(() => {
					periodos.splice(indicePeriodo, 1);
					persistir();
				})
		);

		new Setting(container).setName("quando").addDropdown((dropdown) => {
			for (const opcao of ANCORAS_POR_OPERADOR[periodo.operador]) {
				dropdown.addOption(opcao.valor, opcao.rotulo);
			}
			dropdown.setValue(periodo.ancora).onChange((valor) => {
				periodos[indicePeriodo] = { ...periodo, ancora: valor as AncoraPeriodo };
				persistir();
			});
		});

		if (periodo.ancora === "dia-especifico") {
			new Setting(container).setName("data").addText((text) => {
				text.inputEl.type = "date";
				if (periodo.dataEspecifica) text.setValue(periodo.dataEspecifica);
				text.onChange((valor) => {
					if (!valor) return;
					periodos[indicePeriodo] = { ...periodo, dataEspecifica: valor };
					persistir();
				});
			});
		}

		if (periodo.ancora === "proximos-dias" || periodo.ancora === "ultimos-dias") {
			new Setting(container).setName("quantidade de dias").addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.setValue(String(periodo.quantidadeDias ?? 7));
				text.onChange((valor) => {
					const n = Number(valor);
					if (!Number.isFinite(n) || n <= 0) return;
					periodo.quantidadeDias = n; // muta em lugar pra não perder o foco do campo numérico
					this.notificarMudanca();
				});
			});
		}
	}

	private renderizarCampoArquivo(container: HTMLElement, condicao: CondicaoFiltro, aoMudarEstrutura?: () => void): void {
		const usaArquivoAtual = condicao.operador === "arquivo-atual";

		new Setting(container).setName("Usar a nota que contém esta visualização").addToggle((toggle) =>
			toggle.setValue(usaArquivoAtual).onChange((valor) => {
				condicao.operador = valor ? "arquivo-atual" : "igual";
				condicao.valores = [];
				if (valor && !this.condicoes.includes(condicao)) this.condicoes.push(condicao);
				if (!valor) this.removerSeVazia(condicao);
				this.notificarMudanca();
				aoMudarEstrutura ? aoMudarEstrutura() : this.emitirMudanca();
			})
		);

		if (!usaArquivoAtual) {
			const setting = new Setting(container);
			setting.addSearch((search) => {
				const arquivoAtual = condicao.valores[0];
				if (arquivoAtual) {
					const arquivo = this.opcoes.app.vault.getAbstractFileByPath(arquivoAtual);
					if (arquivo) search.setValue(arquivo.name.replace(/\.md$/, ""));
				}
				new SugestorArquivos(this.opcoes.app, search.inputEl, (arquivo: TFile) => {
					if (!this.condicoes.includes(condicao)) this.condicoes.push(condicao);
					condicao.valores = [arquivo.path];
					this.notificarMudanca();
				});
				search.inputEl.addEventListener("input", () => {
					if (!search.inputEl.value) {
						condicao.valores = [];
						this.removerSeVazia(condicao);
						this.notificarMudanca();
					}
				});
			});
		}
	}
}
