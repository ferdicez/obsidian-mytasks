import { App, Menu, setIcon } from "obsidian";
import {
	ConfigEfetivaGrupo,
	ConfiguracoesGestorTarefas,
	EventoExterno,
	GrupoFiltro,
	ID_STATUS,
	ModoCalendario,
	ROTULOS_MODO,
	Tarefa,
	clonarGrupoFiltro,
	grupoFiltroVazio,
	inicioDaJanelaDeTarefa,
	obterFiltroSalvo,
	tarefaOcupaDia,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ID_DATA, ID_DATA_ENTRADA, desenharCartaoTarefa, FORMATO_DRAG_TAREFA, OpcoesCartaoTarefa } from "./render-tarefa";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";
import { SeletorGrupo } from "./seletor-grupo";
import { ServicoCalendariosExternos, compararPorHorario } from "./calendarios-externos";
import { desenharEventoExterno } from "./render-evento-externo";
import { MotorLista } from "./motor-lista";

export type { ModoCalendario };

const NOMES_DIA_SEMANA_COMPLETO = [
	"Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
];
// Sempre em minúsculas: o calendário mostra o nome do mês em caixa baixa em todas as views
// (rótulo do período em Dia/Semana/Mês e os títulos dos mini-meses do modo Ano).
const NOMES_MES = [
	"janeiro", "fevereiro", "março", "abril", "maio", "junho",
	"julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const LARGURA_MINIMA_COLUNA = 130;
const ALTURA_MINIMA_HORA = 48;
// No modo "Dia" cada linha recebe uma tarefa inteira (não só um traço de referência), então respira
// bem mais que a altura de hora usada nas outras grades. Como a faixa passou a ter duas linhas por
// hora (:00 e :30), este valor é a altura de CADA meia hora — ainda cabe um cartão de tarefa inteiro.
const ALTURA_HORA_MODO_DIA = 92;

// Modo "Dia": faixas fixas do dia. Cada faixa vira uma coluna com duas linhas por hora (:00 e :30),
// de horaInicial até horaFinal inclusive (noite vai até 23:30, fechando o dia às 00:00).
const FAIXAS_DIA: { titulo: string; horaInicial: number; horaFinal: number }[] = [
	{ titulo: "manhã", horaInicial: 6, horaFinal: 11 },
	{ titulo: "tarde", horaInicial: 12, horaFinal: 17 },
	{ titulo: "noite", horaInicial: 18, horaFinal: 23 },
];
// Linhas por faixa: duas por hora (:00 e :30).
const HORAS_POR_FAIXA = Math.max(...FAIXAS_DIA.map((f) => (f.horaFinal - f.horaInicial + 1) * 2));

// Quantos itens a célula do modo Mês mostra antes de virar "+N" (o clique abre o painel com tudo).
// Compromissos e tarefas dividem esses lugares — o teto é do total, não de cada tipo, pra célula não
// crescer e a grade do mês manter a forma.
const MAX_ITENS_CELULA_MES = 2;

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
	// Agendas externas (Google via .ics) do grupo. Ausente = calendário desenha só tarefas, como
	// sempre. Precisa de `grupoAtivoId` para saber de qual grupo são as agendas.
	calendariosExternos?: ServicoCalendariosExternos;
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
	// Timer que faz a marca de "agora" do modo Dia andar sozinha (ver agendarMarcaDeAgora).
	private timerAgora: number | null = null;
	// Motores das duas colunas do modo "Lista" — guardados só para destruir junto com o calendário.
	private motoresLista: MotorLista[] = [];

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
		// Todas as views usam a moldura "aberta": só o traço reto no topo, sem laterais/base
		// nem cantos curvos.
		areaGrade.addClass("mytasks-calendario-grade-area-aberta");
		if (this.modo === "semana-horarios") areaGrade.addClass("mytasks-calendario-grade-area-vertical");

		if (this.modo === "lista") this.desenharLista(areaGrade);
		else if (this.modo === "mes") this.desenharMes(areaGrade);
		else if (this.modo === "semana-horarios") this.desenharSemanaComHorarios(areaGrade);
		else if (this.modo === "semana-kanban") this.desenharSemanaKanban(areaGrade);
		else this.desenharAno(areaGrade);
	}

	destruir(): void {
		// O único recurso fora do containerEl é o timer da marca de "agora" do modo Dia.
		this.cancelarMarcaDeAgora();
		this.destruirMotoresDaLista();
	}

	// ---------- Modo "Lista": duas colunas, cada uma com uma Visualização salva ----------

	private destruirMotoresDaLista(): void {
		for (const motor of this.motoresLista) motor.destruir();
		this.motoresLista = [];
	}

	// Cada coluna é um MotorLista completo rodando sobre o filtro da Visualização salva escolhida em
	// Configurações. Reuso, não código novo: agrupamento, ordenação, cartões e menu do clique direito
	// vêm de graça, e o que a coluna mostra é exatamente o que a mesma visualização mostra embutida
	// numa nota.
	private desenharLista(container: HTMLElement): void {
		this.destruirMotoresDaLista();
		container.addClass("mytasks-calendario-lista");

		const cfg = this.opcoes.configuracoes;
		const colunas: { id: string | null; lado: "esquerda" | "direita" }[] = [
			{ id: cfg.calendarioListaColunaEsquerdaId, lado: "esquerda" },
			{ id: cfg.calendarioListaColunaDireitaId, lado: "direita" },
		];

		for (const coluna of colunas) {
			const colunaEl = container.createDiv({ cls: "mytasks-calendario-lista-coluna" });
			const visualizacao = coluna.id ? cfg.visualizacoesSalvas.find((v) => v.id === coluna.id) : undefined;

			// Coluna sem visualização escolhida (ou apontando pra uma que foi apagada depois) explica o
			// que fazer, em vez de aparecer vazia como se não houvesse tarefa nenhuma.
			if (!visualizacao) {
				colunaEl.createEl("p", {
					cls: "mytasks-vazio",
					text: coluna.id
						? "A Visualização salva desta coluna não existe mais — escolha outra em Configurações → Calendário."
						: "Escolha uma Visualização salva para esta coluna em Configurações → Calendário.",
				});
				continue;
			}

			colunaEl.createDiv({ cls: "mytasks-calendario-lista-titulo", text: visualizacao.nome });

			const filtroDaColuna = compilarFiltro(visualizacao.raiz, this.opcoes.app, null, cfg);
			const motor = new MotorLista(colunaEl.createDiv(), {
				app: this.opcoes.app,
				repositorio: this.opcoes.repositorio,
				configuracoes: cfg,
				// O filtro do CALENDÁRIO (barrinha do cabeçalho) continua valendo, somado ao da
				// visualização: as duas colunas respeitam o que ela filtrou na tela.
				filtro: (tarefa) => {
					if (this.opcoes.filtro && !this.opcoes.filtro(tarefa)) return false;
					return filtroDaColuna(tarefa);
				},
				agrupamentoInicial: visualizacao.agrupamento ?? "nenhum",
				// A coluna é estreita e já tem título próprio: sem seletores de agrupamento/filtro nem
				// botão de nova tarefa, que duplicariam controles que o cabeçalho do calendário já tem.
				permitirTrocaAgrupamento: false,
				permitirEdicaoFiltro: false,
				permitirCriarTarefa: false,
			});
			motor.renderizar();
			this.motoresLista.push(motor);
		}
	}

	// ---------- Marca de "agora" (modo Dia) ----------

	// Redesenha o modo Dia quando o relógio vira a próxima meia hora, pra marca andar sozinha sem a
	// usuária precisar reabrir a view. Usa setTimeout até a virada exata em vez de um intervalo fixo de
	// 30 min: um intervalo criado às 14:12 dispararia às 14:42, doze minutos depois da hora que importa.
	private agendarMarcaDeAgora(): void {
		this.cancelarMarcaDeAgora();

		const agora = new Date();
		const proxima = new Date(agora);
		// Próxima fronteira de meia hora: :30 se ainda não passou dela, senão :00 da hora seguinte.
		proxima.setSeconds(0, 0);
		if (agora.getMinutes() < 30) proxima.setMinutes(30);
		else proxima.setMinutes(60);

		this.timerAgora = window.setTimeout(() => {
			this.timerAgora = null;
			// Só redesenha se a view ainda estiver no modo Dia — trocar de modo antes da virada não
			// deve forçar um render do modo novo.
			if (this.modo === "semana-horarios") this.renderizar();
		}, proxima.getTime() - agora.getTime());
	}

	private cancelarMarcaDeAgora(): void {
		if (this.timerAgora === null) return;
		window.clearTimeout(this.timerAgora);
		this.timerAgora = null;
	}

	private tarefasFiltradas(): Tarefa[] {
		const todas = this.opcoes.repositorio.listarTarefas().filter((t) => t.data !== null);
		const filtroFixo = this.opcoes.filtro ? todas.filter(this.opcoes.filtro) : todas;
		const filtroInterativo = compilarFiltro(this.grupoFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
		return filtroFixo.filter(filtroInterativo);
	}

	// Único ponto de verdade de "esta tarefa cai neste dia?" para os quatro modos. Com a antecipação
	// desligada é literalmente `t.data === diaIso` (o que cada modo fazia à mão antes); ligada, a tarefa
	// ocupa também os dias de antecedência. Centralizado de propósito: eram quatro cópias da comparação,
	// e mudar só algumas deixaria a antecipação valendo no Mês e não no Dia, por exemplo.
	private ocupaDia(tarefa: Tarefa, diaIso: string): boolean {
		return tarefaOcupaDia(tarefa, diaIso, this.opcoes.configuracoes.anteciparPendencias);
	}

	// Todos os dias (ISO) que a tarefa ocupa dentro da janela desenhada — usado pelos modos que indexam
	// as tarefas por dia de uma vez só (Mês e Ano) em vez de filtrar dia a dia.
	private diasOcupados(tarefa: Tarefa, inicioJanela: string, fimJanela: string): string[] {
		const prazo = tarefa.data;
		if (!prazo) return [];
		const inicioTarefa = inicioDaJanelaDeTarefa(tarefa, this.opcoes.configuracoes.anteciparPendencias);
		if (!inicioTarefa) return [];

		// Recorta a janela da tarefa pela janela desenhada: uma tarefa com 90 dias de antecedência não
		// deve gerar 90 entradas quando só 42 dias estão na tela.
		const de = inicioTarefa < inicioJanela ? inicioJanela : inicioTarefa;
		const ate = prazo > fimJanela ? fimJanela : prazo;
		if (de > ate) return [];

		const dias: string[] = [];
		const [ano, mes, dia] = de.split("-").map(Number);
		const cursor = new Date(ano, mes - 1, dia);
		for (;;) {
			const a = cursor.getFullYear();
			const m = String(cursor.getMonth() + 1).padStart(2, "0");
			const d = String(cursor.getDate()).padStart(2, "0");
			const iso = `${a}-${m}-${d}`;
			if (iso > ate) break;
			dias.push(iso);
			cursor.setDate(cursor.getDate() + 1);
		}
		return dias;
	}

	// Eventos externos da janela pedida, indexados por dia (AAAA-MM-DD) e já ordenados por horário.
	// Os filtros do calendário NÃO se aplicam aqui: eles comparam propriedades de tarefa (status,
	// grupo, prazo), que um compromisso do Google não tem. O interruptor geral em Configurações é o
	// controle de exibição dos eventos.
	private eventosPorDia(inicio: Date, fim: Date): Map<string, EventoExterno[]> {
		const mapa = new Map<string, EventoExterno[]>();
		const servico = this.opcoes.calendariosExternos;
		// Sem grupo identificado não há de quais agendas puxar: as agendas são cadastradas por grupo.
		if (!servico || !this.opcoes.grupoAtivoId) return mapa;

		for (const evento of servico.eventosNaJanela(this.opcoes.grupoAtivoId, inicio, fim)) {
			let lista = mapa.get(evento.data);
			if (!lista) {
				lista = [];
				mapa.set(evento.data, lista);
			}
			lista.push(evento);
		}
		for (const lista of mapa.values()) {
			lista.sort((a, b) => compararPorHorario(a.horario, b.horario) || a.titulo.localeCompare(b.titulo));
		}
		return mapa;
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

		// O modo "Lista" não tem período: as colunas são Visualizações salvas (filtros), não um
		// intervalo de datas. Setas e "Hoje" não teriam o que navegar, então nem aparecem.
		if (this.modo !== "lista") {
			const navegacao = ladoEsquerdo.createDiv({ cls: "mytasks-calendario-navegacao" });

			const botaoAnterior = navegacao.createEl("button", { text: "‹" });
			botaoAnterior.addEventListener("click", () => this.navegar(-1));

			const botaoHoje = navegacao.createEl("button", { text: "Hoje", cls: "mytasks-calendario-botao-hoje" });
			botaoHoje.addEventListener("click", () => {
				this.dataReferencia = new Date();
				this.renderizar();
			});

			const botaoProximo = navegacao.createEl("button", { text: "›" });
			botaoProximo.addEventListener("click", () => this.navegar(1));
		}

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

		if (this.modo !== "lista") {
			ladoEsquerdo.createEl("span", { text: this.rotuloPeriodo(), cls: "mytasks-calendario-rotulo-periodo" });
		}

		const ladoDireito = cabecalho.createDiv({ cls: "mytasks-calendario-cabecalho-lado mytasks-calendario-cabecalho-lado-direito" });

		// Abas de visualização (dia · semana · mês · ano), ANTES do filtro. Trocar de modo é a ação
		// mais frequente do cabeçalho, então fica sempre à vista em vez de dentro de um menu.
		if (this.opcoes.permitirTrocaModo !== false) {
			const abas = ladoDireito.createDiv({ cls: "mytasks-calendario-abas-modo" });
			for (const chave of Object.keys(ROTULOS_MODO) as ModoCalendario[]) {
				const aba = abas.createEl("button", {
					cls: "mytasks-calendario-aba-modo",
					text: ROTULOS_MODO[chave],
				});
				if (chave === this.modo) aba.addClass("mytasks-calendario-aba-modo-ativa");
				aba.addEventListener("click", () => {
					if (chave === this.modo) return;
					this.modo = chave;
					this.renderizar();
				});
			}
		}

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
			const nomeMes = NOMES_MES[dia.getMonth()];
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
		// Soltar grava direto no frontmatter (data e, quando o alvo tem horário, a propriedade de
		// horário) — sem abrir modal. `horario` undefined = alvo sem hora (mês/semana), preserva o
		// horário que a tarefa já tinha; `null` = coluna "sem horário", remove a propriedade.
		elemento.addEventListener("drop", async (evento) => {
			const caminho = evento.dataTransfer?.getData(FORMATO_DRAG_TAREFA);
			elemento.removeClass("mytasks-calendario-alvo-soltura");
			if (!caminho) return;
			evento.preventDefault();
			const tarefa = this.opcoes.repositorio.listarTarefas().find((t) => t.caminho === caminho);
			if (!tarefa) return;
			await this.opcoes.repositorio.atualizarData(tarefa, data, horario);
			this.renderizar();
		});
	}

	// ---------- Modo Mês ----------

	private desenharMes(container: HTMLElement): void {
		const tarefas = this.tarefasFiltradas();
		const grade = container.createDiv({ cls: "mytasks-calendario-grade-mes" });

		for (const nome of NOMES_DIA_SEMANA_COMPLETO) {
			grade.createDiv({ cls: "mytasks-calendario-cabecalho-dia-semana", text: nome });
		}

		const ano = this.dataReferencia.getFullYear();
		const mes = this.dataReferencia.getMonth();
		const primeiroDiaMes = new Date(ano, mes, 1);
		const inicioGrade = inicioSemana(primeiroDiaMes);
		const hojeStr = formatarData(new Date());

		// A grade do mês mostra 42 células, então a janela de eventos vai do primeiro ao último dia
		// DESENHADO (não do mês calendário) — senão os dias vizinhos ficariam sem compromissos.
		const fimGrade = new Date(inicioGrade);
		fimGrade.setDate(fimGrade.getDate() + 41);
		const eventosPorDia = this.eventosPorDia(inicioGrade, fimGrade);

		// Indexado DEPOIS da janela ser conhecida: com antecipação, uma tarefa entra em vários dias, e o
		// recorte pela grade evita expandir dias que nem estão na tela.
		const inicioGradeStr = formatarData(inicioGrade);
		const fimGradeStr = formatarData(fimGrade);
		const porDia = new Map<string, Tarefa[]>();
		for (const tarefa of tarefas) {
			for (const diaOcupado of this.diasOcupados(tarefa, inicioGradeStr, fimGradeStr)) {
				if (!porDia.has(diaOcupado)) porDia.set(diaOcupado, []);
				porDia.get(diaOcupado)!.push(tarefa);
			}
		}

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
			const eventosDoDia = eventosPorDia.get(diaStr) ?? [];
			const listaDia = celula.createDiv({ cls: "mytasks-calendario-lista-dia" });

			// Compromissos e tarefas numa fila só, ordenada por horário (quem não tem horário vai pro
			// fim) — é o que faz a célula parecer uma agenda do dia em vez de duas pilhas separadas.
			const itensDoDia = this.ordenarItensDoDia(tarefasDoDia, eventosDoDia);
			for (const item of itensDoDia.slice(0, MAX_ITENS_CELULA_MES)) {
				if (item.tipo === "evento") {
					desenharEventoExterno(listaDia, item.evento, { compacto: true });
				} else {
					desenharCartaoTarefa(
						listaDia,
						this.opcoes.app,
						this.opcoes.repositorio,
						this.opcoes.configuracoes,
						item.tarefa,
						this.opcoesCartao({ mostrarCheckbox: true, aoAtualizar: () => this.renderizar() })
					);
				}
			}
			if (itensDoDia.length > MAX_ITENS_CELULA_MES) {
				listaDia.createDiv({
					cls: "mytasks-calendario-mais",
					text: `Mais ${itensDoDia.length - MAX_ITENS_CELULA_MES}`,
				});
			}

			celula.addEventListener("click", () => {
				this.diaExpandido = this.diaExpandido === diaStr ? null : diaStr;
				this.mostrarDetalheDia(celula, diaStr, tarefasDoDia, eventosDoDia);
			});
			celula.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
			this.registrarAlvoDeSoltura(celula, diaStr);
		}
	}

	// Intercala tarefas e compromissos de um dia numa fila só, por horário. Empate entre um evento e
	// uma tarefa no mesmo horário deixa o EVENTO primeiro: compromisso é hora marcada com terceiros,
	// a tarefa é o que ela encaixa em volta.
	private ordenarItensDoDia(
		tarefas: Tarefa[],
		eventos: EventoExterno[]
	): ({ tipo: "evento"; evento: EventoExterno } | { tipo: "tarefa"; tarefa: Tarefa })[] {
		const itens: ({ tipo: "evento"; evento: EventoExterno; hora: string | null } | { tipo: "tarefa"; tarefa: Tarefa; hora: string | null })[] = [
			...eventos.map((evento) => ({ tipo: "evento" as const, evento, hora: evento.horario })),
			...tarefas.map((tarefa) => ({ tipo: "tarefa" as const, tarefa, hora: tarefa.horario ?? null })),
		];
		itens.sort((a, b) => {
			const porHora = compararPorHorario(a.hora, b.hora);
			if (porHora !== 0) return porHora;
			if (a.tipo !== b.tipo) return a.tipo === "evento" ? -1 : 1;
			return 0;
		});
		return itens.map((item) =>
			item.tipo === "evento" ? { tipo: "evento", evento: item.evento } : { tipo: "tarefa", tarefa: item.tarefa }
		);
	}

	private mostrarDetalheDia(
		celula: HTMLElement,
		diaStr: string,
		tarefas: Tarefa[],
		eventos: EventoExterno[] = []
	): void {
		const existente = celula.querySelector(".mytasks-calendario-detalhe-dia");
		if (existente) {
			existente.remove();
			return;
		}
		const detalhe = celula.createDiv({ cls: "mytasks-calendario-detalhe-dia" });
		const itens = this.ordenarItensDoDia(tarefas, eventos);
		if (itens.length === 0) {
			detalhe.createEl("p", { text: "Nenhuma tarefa neste dia.", cls: "mytasks-vazio" });
			return;
		}
		for (const item of itens) {
			if (item.tipo === "evento") {
				desenharEventoExterno(detalhe, item.evento);
			} else {
				desenharCartaoTarefa(
					detalhe,
					this.opcoes.app,
					this.opcoes.repositorio,
					this.opcoes.configuracoes,
					item.tarefa,
					this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
				);
			}
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

		const fimSemana = new Date(inicio);
		fimSemana.setDate(fimSemana.getDate() + numColunas - 1);
		const eventosPorDia = this.eventosPorDia(inicio, fimSemana);

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
			cabecalhoColuna.createEl("span", { text: NOMES_DIA_SEMANA_COMPLETO[dia.getDay()].toLowerCase() });

			coluna.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
			this.registrarAlvoDeSoltura(coluna, diaStr);

			const tarefasDoDia = tarefas.filter((t) => this.ocupaDia(t, diaStr));
			const itensDoDia = this.ordenarItensDoDia(tarefasDoDia, eventosPorDia.get(diaStr) ?? []);
			for (const item of itensDoDia) {
				if (item.tipo === "evento") {
					desenharEventoExterno(coluna, item.evento);
				} else {
					desenharCartaoTarefa(
						coluna,
						this.opcoes.app,
						this.opcoes.repositorio,
						this.opcoes.configuracoes,
						item.tarefa,
						this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
					);
				}
			}
		}
	}

	// ---------- Modo Dia (sem horário + manhã/tarde/noite) ----------

	// Quatro colunas lado a lado para UM dia: a primeira reúne as tarefas do dia ainda sem horário
	// (arrastar dali para uma faixa é o gesto de agendar), e as outras três são as faixas fixas do dia,
	// cada uma com uma linha por hora. As quatro rolam juntas numa área só.
	private desenharSemanaComHorarios(container: HTMLElement): void {
		const tarefas = this.tarefasFiltradas();
		const agora = new Date();
		const diaStr = formatarData(this.dataReferencia);
		const ehHoje = diaStr === formatarData(agora);
		// Só faz sentido acompanhar o relógio quando o dia visível é hoje — navegando pra outra data,
		// o timer anterior é descartado e nenhum novo é criado.
		if (ehHoje) this.agendarMarcaDeAgora();
		else this.cancelarMarcaDeAgora();

		const tarefasDoDia = tarefas.filter((t) => this.ocupaDia(t, diaStr));
		const eventosDoDia = this.eventosPorDia(this.dataReferencia, this.dataReferencia).get(diaStr) ?? [];

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
		const foraDasFaixas = (horario: string | null): boolean => {
			if (!horario) return true;
			const hora = parseInt(horario.split(":")[0], 10);
			if (Number.isNaN(hora)) return true;
			return !FAIXAS_DIA.some((f) => hora >= f.horaInicial && hora <= f.horaFinal);
		};

		const semHorario = tarefasDoDia.filter((t) => foraDasFaixas(t.horario));
		// Evento de dia inteiro e evento de madrugada caem aqui pelo mesmo motivo das tarefas: não há
		// linha de hora que os comporte, e sumir da tela seria pior que ficar nesta coluna.
		const eventosSemHorario = eventosDoDia.filter((e) => e.diaInteiro || foraDasFaixas(e.horario));

		for (const item of this.ordenarItensDoDia(semHorario, eventosSemHorario)) {
			if (item.tipo === "evento") {
				desenharEventoExterno(corpoSemHorario, item.evento);
			} else {
				desenharCartaoTarefa(
					corpoSemHorario,
					this.opcoes.app,
					this.opcoes.repositorio,
					this.opcoes.configuracoes,
					item.tarefa,
					this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
				);
			}
		}
		corpoSemHorario.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr));
		// horario: null → soltar aqui remove o horário da tarefa (desagenda, volta a ser só "do dia").
		this.registrarAlvoDeSoltura(corpoSemHorario, diaStr, null);

		// --- Colunas 2 a 4: manhã, tarde e noite, uma linha por hora ---
		for (const faixa of FAIXAS_DIA) {
			const coluna = grade.createDiv({ cls: "mytasks-calendario-coluna-faixa" });
			coluna.createDiv({ cls: "mytasks-calendario-titulo-faixa", text: faixa.titulo });

			const corpoFaixa = coluna.createDiv({ cls: "mytasks-calendario-corpo-faixa" });

			// Duas linhas por hora: cheia (:00) e meia (:30), todas com o mesmo espaçamento de 30 min.
			for (let hora = faixa.horaInicial; hora <= faixa.horaFinal; hora++) {
				for (const minuto of [0, 30]) {
					const linha = corpoFaixa.createDiv({ cls: "mytasks-calendario-linha-hora" });
					if (minuto === 30) linha.addClass("mytasks-calendario-linha-meia-hora");
					const horarioClique = `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
					// Rótulo enxuto pra coluna de hora ficar estreita e sobrar largura pros cartões:
					// hora cheia mostra só a hora ("06"), meia hora só os minutos ("30"). O horário
					// completo continua em `horarioClique` — é o que vai pro clique e pro arrastar.
					const rotuloHora = minuto === 0 ? String(hora).padStart(2, "0") : "30";
					linha.createDiv({ cls: "mytasks-calendario-rotulo-hora", text: rotuloHora });

					// Marca de "agora": só no dia de hoje, na linha de meia hora que contém o horário atual
					// (14:12 → linha das 14:00; 14:47 → linha das 14:30). O CSS desenha um contorno fechado
					// em volta dessa faixa. A cor vem de --interactive-accent, então acompanha o tema/cor de
					// destaque escolhido em Aparência. O timer que redesenha a cada meia hora fica em
					// agendarMarcaDeAgora().
					if (ehHoje && hora === agora.getHours() && (minuto === 0) === (agora.getMinutes() < 30)) {
						linha.addClass("mytasks-calendario-linha-agora");
					}

					const celulaHora = linha.createDiv({ cls: "mytasks-calendario-celula-hora" });
					// Cada item cai numa única linha: minuto < 30 na linha cheia, >= 30 na de meia hora.
					// Mesma regra para tarefa e compromisso, então 14:45 aparece na linha 14:30 nos dois.
					const nestaLinha = (horario: string | null): boolean => {
						if (!horario) return false;
						const [h, m] = horario.split(":").map((parte) => parseInt(parte, 10));
						if (h !== hora) return false;
						return minuto === 0 ? !(m >= 30) : m >= 30;
					};
					const tarefasHora = tarefasDoDia.filter((t) => nestaLinha(t.horario));
					const eventosHora = eventosDoDia.filter((e) => !e.diaInteiro && nestaLinha(e.horario));

					for (const item of this.ordenarItensDoDia(tarefasHora, eventosHora)) {
						if (item.tipo === "evento") {
							desenharEventoExterno(celulaHora, item.evento);
						} else {
							desenharCartaoTarefa(
								celulaHora,
								this.opcoes.app,
								this.opcoes.repositorio,
								this.opcoes.configuracoes,
								item.tarefa,
								this.opcoesCartao({ aoAtualizar: () => this.renderizar() })
							);
						}
					}
					celulaHora.addEventListener("contextmenu", (evento) => this.abrirMenuNovaTarefa(evento, diaStr, horarioClique));
					this.registrarAlvoDeSoltura(celulaHora, diaStr, horarioClique);
				}
			}
		}
	}

	// ---------- Modo Ano ----------

	private desenharAno(container: HTMLElement): void {
		const tarefas = this.tarefasFiltradas();
		const ano = this.dataReferencia.getFullYear();
		const contagemPorDia = new Map<string, number>();
		for (const tarefa of tarefas) {
			for (const diaOcupado of this.diasOcupados(tarefa, `${ano}-01-01`, `${ano}-12-31`)) {
				contagemPorDia.set(diaOcupado, (contagemPorDia.get(diaOcupado) ?? 0) + 1);
			}
		}

		const grade = container.createDiv({ cls: "mytasks-calendario-grade-ano" });

		// Janela do ano inteiro: uma expansão só, reaproveitada pelos doze mini-meses.
		const eventosPorDia = this.eventosPorDia(new Date(ano, 0, 1), new Date(ano, 11, 31));

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
				const quantidadeEventos = (eventosPorDia.get(diaStr) ?? []).length;
				const miniCelula = miniGrade.createDiv({ cls: "mytasks-calendario-mini-celula", text: String(dia.getDate()) });
				if (diaStr === hojeStr) miniCelula.addClass("mytasks-calendario-hoje");
				if (quantidade > 0 || quantidadeEventos > 0) {
					miniCelula.addClass("mytasks-calendario-mini-com-tarefas");
					// Um dia só com compromisso ganha marca própria: no modo Ano a bolinha é a única
					// informação, então "tem tarefa" e "tem compromisso" precisam ser distinguíveis.
					if (quantidade === 0) miniCelula.addClass("mytasks-calendario-mini-so-eventos");
					const partes: string[] = [];
					if (quantidade > 0) partes.push(`${quantidade} tarefa(s)`);
					if (quantidadeEventos > 0) partes.push(`${quantidadeEventos} compromisso(s)`);
					miniCelula.setAttribute("title", partes.join(" · "));
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
