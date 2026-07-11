import { App, Menu, setIcon } from "obsidian";
import { CondicaoFiltro, ConfiguracoesGestorTarefas, ID_STATUS, ModoCalendario, ROTULOS_MODO, Tarefa, obterFiltroSalvo } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ModalNovaTarefa } from "./modal-nova-tarefa";
import { ID_DATA, ID_DATA_ENTRADA, desenharCartaoTarefa, FORMATO_DRAG_TAREFA, OpcoesCartaoTarefa } from "./render-tarefa";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";

export type { ModoCalendario };

const NOMES_DIA_SEMANA_COMPLETO = [
	"Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
];
const NOMES_MES = [
	"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
	"Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const LARGURA_MINIMA_COLUNA = 130;
const ALTURA_MINIMA_HORA = 48;
const HORA_INICIAL_GRADE = 7;
const HORA_FINAL_GRADE = 22;

export interface OpcoesMotorCalendario {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfiguracoesGestorTarefas;
	modoInicial?: ModoCalendario;
	filtro?: (tarefa: Tarefa) => boolean;
	permitirTrocaModo?: boolean;
	permitirEdicaoFiltro?: boolean;
	// Filtro salvo pré-selecionado ao abrir (ex: filtro padrão configurado em Configurações, ou o filtro
	// móvel padrão de uma Visualização salva — nesse caso deve ser um dos IDs presentes em filtrosExtrasIds).
	filtroInicialId?: string | null;
	// Restringe o SeletorFiltroSalvo do cabeçalho a só estes IDs (usado no embed, "filtro móvel" da visualização).
	// Sem isso, o seletor mostra todos os Filtros salvos (comportamento do Calendário geral).
	filtrosExtrasIds?: string[];
}

function formatarData(data: Date): string {
	const ano = data.getFullYear();
	const mes = String(data.getMonth() + 1).padStart(2, "0");
	const dia = String(data.getDate()).padStart(2, "0");
	return `${ano}-${mes}-${dia}`;
}

function inicioSemana(data: Date): Date {
	const resultado = new Date(data);
	resultado.setDate(resultado.getDate() - resultado.getDay());
	return resultado;
}

export class MotorCalendario {
	private modo: ModoCalendario;
	private dataReferencia: Date = new Date();
	private diaExpandido: string | null = null;
	private condicoesFiltro: CondicaoFiltro[] = [];
	private filtroSalvoId: string | null = null;

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesMotorCalendario) {
		this.modo = opcoes.modoInicial ?? "mes";

		const filtroInicial = opcoes.filtroInicialId ? obterFiltroSalvo(opcoes.configuracoes, opcoes.filtroInicialId) : undefined;
		if (filtroInicial) {
			this.filtroSalvoId = filtroInicial.id;
			this.condicoesFiltro = filtroInicial.condicoes.map((c) => ({ ...c, valores: [...c.valores] }));
		}
	}

	renderizar(): void {
		this.containerEl.empty();
		this.containerEl.addClass("mytasks-calendario");

		this.desenharCabecalho();

		const areaGrade = this.containerEl.createDiv({ cls: "mytasks-calendario-grade-area" });
		if (this.modo === "semana-horarios") areaGrade.addClass("mytasks-calendario-grade-area-vertical");

		if (this.modo === "mes") this.desenharMes(areaGrade);
		else if (this.modo === "semana-horarios") this.desenharSemanaComHorarios(areaGrade);
		else if (this.modo === "semana-kanban") this.desenharSemanaKanban(areaGrade);
		else this.desenharAno(areaGrade);
	}

	destruir(): void {
		// Nenhum listener fora do containerEl é registrado hoje; método existe para simetria de lifecycle.
	}

	private tarefasFiltradas(): Tarefa[] {
		const todas = this.opcoes.repositorio.listarTarefas().filter((t) => t.data !== null);
		const filtroFixo = this.opcoes.filtro ? todas.filter(this.opcoes.filtro) : todas;
		const filtroInterativo = compilarFiltro(this.condicoesFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
		return filtroFixo.filter(filtroInterativo);
	}

	private opcoesCartao(extras: OpcoesCartaoTarefa = {}): OpcoesCartaoTarefa {
		const { calendarioMostrarDetalhes, calendarioPropriedadesVisiveisPorModo, propriedades } = this.opcoes.configuracoes;
		if (!calendarioMostrarDetalhes) {
			return { ...extras, mostrarMeta: false };
		}
		const propriedadesVisiveis = calendarioPropriedadesVisiveisPorModo[this.modo];
		const propriedadesMeta = propriedadesVisiveis
			? propriedades.filter((p) => propriedadesVisiveis.includes(p.id))
			: propriedades;
		const mostrarDataEntrada = propriedadesVisiveis !== null && propriedadesVisiveis.includes(ID_DATA_ENTRADA);
		const ocultarStatus = propriedadesVisiveis !== null && !propriedadesVisiveis.includes(ID_STATUS);
		const ocultarNaMeta = [
			ID_DATA,
			...(mostrarDataEntrada ? [] : [ID_DATA_ENTRADA]),
			...(ocultarStatus ? [ID_STATUS] : []),
		];
		return { ...extras, propriedadesMeta, ocultarNaMeta };
	}

	private colunasVisiveis(): number {
		const largura = this.containerEl.clientWidth || 600;
		const colunas = Math.floor(largura / LARGURA_MINIMA_COLUNA);
		return Math.max(1, Math.min(7, colunas));
	}

	private desenharCabecalho(): void {
		const cabecalho = this.containerEl.createDiv({ cls: "mytasks-calendario-cabecalho" });

		const ladoEsquerdo = cabecalho.createDiv({ cls: "mytasks-calendario-cabecalho-lado" });

		const navegacao = ladoEsquerdo.createDiv({ cls: "mytasks-calendario-navegacao" });

		const botaoAnterior = navegacao.createEl("button", { text: "‹" });
		botaoAnterior.addEventListener("click", () => this.navegar(-1));

		const botaoHoje = navegacao.createEl("button", { text: "Hoje" });
		botaoHoje.addEventListener("click", () => {
			this.dataReferencia = new Date();
			this.renderizar();
		});

		const botaoProximo = navegacao.createEl("button", { text: "›" });
		botaoProximo.addEventListener("click", () => this.navegar(1));

		ladoEsquerdo.createEl("span", { text: this.rotuloPeriodo(), cls: "mytasks-calendario-rotulo-periodo" });

		const ladoDireito = cabecalho.createDiv({ cls: "mytasks-calendario-cabecalho-lado" });

		const filtroMovelVazio = this.opcoes.filtrosExtrasIds && this.opcoes.filtrosExtrasIds.length === 0;
		if (this.opcoes.permitirEdicaoFiltro !== false && !filtroMovelVazio) {
			new SeletorFiltroSalvo(ladoDireito, {
				configuracoes: this.opcoes.configuracoes,
				filtroAtualId: this.filtroSalvoId,
				restringirAIds: this.opcoes.filtrosExtrasIds,
				aoEscolher: (filtroId, condicoes) => {
					this.filtroSalvoId = filtroId;
					this.condicoesFiltro = condicoes;
					this.renderizar();
				},
			});
		}

		if (this.opcoes.permitirTrocaModo !== false) {
			const botaoSeletorModo = ladoDireito.createEl("button", { cls: "mytasks-calendario-seletor-modo" });
			const textoSeletorModo = botaoSeletorModo.createSpan({
				cls: "mytasks-seletor-discreto-texto",
				text: ROTULOS_MODO[this.modo],
			});
			const chevron = botaoSeletorModo.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
			setIcon(chevron, "chevrons-up-down");

			botaoSeletorModo.addEventListener("click", () => {
				const menu = new Menu();
				menu.setUseNativeMenu(false);
				menu.addItem((item) => item.setTitle("selecionar visualização").setDisabled(true));
				menu.addSeparator();
				for (const chave of Object.keys(ROTULOS_MODO) as ModoCalendario[]) {
					menu.addItem((item) =>
						item
							.setTitle(ROTULOS_MODO[chave])
							.setChecked(chave === this.modo)
							.onClick(() => {
								this.modo = chave;
								textoSeletorModo.setText(ROTULOS_MODO[this.modo]);
								this.renderizar();
							})
					);
				}
				const retangulo = botaoSeletorModo.getBoundingClientRect();
				menu.showAtPosition({ x: retangulo.left, y: retangulo.bottom + 4 });
			});
		}
	}

	private navegar(direcao: 1 | -1): void {
		const nova = new Date(this.dataReferencia);
		if (this.modo === "mes") nova.setMonth(nova.getMonth() + direcao);
		else if (this.modo === "ano") nova.setFullYear(nova.getFullYear() + direcao);
		else nova.setDate(nova.getDate() + direcao * 7);
		this.dataReferencia = nova;
		this.renderizar();
	}

	private rotuloPeriodo(): string {
		if (this.modo === "mes") {
			return `${NOMES_MES[this.dataReferencia.getMonth()]} de ${this.dataReferencia.getFullYear()}`;
		}
		if (this.modo === "ano") {
			return String(this.dataReferencia.getFullYear());
		}
		const inicio = inicioSemana(this.dataReferencia);
		const fim = new Date(inicio);
		fim.setDate(fim.getDate() + this.colunasVisiveis() - 1);
		if (inicio.getMonth() === fim.getMonth()) {
			return `${inicio.getDate()} – ${fim.getDate()} de ${NOMES_MES[inicio.getMonth()]} de ${inicio.getFullYear()}`;
		}
		return `${inicio.getDate()} de ${NOMES_MES[inicio.getMonth()]} – ${fim.getDate()} de ${NOMES_MES[fim.getMonth()]} de ${fim.getFullYear()}`;
	}

	private abrirMenuNovaTarefa(evento: MouseEvent, data: string, horario?: string): void {
		evento.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Nova tarefa nesta data")
				.setIcon("plus")
				.onClick(() => {
					new ModalNovaTarefa(
						this.opcoes.app,
						this.opcoes.configuracoes,
						this.opcoes.repositorio,
						async (titulo, dados) => {
							await this.opcoes.repositorio.criarTarefa(titulo, dados);
							this.renderizar();
						},
						{ data, horario }
					).open();
				})
		);
		menu.showAtMouseEvent(evento);
	}

	private registrarAlvoDeSoltura(elemento: HTMLElement, data: string, horario?: string | null): void {
		elemento.addEventListener("dragover", (evento) => {
			if (!evento.dataTransfer?.types.includes(FORMATO_DRAG_TAREFA)) return;
			evento.preventDefault();
			elemento.addClass("mytasks-calendario-alvo-soltura");
		});
		elemento.addEventListener("dragleave", () => elemento.removeClass("mytasks-calendario-alvo-soltura"));
		elemento.addEventListener("drop", (evento) => {
			const caminho = evento.dataTransfer?.getData(FORMATO_DRAG_TAREFA);
			elemento.removeClass("mytasks-calendario-alvo-soltura");
			if (!caminho) return;
			evento.preventDefault();
			const tarefa = this.opcoes.repositorio.listarTarefas().find((t) => t.caminho === caminho);
			if (!tarefa) return;
			new ModalNovaTarefa(
				this.opcoes.app,
				this.opcoes.configuracoes,
				this.opcoes.repositorio,
				() => {},
				{ data, horario: horario ?? undefined },
				tarefa,
				() => this.renderizar()
			).open();
		});
	}

	// ---------- Modo Mês ----------

	private desenharMes(container: HTMLElement): void {
		const tarefas = this.tarefasFiltradas();
		const porDia = new Map<string, Tarefa[]>();
		for (const tarefa of tarefas) {
			const data = tarefa.data!;
			if (!porDia.has(data)) porDia.set(data, []);
			porDia.get(data)!.push(tarefa);
		}

		const grade = container.createDiv({ cls: "mytasks-calendario-grade-mes" });

		for (const nome of NOMES_DIA_SEMANA_COMPLETO) {
			grade.createDiv({ cls: "mytasks-calendario-cabecalho-dia-semana", text: nome });
		}

		const ano = this.dataReferencia.getFullYear();
		const mes = this.dataReferencia.getMonth();
		const primeiroDiaMes = new Date(ano, mes, 1);
		const inicioGrade = inicioSemana(primeiroDiaMes);
		const hojeStr = formatarData(new Date());

		for (let i = 0; i < 42; i++) {
			const dia = new Date(inicioGrade);
			dia.setDate(dia.getDate() + i);
			const diaStr = formatarData(dia);
			const foraDoMes = dia.getMonth() !== mes;

			const celula = grade.createDiv({ cls: "mytasks-calendario-celula-dia" });
			if (foraDoMes) celula.addClass("mytasks-calendario-fora-do-mes");
			if (diaStr === hojeStr) celula.addClass("mytasks-calendario-hoje");

			celula.createDiv({ cls: "mytasks-calendario-numero-dia", text: String(dia.getDate()).padStart(2, "0") });

			const tarefasDoDia = porDia.get(diaStr) ?? [];
			const listaDia = celula.createDiv({ cls: "mytasks-calendario-lista-dia" });
			for (const tarefa of tarefasDoDia.slice(0, 3)) {
				desenharCartaoTarefa(
					listaDia,
					this.opcoes.app,
					this.opcoes.repositorio,
					this.opcoes.configuracoes,
					tarefa,
					this.opcoesCartao({ mostrarCheckbox: true, aoAtualizar: () => this.renderizar() })
				);
			}
			if (tarefasDoDia.length > 3) {
				listaDia.createDiv({ cls: "mytasks-calendario-mais", text: `+${tarefasDoDia.length - 3}` });
			}

			celula.addEventListener("click", () => {
				this.diaExpandido = this.diaExpandido === diaStr ? null : diaStr;
				this.mostrarDetalheDia(celula, diaStr, tarefasDoDia);
			});
			celula.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
			this.registrarAlvoDeSoltura(celula, diaStr);
		}
	}

	private mostrarDetalheDia(celula: HTMLElement, diaStr: string, tarefas: Tarefa[]): void {
		const existente = celula.querySelector(".mytasks-calendario-detalhe-dia");
		if (existente) {
			existente.remove();
			return;
		}
		const detalhe = celula.createDiv({ cls: "mytasks-calendario-detalhe-dia" });
		if (tarefas.length === 0) {
			detalhe.createEl("p", { text: "Nenhuma tarefa neste dia.", cls: "mytasks-vazio" });
			return;
		}
		for (const tarefa of tarefas) {
			desenharCartaoTarefa(
				detalhe,
				this.opcoes.app,
				this.opcoes.repositorio,
				this.opcoes.configuracoes,
				tarefa,
				this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
			);
		}
	}

	// ---------- Modo Semana (kanban por dia) ----------

	private desenharSemanaKanban(container: HTMLElement): void {
		const numColunas = this.colunasVisiveis();
		const tarefas = this.tarefasFiltradas();
		const inicio = inicioSemana(this.dataReferencia);
		const hojeStr = formatarData(new Date());

		const grade = container.createDiv({ cls: "mytasks-calendario-grade-semana-kanban" });
		grade.style.setProperty("--mytasks-num-colunas", String(numColunas));

		for (let i = 0; i < numColunas; i++) {
			const dia = new Date(inicio);
			dia.setDate(dia.getDate() + i);
			const diaStr = formatarData(dia);

			const coluna = grade.createDiv({ cls: "mytasks-calendario-coluna-dia" });
			if (diaStr === hojeStr) coluna.addClass("mytasks-calendario-hoje");

			const cabecalhoColuna = coluna.createDiv({ cls: "mytasks-calendario-cabecalho-coluna" });
			cabecalhoColuna.createEl("span", {
				text: String(dia.getDate()).padStart(2, "0"),
				cls: "mytasks-calendario-numero-dia",
			});
			cabecalhoColuna.createEl("span", { text: "|", cls: "mytasks-calendario-separador-cabecalho" });
			cabecalhoColuna.createEl("span", { text: NOMES_DIA_SEMANA_COMPLETO[dia.getDay()].toLowerCase() });

			coluna.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
			this.registrarAlvoDeSoltura(coluna, diaStr);

			const tarefasDoDia = tarefas.filter((t) => t.data === diaStr);
			for (const tarefa of tarefasDoDia) {
				desenharCartaoTarefa(
					coluna,
					this.opcoes.app,
					this.opcoes.repositorio,
					this.opcoes.configuracoes,
					tarefa,
					this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
				);
			}
		}
	}

	// ---------- Modo Semana (com horários) ----------

	private desenharSemanaComHorarios(container: HTMLElement): void {
		const numColunas = this.colunasVisiveis();
		const tarefas = this.tarefasFiltradas();
		const inicio = inicioSemana(this.dataReferencia);
		const hojeStr = formatarData(new Date());

		const dias: { data: Date; diaStr: string }[] = [];
		for (let i = 0; i < numColunas; i++) {
			const dia = new Date(inicio);
			dia.setDate(dia.getDate() + i);
			dias.push({ data: dia, diaStr: formatarData(dia) });
		}

		// Cabeçalho de dias
		const cabecalhoDias = container.createDiv({ cls: "mytasks-calendario-cabecalho-semana-horarios" });
		cabecalhoDias.style.setProperty("--mytasks-num-colunas", String(numColunas));
		cabecalhoDias.createDiv();
		for (const { data, diaStr } of dias) {
			const cabecalhoDia = cabecalhoDias.createDiv({ cls: "mytasks-calendario-cabecalho-coluna" });
			if (diaStr === hojeStr) cabecalhoDia.addClass("mytasks-calendario-hoje");
			cabecalhoDia.createEl("span", {
				text: String(data.getDate()).padStart(2, "0"),
				cls: "mytasks-calendario-numero-dia",
			});
			cabecalhoDia.createEl("span", { text: "|", cls: "mytasks-calendario-separador-cabecalho" });
			cabecalhoDia.createEl("span", { text: NOMES_DIA_SEMANA_COMPLETO[data.getDay()].toLowerCase() });
		}

		// Faixa "dia inteiro"
		const faixaDiaInteiro = container.createDiv({ cls: "mytasks-calendario-faixa-dia-inteiro" });
		faixaDiaInteiro.style.setProperty("--mytasks-num-colunas", String(numColunas));
		faixaDiaInteiro.createDiv({ cls: "mytasks-calendario-rotulo-faixa", text: "Dia" });
		for (const { diaStr } of dias) {
			const celula = faixaDiaInteiro.createDiv({ cls: "mytasks-calendario-celula-dia-inteiro" });
			const tarefasSemHorario = tarefas.filter((t) => t.data === diaStr && !t.horario);
			for (const tarefa of tarefasSemHorario) {
				desenharCartaoTarefa(
					celula,
					this.opcoes.app,
					this.opcoes.repositorio,
					this.opcoes.configuracoes,
					tarefa,
					this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
				);
			}
			celula.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
			this.registrarAlvoDeSoltura(celula, diaStr, null);
		}

		// Grade de horas
		const areaScroll = container.createDiv({ cls: "mytasks-calendario-scroll-horas" });
		const gradeHoras = areaScroll.createDiv({ cls: "mytasks-calendario-grade-horas" });
		gradeHoras.style.setProperty("--mytasks-num-colunas", String(numColunas));
		gradeHoras.style.setProperty("--mytasks-altura-hora", `${ALTURA_MINIMA_HORA}px`);

		for (let hora = HORA_INICIAL_GRADE; hora <= HORA_FINAL_GRADE; hora++) {
			gradeHoras.createDiv({ cls: "mytasks-calendario-rotulo-hora", text: `${String(hora).padStart(2, "0")}:00` });
			for (const { diaStr } of dias) {
				const celulaHora = gradeHoras.createDiv({ cls: "mytasks-calendario-celula-hora" });
				const tarefasHora = tarefas.filter((t) => {
					if (t.data !== diaStr || !t.horario) return false;
					const horaTarefa = parseInt(t.horario.split(":")[0], 10);
					return horaTarefa === hora;
				});
				for (const tarefa of tarefasHora) {
					desenharCartaoTarefa(
						celulaHora,
						this.opcoes.app,
						this.opcoes.repositorio,
						this.opcoes.configuracoes,
						tarefa,
						this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
					);
				}
				const horarioClique = `${String(hora).padStart(2, "0")}:00`;
				celulaHora.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr, horarioClique));
				this.registrarAlvoDeSoltura(celulaHora, diaStr, horarioClique);
			}
		}
	}

	// ---------- Modo Ano ----------

	private desenharAno(container: HTMLElement): void {
		const tarefas = this.tarefasFiltradas();
		const contagemPorDia = new Map<string, number>();
		for (const tarefa of tarefas) {
			const data = tarefa.data!;
			contagemPorDia.set(data, (contagemPorDia.get(data) ?? 0) + 1);
		}

		const ano = this.dataReferencia.getFullYear();
		const grade = container.createDiv({ cls: "mytasks-calendario-grade-ano" });

		for (let mes = 0; mes < 12; mes++) {
			const miniMes = grade.createDiv({ cls: "mytasks-calendario-mini-mes" });
			miniMes.createEl("h4", { text: NOMES_MES[mes] });

			const miniGrade = miniMes.createDiv({ cls: "mytasks-calendario-mini-grade" });
			const primeiroDia = new Date(ano, mes, 1);
			const inicioGrade = inicioSemana(primeiroDia);
			const hojeStr = formatarData(new Date());

			for (let i = 0; i < 42; i++) {
				const dia = new Date(inicioGrade);
				dia.setDate(dia.getDate() + i);
				if (dia.getMonth() !== mes) {
					miniGrade.createDiv({ cls: "mytasks-calendario-mini-celula-vazia" });
					continue;
				}
				const diaStr = formatarData(dia);
				const quantidade = contagemPorDia.get(diaStr) ?? 0;
				const miniCelula = miniGrade.createDiv({ cls: "mytasks-calendario-mini-celula", text: String(dia.getDate()) });
				if (diaStr === hojeStr) miniCelula.addClass("mytasks-calendario-hoje");
				if (quantidade > 0) {
					miniCelula.addClass("mytasks-calendario-mini-com-tarefas");
					miniCelula.setAttribute("title", `${quantidade} tarefa(s)`);
				}
				miniCelula.addEventListener("click", () => {
					this.dataReferencia = dia;
					this.modo = "mes";
					this.renderizar();
				});
			}
		}
	}
}
