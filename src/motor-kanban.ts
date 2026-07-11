import { App, setIcon } from "obsidian";
import { CondicaoFiltro, ConfiguracoesGestorTarefas, ID_STATUS, Tarefa, TipoAgrupamento } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ModalNovaTarefa } from "./modal-nova-tarefa";
import { ID_DATA_ENTRADA, desenharCartaoTarefa, FORMATO_DRAG_TAREFA } from "./render-tarefa";
import { agruparTarefas } from "./motor-agrupamento";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";
import { SeletorAgrupamento } from "./seletor-agrupamento";

export interface OpcoesMotorKanban {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfiguracoesGestorTarefas;
	agrupamentoInicial?: TipoAgrupamento;
	filtro?: (tarefa: Tarefa) => boolean;
	permitirTrocaAgrupamento?: boolean;
	permitirEdicaoFiltro?: boolean;
}

export class MotorKanban {
	private agrupamento: TipoAgrupamento;
	private condicoesFiltro: CondicaoFiltro[] = [];
	private filtroSalvoId: string | null = null;
	private areaGrade: HTMLElement | null = null;

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesMotorKanban) {
		this.agrupamento = opcoes.agrupamentoInicial ?? ID_STATUS;
	}

	renderizar(): void {
		this.containerEl.empty();
		this.containerEl.addClass("mytasks-kanban");

		this.desenharCabecalho();
		this.areaGrade = this.containerEl.createDiv({ cls: "mytasks-kanban-grade" });
		this.renderizarGrade();
	}

	destruir(): void {}

	private tarefasFiltradas(): Tarefa[] {
		const todas = this.opcoes.repositorio.listarTarefas();
		const filtroInterativo = compilarFiltro(this.condicoesFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
		return todas.filter((t) => (this.opcoes.filtro ? this.opcoes.filtro(t) : true)).filter(filtroInterativo);
	}

	private colunas() {
		return agruparTarefas(this.tarefasFiltradas(), this.agrupamento, this.opcoes.configuracoes);
	}

	private propriedadesMeta() {
		const { kanbanPropriedadesVisiveis, propriedades } = this.opcoes.configuracoes;
		return kanbanPropriedadesVisiveis ? propriedades.filter((p) => kanbanPropriedadesVisiveis.includes(p.id)) : propriedades;
	}

	private ocultarNaMeta(): string[] {
		const { kanbanPropriedadesVisiveis } = this.opcoes.configuracoes;
		const ocultarDataEntrada = kanbanPropriedadesVisiveis !== null && !kanbanPropriedadesVisiveis.includes(ID_DATA_ENTRADA);
		const ocultarStatus = kanbanPropriedadesVisiveis !== null && !kanbanPropriedadesVisiveis.includes(ID_STATUS);
		return [
			this.agrupamento,
			...(ocultarDataEntrada ? [ID_DATA_ENTRADA] : []),
			...(ocultarStatus ? [ID_STATUS] : []),
		];
	}

	private renderizarGrade(): void {
		if (!this.areaGrade) return;
		this.areaGrade.empty();

		const colunas = this.colunas();
		if (colunas.length === 0) {
			this.areaGrade.createEl("p", {
				text: "Esta propriedade ainda não tem opções configuradas em Configurações → Propriedades customizadas.",
				cls: "mytasks-vazio",
			});
			return;
		}

		for (const coluna of colunas) {
			const colunaEl = this.areaGrade.createDiv({ cls: "mytasks-kanban-coluna" });

			const cabecalhoColuna = colunaEl.createDiv({ cls: "mytasks-kanban-cabecalho-coluna" });
			if (coluna.cor) cabecalhoColuna.style.setProperty("--mytasks-cor-coluna", coluna.cor);
			cabecalhoColuna.createEl("span", { text: coluna.rotulo, cls: "mytasks-kanban-titulo-coluna" });
			cabecalhoColuna.createEl("span", { text: String(coluna.tarefas.length), cls: "mytasks-kanban-contagem-coluna" });

			const listaColuna = colunaEl.createDiv({ cls: "mytasks-kanban-lista-coluna" });
			for (const tarefa of coluna.tarefas) {
				desenharCartaoTarefa(listaColuna, this.opcoes.app, this.opcoes.repositorio, this.opcoes.configuracoes, tarefa, {
					propriedadesMeta: this.propriedadesMeta(),
					ocultarNaMeta: this.ocultarNaMeta(),
					aoAtualizar: () => this.renderizar(),
				});
			}

			this.registrarAlvoDeSoltura(colunaEl, coluna.chave);
		}
	}

	private registrarAlvoDeSoltura(elemento: HTMLElement, valorColuna: string): void {
		elemento.addEventListener("dragover", (evento) => {
			if (!evento.dataTransfer?.types.includes(FORMATO_DRAG_TAREFA)) return;
			evento.preventDefault();
			elemento.addClass("mytasks-kanban-alvo-soltura");
		});
		elemento.addEventListener("dragleave", () => elemento.removeClass("mytasks-kanban-alvo-soltura"));
		elemento.addEventListener("drop", async (evento) => {
			const caminho = evento.dataTransfer?.getData(FORMATO_DRAG_TAREFA);
			elemento.removeClass("mytasks-kanban-alvo-soltura");
			if (!caminho) return;
			evento.preventDefault();
			const tarefa = this.tarefasFiltradas().find((t) => t.caminho === caminho);
			if (!tarefa) return;

			if (this.agrupamento === ID_STATUS) {
				await this.opcoes.repositorio.atualizarStatus(tarefa, valorColuna);
			} else {
				await this.opcoes.repositorio.atualizarPropriedade(tarefa, this.agrupamento, valorColuna);
			}
			this.renderizar();
		});
	}

	private desenharCabecalho(): void {
		const cabecalho = this.containerEl.createDiv({ cls: "mytasks-cabecalho" });
		cabecalho.createEl("h3", { text: "Kanban" });

		const botaoNova = cabecalho.createEl("button", { cls: "mytasks-botao-nova-tarefa mytasks-seletor-discreto" });
		const iconeNova = botaoNova.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		setIcon(iconeNova, "square-plus");
		botaoNova.createSpan({ cls: "mytasks-seletor-discreto-texto", text: "nova tarefa" });
		botaoNova.addEventListener("click", () => {
			new ModalNovaTarefa(this.opcoes.app, this.opcoes.configuracoes, this.opcoes.repositorio, async (titulo, dados) => {
				await this.opcoes.repositorio.criarTarefa(titulo, dados);
				this.renderizar();
			}).open();
		});

		if (this.opcoes.permitirTrocaAgrupamento !== false) {
			new SeletorAgrupamento(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				agrupamentoAtual: this.agrupamento,
				permitirNenhum: false,
				permitirDia: false,
				aoEscolher: (agrupamento) => {
					this.agrupamento = agrupamento;
					this.renderizarGrade();
				},
			});
		}

		if (this.opcoes.permitirEdicaoFiltro !== false) {
			new SeletorFiltroSalvo(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				filtroAtualId: this.filtroSalvoId,
				aoEscolher: (filtroId, condicoes) => {
					this.filtroSalvoId = filtroId;
					this.condicoesFiltro = condicoes;
					this.renderizarGrade();
				},
			});
		}
	}
}
