export type Recorrencia = "nenhuma" | "diaria" | "a_cada_2_dias" | "a_cada_3_dias" | "semanal" | "mensal" | "anual";

export type TipoPropriedade = "texto" | "selecao" | "data" | "link_arquivo" | "lista";

export type ModoCalendario = "mes" | "semana-horarios" | "semana-kanban" | "ano";

export const ROTULOS_MODO: Record<ModoCalendario, string> = {
	mes: "Mês",
	"semana-horarios": "Semana (horários)",
	"semana-kanban": "Semana (dias)",
	ano: "Ano",
};

export interface OpcaoSelecao {
	valor: string;
	cor?: string;
}

export type EstiloDestaque = "checkbox" | "linha" | "borda";

export const ROTULOS_ESTILO_DESTAQUE: Record<EstiloDestaque, string> = {
	checkbox: "Checkbox colorido",
	linha: "Linha inteira colorida",
	borda: "Borda lateral colorida",
};

export type EspessuraCheckbox = "fina" | "media" | "grossa";

export const ROTULOS_ESPESSURA: Record<EspessuraCheckbox, string> = {
	fina: "Fina",
	media: "Média",
	grossa: "Grossa",
};

export const PIXELS_ESPESSURA: Record<EspessuraCheckbox, string> = {
	fina: "1px",
	media: "2px",
	grossa: "3px",
};

export interface ConfigDestaque {
	propriedadeId: string;
	estilo: EstiloDestaque;
	espessuraCheckbox: EspessuraCheckbox;
}

// Cada estilo (checkbox/linha/borda) pode ser usado por no máximo uma propriedade por vez,
// mas os 3 estilos podem estar ativos simultaneamente, cada um controlado por uma propriedade diferente.
export type ConfigDestaques = Partial<Record<EstiloDestaque, ConfigDestaque>>;

export const ID_STATUS = "status";

export type OperadorFiltro = "igual" | "arquivo-atual" | "periodo";

// "antes"/"depois" comparam com uma única âncora; "referente-a" define uma janela [início, fim] em torno de hoje.
export type OperadorPeriodo = "antes" | "depois" | "referente-a";

// Âncoras de antes/depois: um ponto fixo. Âncoras de referente-a: uma janela.
export type AncoraPeriodo =
	| "hoje"
	| "amanha"
	| "ontem"
	| "dia-especifico"
	| "esta-semana"
	| "este-mes"
	| "proximos-dias"
	| "proximo-mes"
	| "ultimos-dias"
	| "ultimo-mes";

export interface PeriodoFiltro {
	operador: OperadorPeriodo;
	ancora: AncoraPeriodo;
	dataEspecifica?: string; // AAAA-MM-DD, só quando ancora === "dia-especifico"
	quantidadeDias?: number; // só quando ancora === "proximos-dias" | "ultimos-dias"
}

export interface CondicaoFiltro {
	propriedadeId: string;
	operador: OperadorFiltro;
	valores: string[];
	periodo?: PeriodoFiltro; // só quando operador === "periodo"
}

export type TipoAgrupamento = "nenhum" | "dia" | string;

export type TipoView = "lista" | "calendario" | "kanban";

export interface VisualizacaoSalva {
	id: string;
	nome: string;
	tipoView: TipoView;
	condicoes: CondicaoFiltro[];
	agrupamento?: TipoAgrupamento;
	modoCalendario?: ModoCalendario;
	// IDs de Filtros salvos (Configurações → Filtros) disponíveis como filtro extra opcional quando
	// esta visualização está embutida numa nota — soma-se (E lógico) ao filtro fixo (`condicoes`) acima.
	filtrosExtrasIds?: string[];
	// Qual dos filtrosExtrasIds já vem selecionado ao abrir/renderizar o embed. Deve ser um dos IDs
	// presentes em filtrosExtrasIds — se não estiver mais na lista (ex: removido depois), é ignorado.
	filtroExtraPadraoId?: string | null;
}

// Filtro pré-configurado, escolhível na barrinha de Filtro da Lista/Kanban gerais (sidebar e aba) — diferente de VisualizacaoSalva, que é para embutir em notas.
export interface FiltroSalvo {
	id: string;
	nome: string;
	condicoes: CondicaoFiltro[];
}

export interface PropriedadeDefinida {
	id: string;
	rotulo: string;
	tipo: TipoPropriedade;
	opcoes?: OpcaoSelecao[];
	ordem: number;
}

export interface ConfigStatus {
	rotulo: string;
	opcoes: OpcaoSelecao[];
}

export interface ConfigData {
	rotulo: string;
	chave: string;
}

export interface ConfiguracoesGestorTarefas {
	pastaTarefas: string;
	moverConcluidas: boolean;
	pastaConcluidas: string;
	status: ConfigStatus;
	dataTarefa: ConfigData;
	propriedades: PropriedadeDefinida[];
	destaques: ConfigDestaques;
	corAviso: string;
	calendarioMostrarDetalhes: boolean;
	calendarioPropriedadesVisiveisPorModo: Record<ModoCalendario, string[] | null>;
	kanbanPropriedadesVisiveis: string[] | null;
	listaPropriedadesVisiveis: string[] | null;
	listaInboxPropriedadesVisiveis: string[] | null;
	visualizacoesSalvas: VisualizacaoSalva[];
	filtrosSalvos: FiltroSalvo[];
	// Aplicados sempre que a respectiva view abre pela primeira vez (sidebar ou aba) — não afeta
	// Visualizações salvas nem o "filtro móvel" de embeds, que já têm seus próprios mecanismos.
	agrupamentoPadraoKanban: TipoAgrupamento;
	agrupamentoPadraoLista: TipoAgrupamento;
	filtroPadraoCalendarioId: string | null;
	filtroPadraoKanbanId: string | null;
	filtroPadraoListaId: string | null;
}

export const CONFIGURACOES_PADRAO: ConfiguracoesGestorTarefas = {
	pastaTarefas: "Tarefas",
	moverConcluidas: false,
	pastaConcluidas: "",
	status: {
		rotulo: "Status",
		opcoes: [{ valor: "Inbox" }, { valor: "Fazer" }, { valor: "Concluído" }],
	},
	dataTarefa: { rotulo: "Data", chave: "data" },
	propriedades: [],
	destaques: {},
	corAviso: "#e03131",
	calendarioMostrarDetalhes: true,
	calendarioPropriedadesVisiveisPorModo: {
		mes: [],
		"semana-horarios": [],
		"semana-kanban": [],
		ano: [],
	},
	kanbanPropriedadesVisiveis: [],
	listaPropriedadesVisiveis: [],
	listaInboxPropriedadesVisiveis: [],
	visualizacoesSalvas: [],
	filtrosSalvos: [],
	agrupamentoPadraoKanban: ID_STATUS,
	agrupamentoPadraoLista: "nenhum",
	filtroPadraoCalendarioId: null,
	filtroPadraoKanbanId: null,
	filtroPadraoListaId: null,
};

export type PropriedadeValor = string | string[] | null;

export interface Tarefa {
	caminho: string;
	titulo: string;
	status: string;
	statusAnterior: string | null;
	data: string | null;
	dataEntrada: string;
	horario: string | null;
	recorrencia: Recorrencia;
	manterHistorico: boolean;
	recorrenciaDataFim: string | null;
	diasAntecedenciaAviso: number | null;
	propriedades: Record<string, PropriedadeValor>;
	// Vínculo entre uma ocorrência concluída e a próxima que ela gerou — usado para desfazer a conclusão com segurança.
	proximaOcorrenciaCaminho: string | null;
	nasceuDeOcorrenciaCaminho: string | null;
}

export const RECORRENCIA_LABELS: Record<Recorrencia, string> = {
	nenhuma: "Não repete",
	diaria: "Diariamente",
	a_cada_2_dias: "A cada 2 dias",
	a_cada_3_dias: "A cada 3 dias",
	semanal: "Semanalmente",
	mensal: "Mensalmente",
	anual: "Anualmente",
};

export const REGEX_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

// Deriva a chave técnica do frontmatter a partir de um rótulo digitado pela usuária (ex: "Prazo" -> "prazo").
export function normalizarChave(rotulo: string): string {
	const normalizado = rotulo
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return normalizado || "data";
}

export function ultimaOpcaoStatus(status: ConfigStatus): string | undefined {
	return status.opcoes[status.opcoes.length - 1]?.valor;
}

export function primeiraOpcaoStatus(status: ConfigStatus): string | undefined {
	return status.opcoes[0]?.valor;
}

// Primeira opção "com data" (logo após o Inbox fixo) — usada sempre que uma tarefa nasce/é regravada já com data.
export function opcaoStatusComData(status: ConfigStatus): string | undefined {
	return status.opcoes[1]?.valor ?? status.opcoes[0]?.valor;
}

// Regra posicional (mesmo padrão de ultimaOpcaoStatus = "concluído"): Inbox é sempre a primeira opção de Status.
export function estaNoInbox(tarefa: Tarefa, configuracoes: ConfiguracoesGestorTarefas): boolean {
	return tarefa.status === primeiraOpcaoStatus(configuracoes.status);
}

function dentroDeUmaPasta(caminhoArquivo: string, pasta: string): boolean {
	return caminhoArquivo === pasta || caminhoArquivo.startsWith(pasta + "/");
}

// Um arquivo conta como tarefa se estiver na pasta de Tarefas, OU na pasta de Concluídas (quando
// "mover concluídas" está ativo) — tarefas concluídas continuam aparecendo na Lista/Kanban mesmo
// movidas de pasta; só um filtro ativo deve escondê-las, não a localização física do arquivo.
export function arquivoEhTarefaRelevante(configuracoes: ConfiguracoesGestorTarefas, caminhoArquivo: string): boolean {
	const { pastaTarefas, moverConcluidas, pastaConcluidas } = configuracoes;
	if (dentroDeUmaPasta(caminhoArquivo, pastaTarefas)) return true;
	if (moverConcluidas && pastaConcluidas && dentroDeUmaPasta(caminhoArquivo, pastaConcluidas)) return true;
	return false;
}

function corDaPropriedade(tarefa: Tarefa, configuracoes: ConfiguracoesGestorTarefas, propriedadeId: string): string | null {
	if (propriedadeId === ID_STATUS) {
		return configuracoes.status.opcoes.find((o) => o.valor === tarefa.status)?.cor ?? null;
	}

	const def = configuracoes.propriedades.find((p) => p.id === propriedadeId);
	if (!def || def.tipo !== "selecao") return null;

	const valor = tarefa.propriedades[def.id];
	if (typeof valor !== "string") return null;
	return def.opcoes?.find((o) => o.valor === valor)?.cor ?? null;
}

/** Cor de destaque para um estilo específico (checkbox/linha/borda), ou null se nenhuma propriedade controla esse estilo. */
export function corDeDestaquePorEstilo(
	tarefa: Tarefa,
	configuracoes: ConfiguracoesGestorTarefas,
	estilo: EstiloDestaque
): string | null {
	const destaque = configuracoes.destaques[estilo];
	if (!destaque) return null;
	return corDaPropriedade(tarefa, configuracoes, destaque.propriedadeId);
}

export function obterVisualizacao(
	configuracoes: ConfiguracoesGestorTarefas,
	idOuNome: string
): VisualizacaoSalva | undefined {
	const porId = configuracoes.visualizacoesSalvas.find((v) => v.id === idOuNome);
	if (porId) return porId;
	const alvo = idOuNome.toLowerCase();
	return configuracoes.visualizacoesSalvas.find((v) => v.nome.toLowerCase() === alvo);
}

export function obterFiltroSalvo(configuracoes: ConfiguracoesGestorTarefas, id: string): FiltroSalvo | undefined {
	return configuracoes.filtrosSalvos.find((f) => f.id === id);
}

export function emPeriodoDeAviso(tarefa: Tarefa, hoje: Date): boolean {
	if (!tarefa.data) return false;
	if (!tarefa.diasAntecedenciaAviso || tarefa.diasAntecedenciaAviso <= 0) return false;

	const [ano, mes, dia] = tarefa.data.split("-").map(Number);
	const dataTarefa = new Date(ano, mes - 1, dia);
	const dataAviso = new Date(dataTarefa);
	dataAviso.setDate(dataAviso.getDate() - tarefa.diasAntecedenciaAviso);

	const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
	return hojeSemHora >= dataAviso && hojeSemHora <= dataTarefa;
}
