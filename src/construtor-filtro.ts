import { App, Setting } from "obsidian";
import {
	AncoraPeriodo,
	CombinacaoPeriodos,
	CombinadorGrupo,
	CondicaoFiltro,
	ConfigEfetivaGrupo,
	GrupoFiltro,
	ID_STATUS,
	ItemFiltro,
	OperadorFiltro,
	OperadorPeriodo,
	PeriodoFiltro,
	clonarGrupoFiltro,
	periodosDaCondicao,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { CampoTags } from "./campo-tags";
import { SugestorArquivos } from "./sugestor-arquivos";
import { OpcaoPropriedade, SeletorPropriedade, TipoPropriedadeFiltro } from "./seletor-propriedade";
import { ID_DATA } from "./render-tarefa";
import { itemFiltroDeYaml, yamlDeItemFiltro } from "./motor-filtro";

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

const ROTULOS_COMBINADOR: Record<CombinadorGrupo, string> = {
	e: "Todos são verdadeiros",
	ou: "Qualquer um é verdadeiro",
	nenhum: "Nenhum é verdadeiro",
};

const ROTULOS_OPERADOR: Partial<Record<OperadorFiltro, string>> = {
	igual: "é",
	diferente: "não é",
	contem: "contém",
	"nao-contem": "não contém",
	vazio: "está vazio",
	"nao-vazio": "não está vazio",
	"arquivo-atual": "é a nota atual",
	periodo: "período",
};

function operadoresDoTipo(tipo: TipoPropriedadeFiltro): OperadorFiltro[] {
	switch (tipo) {
		case "status":
		case "selecao":
			return ["igual", "diferente", "vazio", "nao-vazio"];
		case "texto":
			return ["igual", "diferente", "contem", "nao-contem", "vazio", "nao-vazio"];
		case "lista":
			return ["contem", "nao-contem", "vazio", "nao-vazio"];
		case "link_arquivo":
			return ["igual", "diferente", "arquivo-atual", "vazio", "nao-vazio"];
		case "data":
			return ["periodo", "vazio", "nao-vazio"];
	}
}

function operadorPadrao(tipo: TipoPropriedadeFiltro): OperadorFiltro {
	if (tipo === "lista") return "contem";
	if (tipo === "data") return "periodo";
	return "igual";
}

// 1ª condição/subgrupo de um grupo é sempre "onde"; os seguintes usam a palavra do combinador do grupo
// ("nenhum" também usa "ou" entre as linhas — por baixo dos panos é um OU negado no final).
function rotuloConector(indice: number, combinador: CombinadorGrupo): string {
	if (indice === 0) return "onde";
	return combinador === "e" ? "e" : "ou";
}

export interface OpcoesConstrutorFiltro {
	app: App;
	configuracoes: ConfigEfetivaGrupo;
	repositorio: RepositorioTarefas;
	raizInicial: GrupoFiltro;
	aoMudar: (raiz: GrupoFiltro) => void;
}

// Construtor visual de filtro, estilo Bases: grupos E/OU/NENHUM aninhados recursivamente, propriedade e
// operador escolhidos por dropdown em cada condição (antes a propriedade nascia fixa ao criar a linha).
export class ConstrutorFiltro {
	private raiz: GrupoFiltro;
	// Nós (condição OU subgrupo) que estão no modo "</>" (texto bruto) agora — rastreado por identidade do
	// objeto, que se mantém estável entre re-renders (mutamos os nós em lugar, não os recriamos).
	private modoBrutoAtivo = new Set<ItemFiltro>();

	constructor(private container: HTMLElement, private opcoes: OpcoesConstrutorFiltro) {
		this.raiz = clonarGrupoFiltro(opcoes.raizInicial);
		this.renderizarTudo();
	}

	private renderizarTudo(): void {
		this.container.empty();
		this.renderizarGrupo(this.raiz, this.container);
	}

	private notificar(): void {
		this.opcoes.aoMudar(clonarGrupoFiltro(this.raiz));
	}

	private rotuloPropriedade(propriedadeId: string): string {
		if (propriedadeId === ID_STATUS) return this.opcoes.configuracoes.status.rotulo || "Status";
		if (propriedadeId === ID_DATA) return this.opcoes.configuracoes.dataTarefa.rotulo || "Data";
		return this.opcoes.configuracoes.propriedades.find((p) => p.id === propriedadeId)?.rotulo ?? propriedadeId;
	}

	private tipoPropriedade(propriedadeId: string): TipoPropriedadeFiltro {
		if (propriedadeId === ID_STATUS) return "status";
		if (propriedadeId === ID_DATA) return "data";
		const def = this.opcoes.configuracoes.propriedades.find((p) => p.id === propriedadeId);
		return def?.tipo ?? "texto";
	}

	private opcoesPropriedade(): OpcaoPropriedade[] {
		const { configuracoes } = this.opcoes;
		return [
			{ id: ID_STATUS, rotulo: configuracoes.status.rotulo || "Status", tipo: "status" },
			{ id: ID_DATA, rotulo: configuracoes.dataTarefa.rotulo || "Data", tipo: "data" },
			...configuracoes.propriedades.map((def) => ({ id: def.id, rotulo: def.rotulo, tipo: def.tipo })),
		];
	}

	// Renderiza um grupo (a raiz, ou um subgrupo aninhado) — dropdown de combinador no topo, cada
	// condição/subgrupo com sua palavra-conectivo, e os botões de adicionar no fim. `contexto`, quando
	// presente, marca que este NÃO é o grupo raiz — dá pra remover ou trocar (modo bruto) o grupo inteiro
	// dentro do array de itens do pai.
	private renderizarGrupo(grupo: GrupoFiltro, container: HTMLElement, contexto?: { itensPai: ItemFiltro[]; indice: number }): void {
		if (contexto && this.modoBrutoAtivo.has(grupo)) {
			this.renderizarModoBruto(container, grupo, contexto.itensPai, contexto.indice);
			return;
		}

		const wrapper = container.createDiv({ cls: "mytasks-construtor-filtro" });

		const settingCombinador = new Setting(wrapper).addDropdown((dropdown) => {
			for (const chave of Object.keys(ROTULOS_COMBINADOR) as CombinadorGrupo[]) {
				dropdown.addOption(chave, ROTULOS_COMBINADOR[chave]);
			}
			dropdown.setValue(grupo.combinador).onChange((valor) => {
				grupo.combinador = valor as CombinadorGrupo;
				this.notificar();
				this.renderizarTudo();
			});
		});
		if (contexto) {
			settingCombinador
				.addExtraButton((btn) =>
					btn
						.setIcon("code-2")
						.setTooltip("Editar em texto")
						.onClick(() => {
							this.modoBrutoAtivo.add(grupo);
							this.renderizarTudo();
						})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Remover grupo")
						.onClick(() => {
							contexto.itensPai.splice(contexto.indice, 1);
							this.notificar();
							this.renderizarTudo();
						})
				);
		}

		const areaItens = wrapper.createDiv({ cls: "mytasks-construtor-filtro-itens" });
		grupo.itens.forEach((item, indice) => {
			const linha = areaItens.createDiv({ cls: "mytasks-construtor-filtro-item" });
			linha.createSpan({ text: rotuloConector(indice, grupo.combinador), cls: "mytasks-construtor-filtro-conector" });

			if (item.tipo === "condicao") {
				this.renderizarCondicao(linha, item, grupo.itens, indice);
			} else {
				this.renderizarGrupo(item, linha, { itensPai: grupo.itens, indice });
			}
		});

		new Setting(wrapper)
			.addButton((btn) =>
				btn.setButtonText("+ Adicionar filtro").onClick(() => {
					grupo.itens.push({ tipo: "condicao", propriedadeId: "", operador: "igual", valores: [] });
					this.notificar();
					this.renderizarTudo();
				})
			)
			.addButton((btn) =>
				btn.setButtonText("+ Adicionar grupo de filtros").onClick(() => {
					grupo.itens.push({ tipo: "grupo", combinador: "e", itens: [] });
					this.notificar();
					this.renderizarTudo();
				})
			);
	}

	private renderizarCondicao(container: HTMLElement, condicao: CondicaoFiltro, itensPai: ItemFiltro[], indice: number): void {
		if (this.modoBrutoAtivo.has(condicao)) {
			this.renderizarModoBruto(container, condicao, itensPai, indice);
			return;
		}

		const linha = container.createDiv({ cls: "mytasks-construtor-filtro-linha" });
		const setting = new Setting(linha);

		setting.addSearch((search) => {
			const atual = this.opcoesPropriedade().find((o) => o.id === condicao.propriedadeId);
			if (atual) search.setValue(atual.rotulo);
			search.setPlaceholder("Propriedade...");
			new SeletorPropriedade(this.opcoes.app, search.inputEl, this.opcoesPropriedade(), (opcao) => {
				condicao.propriedadeId = opcao.id;
				condicao.operador = operadorPadrao(opcao.tipo);
				condicao.valores = [];
				delete condicao.periodo;
				delete condicao.periodos;
				delete condicao.combinacaoPeriodos;
				this.notificar();
				this.renderizarTudo();
			});
		});

		if (condicao.propriedadeId) {
			const tipo = this.tipoPropriedade(condicao.propriedadeId);
			setting.addDropdown((dropdown) => {
				for (const operador of operadoresDoTipo(tipo)) {
					dropdown.addOption(operador, ROTULOS_OPERADOR[operador] ?? operador);
				}
				dropdown.setValue(condicao.operador).onChange((valor) => {
					condicao.operador = valor as OperadorFiltro;
					condicao.valores = [];
					delete condicao.periodo;
					delete condicao.periodos;
					this.notificar();
					this.renderizarTudo();
				});
			});
		}

		setting
			.addExtraButton((btn) =>
				btn
					.setIcon("code-2")
					.setTooltip("Editar em texto")
					.onClick(() => {
						this.modoBrutoAtivo.add(condicao);
						this.renderizarTudo();
					})
			)
			.addExtraButton((btn) =>
				btn
					.setIcon("trash")
					.setTooltip("Remover filtro")
					.onClick(() => {
						itensPai.splice(indice, 1);
						this.notificar();
						this.renderizarTudo();
					})
			);

		if (condicao.propriedadeId) {
			const areaValor = linha.createDiv({ cls: "mytasks-construtor-filtro-valor" });
			this.renderizarValor(areaValor, condicao);
		}
	}

	// Modo texto bruto ("</>"): mostra/edita o YAML desse nó específico (condição ou grupo) reaproveitando
	// a mesma gramática do bloco `filtro:` do embed. Nunca aplica algo que não parseou certo — só mostra um
	// aviso e mantém o valor anterior até ela corrigir ou cancelar.
	private renderizarModoBruto(container: HTMLElement, item: ItemFiltro, itensPai: ItemFiltro[], indice: number): void {
		const area = container.createDiv({ cls: "mytasks-construtor-filtro-bruto" });
		const textarea = area.createEl("textarea", { cls: "mytasks-construtor-filtro-bruto-texto" });
		textarea.value = yamlDeItemFiltro(item);

		const erro = area.createDiv({ cls: "mytasks-construtor-filtro-bruto-erro" });

		const cancelar = () => {
			this.modoBrutoAtivo.delete(item);
			this.renderizarTudo();
		};

		new Setting(area)
			.addButton((btn) =>
				btn
					.setButtonText("Aplicar")
					.setCta()
					.onClick(() => {
						const novoItem = itemFiltroDeYaml(textarea.value);
						if (!novoItem) {
							erro.setText(
								"Não deu pra entender esse texto — confira a sintaxe (dois pontos, indentação) e tente de novo."
							);
							return;
						}
						itensPai[indice] = novoItem;
						this.modoBrutoAtivo.delete(item);
						this.notificar();
						this.renderizarTudo();
					})
			)
			.addButton((btn) => btn.setButtonText("Cancelar").onClick(cancelar));
	}

	private renderizarValor(container: HTMLElement, condicao: CondicaoFiltro): void {
		if (condicao.operador === "vazio" || condicao.operador === "nao-vazio") return;
		if (condicao.operador === "arquivo-atual") return;

		const tipo = this.tipoPropriedade(condicao.propriedadeId);

		if (tipo === "link_arquivo") {
			this.renderizarCampoArquivo(container, condicao);
			return;
		}
		if (tipo === "data") {
			this.renderizarCampoPeriodo(container, condicao);
			return;
		}
		if (tipo === "texto" && (condicao.operador === "contem" || condicao.operador === "nao-contem")) {
			this.renderizarCampoTextoLivre(container, condicao);
			return;
		}

		const sugestoes = this.sugestoesDeValor(condicao.propriedadeId, tipo);
		this.renderizarCampoTags(container, condicao, sugestoes);
	}

	private sugestoesDeValor(propriedadeId: string, tipo: TipoPropriedadeFiltro): string[] {
		if (tipo === "status") return this.opcoes.configuracoes.status.opcoes.map((o) => o.valor);
		if (tipo === "selecao") {
			const def = this.opcoes.configuracoes.propriedades.find((p) => p.id === propriedadeId);
			return (def?.opcoes ?? []).map((o) => o.valor);
		}
		return this.opcoes.repositorio.valoresUsados(propriedadeId);
	}

	private renderizarCampoTags(container: HTMLElement, condicao: CondicaoFiltro, sugestoes: string[]): void {
		new CampoTags(container, condicao.valores, sugestoes, (valores) => {
			condicao.valores = valores;
			this.notificar();
		});
	}

	private renderizarCampoTextoLivre(container: HTMLElement, condicao: CondicaoFiltro): void {
		new Setting(container).addText((text) => {
			text.setValue(condicao.valores[0] ?? "").onChange((valor) => {
				condicao.valores = valor ? [valor] : [];
				this.notificar();
			});
		});
	}

	private renderizarCampoArquivo(container: HTMLElement, condicao: CondicaoFiltro): void {
		new Setting(container).addSearch((search) => {
			const caminhoAtual = condicao.valores[0];
			if (caminhoAtual) {
				const arquivo = this.opcoes.app.vault.getAbstractFileByPath(caminhoAtual);
				if (arquivo) search.setValue(arquivo.name.replace(/\.md$/, ""));
			}
			new SugestorArquivos(this.opcoes.app, search.inputEl, (arquivo) => {
				condicao.valores = [arquivo.path];
				this.notificar();
			});
			search.inputEl.addEventListener("input", () => {
				if (!search.inputEl.value) {
					condicao.valores = [];
					this.notificar();
				}
			});
		});
	}

	private renderizarCampoPeriodo(container: HTMLElement, condicao: CondicaoFiltro): void {
		const periodos = periodosDaCondicao(condicao);

		const persistir = () => {
			condicao.operador = "periodo";
			condicao.periodos = periodos;
			delete condicao.periodo;
			condicao.combinacaoPeriodos = condicao.combinacaoPeriodos ?? "ou";
			this.notificar();
			this.renderizarTudo();
		};

		periodos.forEach((periodo, indicePeriodo) => {
			// O seletor E/OU vai ENTRE um prazo e o seguinte (antes de cada período a partir do 2º).
			if (indicePeriodo > 0) {
				new Setting(container).setName("combinar prazos").addDropdown((dropdown) => {
					dropdown.addOption("ou", "OU");
					dropdown.addOption("e", "E");
					dropdown.setValue(condicao.combinacaoPeriodos ?? "ou").onChange((valor) => {
						condicao.combinacaoPeriodos = valor as CombinacaoPeriodos;
						this.notificar();
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
					this.notificar();
				});
			});
		}
	}
}
