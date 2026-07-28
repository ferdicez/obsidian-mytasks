import { App, Menu, setIcon } from "obsidian";
import {
	ConfigEfetivaGrupo,
	ConfiguracoesGestorTarefas,
	GrupoFiltro,
	ID_STATUS,
	ModoCalendario,
	ROTULOS_MODO,
	Tarefa,
	clonarGrupoFiltro,
	grupoFiltroVazio,
	obterFiltroSalvo,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ModalNovaTarefa } from "./modal-nova-tarefa";
import { ID_DATA, ID_DATA_ENTRADA, desenharCartaoTarefa, FORMATO_DRAG_TAREFA, OpcoesCartaoTarefa } from "./render-tarefa";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";
import { SeletorGrupo } from "./seletor-grupo";

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
// No modo "Dia" cada linha de hora recebe uma tarefa inteira (não só um traço de referência),
// então respira bem mais que a altura de hora usada nas outras grades.
const ALTURA_HORA_MODO_DIA = 140;

// Modo "Dia": faixas fixas do dia. Cada faixa vira uma coluna com uma linha por hora,
// de horaInicial até horaFinal inclusive (noite vai até 23:00, fechando o dia às 00:00).
const FAIXAS_DIA: { titulo: string; horaInicial: number; horaFinal: number }[] = [
	{ titulo: "manhã", horaInicial: 6, horaFinal: 11 },
	{ titulo: "tarde", horaInicial: 12, horaFinal: 17 },
	{ titulo: "noite", horaInicial: 18, horaFinal: 23 },
];
const HORAS_POR_FAIXA = Math.max(...FAIXAS_DIA.map((f) => f.horaFinal - f.horaInicial + 1));

export interface OpcoesMotorCalendario {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfigEfetivaGrupo;
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
	// Seletor de grupo (view única): config global para listar grupos + grupo ativo + callback de troca.
	// Só desenha o ícone quando há mais de um grupo.
	configuracoesGlobais?: ConfiguracoesGestorTarefas;
	grupoAtivoId?: string;
	aoTrocarGrupo?: (grupoId: string) => void;
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
	private grupoFiltro: GrupoFiltro = grupoFiltroVazio();
	private filtroSalvoId: string | null = null;

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesMotorCalendario) {
		this.modo = opcoes.modoInicial ?? "mes";

		const filtroInicial = opcoes.filtroInicialId ? obterFiltroSalvo(opcoes.configuracoes, opcoes.filtroInicialId) : undefined;
		if (filtroInicial) {
			this.filtroSalvoId = filtroInicial.id;
			this.grupoFiltro = clonarGrupoFiltro(filtroInicial.raiz);
		}
	}

	renderizar(): void {
		this.containerEl.empty();
		this.containerEl.addClass("mytasks-calendario");

		this.desenharCabecalho();

		const areaGrade = this.containerEl.createDiv({ cls: "mytasks-calendario-grade-area" });
		if (this.modo === "semana-horarios" || this.modo === "semana-kanban") {
			areaGrade.addClass("mytasks-calendario-grade-area-semana");
		}
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
		const filtroInterativo = compilarFiltro(this.grupoFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
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

		// Ícone discreto de troca de grupo: logo APÓS a navegação "Hoje" e ANTES do rótulo do mês/semana.
		if (this.opcoes.configuracoesGlobais && this.opcoes.grupoAtivoId && this.opcoes.aoTrocarGrupo) {
			const cfgGlobal = this.opcoes.configuracoesGlobais;
			if (cfgGlobal.grupos.length > 1) {
				new SeletorGrupo(ladoEsquerdo, {
					configuracoes: cfgGlobal,
					grupoAtivoId: this.opcoes.grupoAtivoId,
					icone: "calendar-days",
					aoEscolher: (grupoId) => this.opcoes.aoTrocarGrupo!(grupoId),
				});
			}
		}

		ladoEsquerdo.createEl("span", { text: this.rotuloPeriodo(), cls: "mytasks-calendario-rotulo-periodo" });

		const ladoDireito = cabecalho.createDiv({ cls: "mytasks-calendario-cabecalho-lado mytasks-calendario-cabecalho-lado-direito" });

		const filtroMovelVazio = this.opcoes.filtrosExtrasIds && this.opcoes.filtrosExtrasIds.length === 0;
		if (this.opcoes.permitirEdicaoFiltro !== false && !filtroMovelVazio) {
			new SeletorFiltroSalvo(ladoDireito, {
				configuracoes: this.opcoes.configuracoes,
				filtroAtualId: this.filtroSalvoId,
				restringirAIds: this.opcoes.filtrosExtrasIds,
				aoEscolher: (filtroId, raiz) => {
					this.filtroSalvoId = filtroId;
					this.grupoFiltro = raiz;
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
		// Modo "Dia" mostra um único dia: as setas andam de dia em dia, não de semana em semana.
		else if (this.modo === "semana-horarios") nova.setDate(nova.getDate() + direcao);
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
		if (this.modo === "semana-horarios") {
			const dia = this.dataReferencia;
			const nomeDia = NOMES_DIA_SEMANA_COMPLETO[dia.getDay()].toLowerCase();
			const nomeMes = NOMES_MES[dia.getMonth()].toLowerCase();
			return `${nomeDia}, ${dia.getDate()} de ${nomeMes} de ${dia.getFullYear()}`;
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
				.onClick(async () => {
					const arquivo = await this.opcoes.repositorio.criarTarefaEmBranco({ data, horario });
					this.renderizar();
					this.opcoes.app.workspace.openLinkText(arquivo.path, "", false);
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
			if (i === numColunas - 1) coluna.addClass("mytasks-calendario-ultima-coluna");

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

	// ---------- Modo Dia (sem horário + manhã/tarde/noite) ----------

	// Quatro colunas lado a lado para UM dia: a primeira reúne as tarefas do dia ainda sem horário
	// (arrastar dali para uma faixa é o gesto de agendar), e as outras três são as faixas fixas do dia,
	// cada uma com uma linha por hora. As quatro rolam juntas numa área só.
	private desenharSemanaComHorarios(container: HTMLElement): void {
		const tarefas = this.tarefasFiltradas();
		const diaStr = formatarData(this.dataReferencia);
		const ehHoje = diaStr === formatarData(new Date());

		const tarefasDoDia = tarefas.filter((t) => t.data === diaStr);

		const grade = container.createDiv({ cls: "mytasks-calendario-grade-dia" });
		if (ehHoje) grade.addClass("mytasks-calendario-hoje");
		grade.style.setProperty("--mytasks-altura-hora", `${ALTURA_HORA_MODO_DIA}px`);
		// Todas as colunas de faixa têm o mesmo número de linhas de hora, então a coluna "sem horário"
		// pode ocupar exatamente essa altura e as quatro terminam alinhadas.
		grade.style.setProperty("--mytasks-horas-por-faixa", String(HORAS_POR_FAIXA));

		// --- Coluna 1: tarefas do dia sem horário definido ---
		const colunaSemHorario = grade.createDiv({ cls: "mytasks-calendario-coluna-faixa mytasks-calendario-coluna-sem-horario" });
		colunaSemHorario.createDiv({ cls: "mytasks-calendario-titulo-faixa", text: "sem horário" });

		const corpoSemHorario = colunaSemHorario.createDiv({ cls: "mytasks-calendario-corpo-sem-horario" });
		// Também recolhe aqui quem tem horário fora das faixas (madrugada, 00:00–05:00): sem isso
		// a tarefa não teria célula nenhuma e sumiria da tela.
		const semHorario = tarefasDoDia.filter((t) => {
			if (!t.horario) return true;
			const hora = parseInt(t.horario.split(":")[0], 10);
			if (Number.isNaN(hora)) return true;
			return !FAIXAS_DIA.some((f) => hora >= f.horaInicial && hora <= f.horaFinal);
		});
		for (const tarefa of semHorario) {
			desenharCartaoTarefa(
				corpoSemHorario,
				this.opcoes.app,
				this.opcoes.repositorio,
				this.opcoes.configuracoes,
				tarefa,
				this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
			);
		}
		corpoSemHorario.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
		// horario: null → soltar aqui remove o horário da tarefa (desagenda, volta a ser só "do dia").
		this.registrarAlvoDeSoltura(corpoSemHorario, diaStr, null);

		// --- Colunas 2 a 4: manhã, tarde e noite, uma linha por hora ---
		for (const faixa of FAIXAS_DIA) {
			const coluna = grade.createDiv({ cls: "mytasks-calendario-coluna-faixa" });
			coluna.createDiv({ cls: "mytasks-calendario-titulo-faixa", text: faixa.titulo });

			const corpoFaixa = coluna.createDiv({ cls: "mytasks-calendario-corpo-faixa" });

			for (let hora = faixa.horaInicial; hora <= faixa.horaFinal; hora++) {
				const linha = corpoFaixa.createDiv({ cls: "mytasks-calendario-linha-hora" });
				const horarioClique = `${String(hora).padStart(2, "0")}:00`;
				linha.createDiv({ cls: "mytasks-calendario-rotulo-hora", text: horarioClique });

				const celulaHora = linha.createDiv({ cls: "mytasks-calendario-celula-hora" });
				const tarefasHora = tarefasDoDia.filter((t) => {
					if (!t.horario) return false;
					return parseInt(t.horario.split(":")[0], 10) === hora;
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
