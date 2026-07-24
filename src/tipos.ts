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

// "linha" (linha inteira colorida) foi removida (esse espaço é do aviso de prazo). O estilo "borda"
// mantém a chave por compatibilidade, mas agora é renderizado como uma BOLINHA colorida no fim do título
// (a borda lateral foi trocada por ela). Sobram: checkbox colorido e bolinha colorida.
export type EstiloDestaque = "checkbox" | "borda";

export const ROTULOS_ESTILO_DESTAQUE: Record<EstiloDestaque, string> = {
	checkbox: "Checkbox colorido",
	borda: "Bolinha colorida (no fim do título)",
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

export type OperadorFiltro =
	| "igual" // valor está entre os selecionados (comportamento de sempre)
	| "diferente" // valor NÃO está entre os selecionados
	| "contem" // texto: substring; lista: mesma semântica que "igual" já tinha (array contém algum dos valores)
	| "nao-contem" // negação de "contem"
	| "vazio" // propriedade nula/ausente/""/[] — sem valor
	| "nao-vazio" // oposto de "vazio"
	| "arquivo-atual" // inalterado (link_arquivo)
	| "periodo"; // inalterado (sistema de período rico, ver PeriodoFiltro)

// "antes"/"depois" comparam com uma única âncora; "referente-a" define uma janela [início, fim] em torno de hoje.
export type OperadorPeriodo = "antes" | "depois" | "referente-a";

// Âncoras de antes/depois: um ponto fixo. Âncoras de referente-a: uma janela. "sem-prazo" é o caso
// especial (só faz sentido com o operador "referente-a"): casa a tarefa que NÃO tem prazo — assim dá pra
// montar "antes de hoje OU sem prazo" num bloco de período só, combinado pelo seletor E/OU dos prazos.
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
	| "ultimo-mes"
	| "sem-prazo";

export interface PeriodoFiltro {
	operador: OperadorPeriodo;
	ancora: AncoraPeriodo;
	dataEspecifica?: string; // AAAA-MM-DD, só quando ancora === "dia-especifico"
	quantidadeDias?: number; // só quando ancora === "proximos-dias" | "ultimos-dias"
}

export type CombinacaoPeriodos = "e" | "ou";

// Uma condição-folha (compara UMA propriedade). Grupos (E/OU/NENHUM aninhados) são GrupoFiltro — ver
// abaixo. `tipo` é o discriminante que separa folha de grupo dentro de um ItemFiltro[].
export interface CondicaoFiltro {
	tipo: "condicao";
	propriedadeId: string;
	operador: OperadorFiltro;
	valores: string[];
	periodo?: PeriodoFiltro; // legado: um único período (mantido para migração; ver `periodos`)
	// Vários períodos de prazo combinados entre si (só quando operador === "periodo"). "ou" = a tarefa
	// entra se casar QUALQUER período (união, ex: próximos 30 dias OU atrasadas); "e" = precisa casar todos.
	periodos?: PeriodoFiltro[];
	combinacaoPeriodos?: CombinacaoPeriodos; // default "ou"
}

// "e" = todos os itens verdadeiros (E); "ou" = qualquer item verdadeiro (OU); "nenhum" = nenhum item
// verdadeiro (NÃO — equivale a negar um OU dos itens).
export type CombinadorGrupo = "e" | "ou" | "nenhum";

// Grupo de condições/subgrupos combinados por E/OU/NENHUM — pode aninhar outros GrupoFiltro
// recursivamente (estilo Bases: "+ Adicionar grupo de filtros"). FiltroSalvo/VisualizacaoSalva guardam
// UM GrupoFiltro raiz (não mais uma lista plana de condições).
export interface GrupoFiltro {
	tipo: "grupo";
	combinador: CombinadorGrupo;
	itens: ItemFiltro[];
}

export type ItemFiltro = CondicaoFiltro | GrupoFiltro;

export function grupoFiltroVazio(): GrupoFiltro {
	return { tipo: "grupo", combinador: "e", itens: [] };
}

// Clone profundo de uma árvore de filtro — substitui o antigo `condicoes.map(c => ({...c, valores:[...]}))`
// usado em todo lugar que precisa de uma cópia independente (construtor, modais, seletor, motores). Um
// clone raso não basta mais: mutar uma condição dentro de um subgrupo clonado rasamente ainda mutaria o
// item original (o subgrupo em si não teria sido copiado).
export function clonarGrupoFiltro(grupo: GrupoFiltro): GrupoFiltro {
	return {
		tipo: "grupo",
		combinador: grupo.combinador,
		itens: grupo.itens.map((item) =>
			item.tipo === "grupo" ? clonarGrupoFiltro(item) : { ...item, valores: [...item.valores] }
		),
	};
}

// Conta condições-folha recursivamente (pra mostrar "3 condições" em Configurações, por exemplo).
export function contarCondicoes(grupo: GrupoFiltro): number {
	return grupo.itens.reduce((total, item) => total + (item.tipo === "grupo" ? contarCondicoes(item) : 1), 0);
}

// Lê os períodos de uma condição normalizando o legado `periodo` (único) para a lista `periodos`.
export function periodosDaCondicao(condicao: CondicaoFiltro): PeriodoFiltro[] {
	if (condicao.periodos && condicao.periodos.length > 0) return condicao.periodos;
	if (condicao.periodo) return [condicao.periodo];
	return [];
}

export type TipoAgrupamento = "nenhum" | "dia" | string;

export type TipoView = "lista" | "calendario" | "kanban";

export interface VisualizacaoSalva {
	id: string;
	nome: string;
	tipoView: TipoView;
	raiz: GrupoFiltro;
	agrupamento?: TipoAgrupamento;
	modoCalendario?: ModoCalendario;
	// IDs de Filtros salvos (Configurações → Filtros) disponíveis como filtro extra opcional quando
	// esta visualização está embutida numa nota — soma-se (E lógico) ao filtro fixo (`raiz`) acima.
	filtrosExtrasIds?: string[];
	// Qual dos filtrosExtrasIds já vem selecionado ao abrir/renderizar o embed. Deve ser um dos IDs
	// presentes em filtrosExtrasIds — se não estiver mais na lista (ex: removido depois), é ignorado.
	filtroExtraPadraoId?: string | null;
}

// Filtro pré-configurado, escolhível na barrinha de Filtro da Lista/Kanban gerais (sidebar e aba) — diferente de VisualizacaoSalva, que é para embutir em notas.
export interface FiltroSalvo {
	id: string;
	nome: string;
	raiz: GrupoFiltro;
}

export interface PropriedadeDefinida {
	id: string;
	rotulo: string;
	tipo: TipoPropriedade;
	opcoes?: OpcaoSelecao[];
	ordem: number;
	// Só para tipo "link_arquivo": lista fixa de caminhos disponíveis para escolher (dropdown rápido,
	// sem precisar buscar). Vazia/ausente = busca livre em todo o vault (comportamento de sempre).
	arquivosFixos?: string[];
}

export interface ConfigStatus {
	rotulo: string;
	// Chave técnica no frontmatter (default "status") — separada do rótulo exibido, mesmo padrão de
	// ConfigData.chave. Configs salvas antes dessa separação existir são migradas em migrarCamposDeGrupo.
	chave: string;
	opcoes: OpcaoSelecao[];
}

export interface ConfigData {
	rotulo: string;
	chave: string;
}

// Chaves técnicas no frontmatter dos demais campos fixos do plugin (fora status/prazo, que já tinham seu
// próprio par rotulo/chave). Renomeável em Configurações → Avançado, com migração automática no vault
// (ver RepositorioTarefas.renomearChaveFrontmatter). statusAnterior/ocorrenciaAnterior/proximaOcorrencia
// são campos de uso interno (encadeamento de recorrência) — sem rótulo próprio, só a chave.
export interface ChavesFixas {
	horario: string;
	recorrencia: string;
	recorrenciaDataFim: string;
	antecedencia: string;
	manterHistorico: string;
	entrada: string;
	statusAnterior: string;
	ocorrenciaAnterior: string;
	proximaOcorrencia: string;
}

export const CHAVES_FIXAS_PADRAO: ChavesFixas = {
	horario: "horario",
	recorrencia: "recorrencia",
	recorrenciaDataFim: "recorrencia_data_fim",
	antecedencia: "antecedencia",
	manterHistorico: "manter_historico",
	entrada: "entrada",
	statusAnterior: "status_anterior",
	ocorrenciaAnterior: "ocorrencia_anterior",
	proximaOcorrencia: "proxima_ocorrencia",
};

export interface CampoTemplateFixo {
	id: string;
	rotulo: string;
}

// Campos fixos (além das propriedades customizadas) que podem aparecer na nota criada por "Nova tarefa",
// na ordem em que são desenhados no corpo da nota gerada por gerarCorpoMetaBind. Os rótulos aqui são
// genéricos (usados só na tela de Configurações) — o corpo da nota usa os rótulos configuráveis reais
// (ex: config.status.rotulo, config.dataTarefa.rotulo) para os campos que têm rótulo customizável.
export const CAMPOS_TEMPLATE_NOTA_FIXOS: CampoTemplateFixo[] = [
	{ id: "status", rotulo: "status" },
	{ id: "prazo", rotulo: "prazo" },
	{ id: "horario", rotulo: "horário" },
	{ id: "manter_historico", rotulo: "manter registro ao concluir" },
	{ id: "recorrencia", rotulo: "recorrência" },
	{ id: "repetir_ate", rotulo: "repetir até" },
	{ id: "antecedencia", rotulo: "avisar com antecedência" },
	{ id: "concluir_botao", rotulo: "botão: concluir tarefa" },
];

// Configuração de quais campos (e, nos de opção fixa, quais opções) geram código Meta Bind pra "Nova
// tarefa" (ver meta-bind-tarefa.ts). `camposVisiveis: null` = todos visíveis, exceto "repetir_ate" (ver
// idsTemplateNotaVisiveisPorPadrao). As demais listas ausentes/undefined também significam "todas as
// opções visíveis" (mesmo princípio, campo a campo).
//
// notaModeloCaminho: quando preenchido, "Nova tarefa" copia o CORPO dessa nota (sem o frontmatter dela)
// pra dentro da tarefa nova, em vez de gerar o corpo automaticamente — permite que ela monte a nota do
// jeito que quiser, colando os códigos abaixo onde e como preferir. null/ausente = sem nota modelo, usa
// a geração automática (gerarCorpoMetaBind) como hoje.
//
// notaModeloInboxCaminho: nota modelo exclusiva pra quando a tarefa nasce no Inbox (criada sem data). Se
// preenchida, tarefas de Inbox usam ELA; tarefas com data seguem usando notaModeloCaminho (ou a geração
// automática). null/ausente = Inbox não tem modelo própria, cai no fluxo normal (notaModeloCaminho/auto).
// camposOpcionais: campos que NÃO nascem pré-gravados no frontmatter da tarefa nova — a chave só passa a
// existir quando a usuária a adiciona pela nota (botão updateMetadata do Meta Bind) ou preenche o campo.
// Serve pra manter o frontmatter limpo de campos que ela não usa (ex: "antecedência", "repetir até").
// Ausente/vazio = nenhum campo opcional (comportamento antigo: todos os campos visíveis nascem gravados).
// Só campos com chave própria pré-gravável entram aqui — ver CAMPOS_TEMPLATE_NOTA_OPCIONALIZAVEIS.
export interface TemplateNotaTarefa {
	camposVisiveis: string[] | null;
	camposOpcionais?: string[];
	opcoesStatusVisiveis?: string[];
	opcoesRecorrenciaVisiveis?: Recorrencia[];
	opcoesPropriedadeVisiveis?: Record<string, string[]>;
	notaModeloCaminho?: string | null;
	notaModeloInboxCaminho?: string | null;
}

export const TEMPLATE_NOTA_PADRAO: TemplateNotaTarefa = {
	camposVisiveis: null,
};

// Campos fixos que NÃO podem virar opcionais (sempre nascem quando visíveis): status e prazo são o núcleo
// que Lista/Kanban/Calendário usam pra achar/ordenar tarefa (marcar opcional poderia fazer tarefa sumir das
// views); concluir_botao é um botão, não tem chave de frontmatter pra pré-gravar. Entrada e grupo nem
// passam pelo controle de template (são carimbados sempre em criarTarefa), então não aparecem aqui.
const CAMPOS_TEMPLATE_NOTA_NAO_OPCIONALIZAVEIS = ["status", "prazo", "concluir_botao"];

// Um campo fixo/propriedade pode ser marcado "opcional" (não nasce pré-gravado)? Só os que têm chave própria
// pré-gravável — exclui os essenciais e o botão de concluir.
export function campoPodeSerOpcional(campoId: string): boolean {
	return !CAMPOS_TEMPLATE_NOTA_NAO_OPCIONALIZAVEIS.includes(campoId);
}

// Um campo está marcado como opcional neste grupo? (só faz sentido pra campos visíveis e opcionalizáveis).
export function campoEhOpcional(config: ConfigEfetivaGrupo, campoId: string): boolean {
	if (!campoPodeSerOpcional(campoId)) return false;
	return config.templateNota.camposOpcionais?.includes(campoId) ?? false;
}

// Config "efetiva" de um grupo: o shape plano que TODOS os consumidores de leitura (motores, render,
// agrupamento, filtro, seletores, modal) enxergam. Cada grupo carrega uma cópia independente destes campos;
// o código de leitura nunca vê "vários grupos" — só a config efetiva do SEU grupo (ver configDoGrupo).
export interface ConfigEfetivaGrupo {
	pastaTarefas: string;
	moverConcluidas: boolean;
	pastaConcluidas: string;
	status: ConfigStatus;
	dataTarefa: ConfigData;
	propriedades: PropriedadeDefinida[];
	destaques: ConfigDestaques;
	corAviso: string;
	// Liga/desliga a funcionalidade de recorrência inteira pra este grupo — some do modal de editar
	// tarefa, dos campos oferecidos pra nota (Configurações → Nota de tarefa) e do ícone no card.
	recorrenciaAtiva: boolean;
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
	// Quais campos/opções aparecem na nota criada por "Nova tarefa" (ver meta-bind-tarefa.ts).
	templateNota: TemplateNotaTarefa;
	// Chaves técnicas dos campos fixos (fora status/prazo, que têm seu próprio par rotulo/chave) — ver
	// ChavesFixas. Renomeável em Configurações → Avançado, com migração automática no vault.
	chavesFixas: ChavesFixas;
	// Campos derivados só-leitura, preenchidos por configDoGrupo, para o repositório carimbar o discriminador
	// ao criar tarefas e resolver o pertencimento — não são persistidos (vêm do grupo + do topo global).
	readonly __propriedadeGrupo?: string | null;
	readonly __valorGrupo?: string;
}

// Um grupo de tarefas: o bundle de config independente + identidade (id/valor/nome/ícone).
export interface GrupoTarefas extends ConfigEfetivaGrupo {
	id: string;
	// Valor do discriminador global (ConfiguracoesGestorTarefas.propriedadeGrupo) que casa este grupo.
	valorDiscriminador: string;
	nome: string;
	icone: string; // ícone Lucide para o ribbon da sidebar e o seletor de grupo
}

export interface ConfiguracoesGestorTarefas {
	// Propriedade global (chave de frontmatter) que discrimina a qual grupo cada tarefa pertence. Null = ainda
	// não configurada -> modo single-group (todo mundo cai no primeiro grupo).
	propriedadeGrupo: string | null;
	grupos: GrupoTarefas[];
	// Grupo lembrado por view única (Kanban/Calendário). Null cai no primeiro grupo.
	grupoAtivoKanbanId: string | null;
	grupoAtivoCalendarioId: string | null;
}

// Defaults planos de hoje, agora encapsulados no primeiro grupo. Uma instalação nova nasce com este único grupo
// e propriedadeGrupo null -> comporta-se exatamente como o plugin single-group de antes.
export const GRUPO_PADRAO: GrupoTarefas = {
	id: "grupo_padrao",
	valorDiscriminador: "",
	nome: "Tarefas",
	icone: "check-square",
	pastaTarefas: "Tarefas",
	moverConcluidas: false,
	pastaConcluidas: "",
	status: {
		rotulo: "Status",
		chave: "status",
		opcoes: [{ valor: "Inbox" }, { valor: "Fazer" }, { valor: "Concluído" }],
	},
	dataTarefa: { rotulo: "Data", chave: "data" },
	propriedades: [],
	destaques: {},
	corAviso: "#e03131",
	recorrenciaAtiva: true,
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
	templateNota: { ...TEMPLATE_NOTA_PADRAO },
	chavesFixas: { ...CHAVES_FIXAS_PADRAO },
};

export const CONFIGURACOES_PADRAO: ConfiguracoesGestorTarefas = {
	propriedadeGrupo: null,
	grupos: [{ ...GRUPO_PADRAO }],
	grupoAtivoKanbanId: null,
	grupoAtivoCalendarioId: null,
};

export function grupoPorId(configuracoes: ConfiguracoesGestorTarefas, id: string | null): GrupoTarefas | undefined {
	if (id === null) return undefined;
	return configuracoes.grupos.find((g) => g.id === id);
}

// Nunca retorna undefined enquanto houver ao menos um grupo (sempre há, após a migração): cai no primeiro.
export function grupoAtivoOuPrimeiro(configuracoes: ConfiguracoesGestorTarefas, id: string | null): GrupoTarefas {
	return grupoPorId(configuracoes, id) ?? configuracoes.grupos[0];
}

// Produz a config efetiva de leitura de um grupo: é o próprio grupo (já satisfaz ConfigEfetivaGrupo) com os
// campos derivados globais injetados (propriedade discriminadora + valor deste grupo) para o repositório carimbar.
export function configDoGrupo(configuracoes: ConfiguracoesGestorTarefas, grupo: GrupoTarefas): ConfigEfetivaGrupo {
	return {
		...grupo,
		__propriedadeGrupo: configuracoes.propriedadeGrupo,
		__valorGrupo: grupo.valorDiscriminador,
	};
}

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
	// Valor cru do discriminador de grupo (lido direto do frontmatter, mesmo que a propriedade não esteja
	// cadastrada). Null = tarefa sem grupo atribuído. Ver tarefaPertenceAoGrupo.
	valorGrupo: string | null;
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

// Atualiza toda referência a uma propriedade (por id) espalhada pela config do grupo, quando o id dela
// muda (ver ModalEditarPropriedade). Sem isso, agrupamento padrão, propriedades visíveis, destaque e
// condições de filtro salvas ficariam "presas" apontando pro id antigo, que deixou de existir.
export function migrarReferenciasPropriedade(grupo: GrupoTarefas, idAntigo: string, idNovo: string): void {
	if (idAntigo === idNovo) return;

	const trocarLista = (lista: string[] | null): string[] | null =>
		lista ? lista.map((v) => (v === idAntigo ? idNovo : v)) : lista;

	grupo.kanbanPropriedadesVisiveis = trocarLista(grupo.kanbanPropriedadesVisiveis);
	grupo.listaPropriedadesVisiveis = trocarLista(grupo.listaPropriedadesVisiveis);
	grupo.listaInboxPropriedadesVisiveis = trocarLista(grupo.listaInboxPropriedadesVisiveis);
	for (const modo of Object.keys(grupo.calendarioPropriedadesVisiveisPorModo) as ModoCalendario[]) {
		grupo.calendarioPropriedadesVisiveisPorModo[modo] = trocarLista(grupo.calendarioPropriedadesVisiveisPorModo[modo]);
	}

	if (grupo.agrupamentoPadraoKanban === idAntigo) grupo.agrupamentoPadraoKanban = idNovo;
	if (grupo.agrupamentoPadraoLista === idAntigo) grupo.agrupamentoPadraoLista = idNovo;

	for (const estilo of Object.keys(grupo.destaques) as EstiloDestaque[]) {
		const destaque = grupo.destaques[estilo];
		if (destaque?.propriedadeId === idAntigo) destaque.propriedadeId = idNovo;
	}

	// Caminha a árvore recursivamente — uma condição pode estar aninhada dentro de qualquer nível de
	// subgrupo (ver GrupoFiltro), não só no topo.
	const migrarItem = (item: ItemFiltro) => {
		if (item.tipo === "grupo") {
			for (const filho of item.itens) migrarItem(filho);
			return;
		}
		if (item.propriedadeId === idAntigo) item.propriedadeId = idNovo;
	};
	for (const filtro of grupo.filtrosSalvos) migrarItem(filtro.raiz);
	for (const view of grupo.visualizacoesSalvas) migrarItem(view.raiz);
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
export function estaNoInbox(tarefa: Tarefa, status: ConfigStatus): boolean {
	return tarefa.status === primeiraOpcaoStatus(status);
}

// A tarefa pertence a este grupo? Com discriminador global desativado (null), todo mundo pertence ao grupo
// (modo single-group). Com discriminador ativo: casa por valor; uma tarefa cujo valor não bate NENHUM grupo
// (incluindo valor ausente) cai no PRIMEIRO grupo (grupoDefault) — nunca some, mesma lição do bug "Inbox sumindo".
export function tarefaPertenceAoGrupo(
	tarefa: Tarefa,
	grupo: GrupoTarefas,
	configuracoes: ConfiguracoesGestorTarefas
): boolean {
	const grupoDefault = configuracoes.grupos[0];
	if (configuracoes.propriedadeGrupo === null) return grupo.id === grupoDefault.id;

	if (tarefa.valorGrupo !== null && grupo.valorDiscriminador === tarefa.valorGrupo) return true;

	// Valor ausente ou que não corresponde a nenhum grupo cadastrado -> pertence ao grupo default.
	const casaAlgumGrupo =
		tarefa.valorGrupo !== null && configuracoes.grupos.some((g) => g.valorDiscriminador === tarefa.valorGrupo);
	return !casaAlgumGrupo && grupo.id === grupoDefault.id;
}

function dentroDeUmaPasta(caminhoArquivo: string, pasta: string): boolean {
	return caminhoArquivo === pasta || caminhoArquivo.startsWith(pasta + "/");
}

// Um arquivo conta como tarefa se estiver na pasta de Tarefas, OU na pasta de Concluídas (quando
// "mover concluídas" está ativo) — tarefas concluídas continuam aparecendo na Lista/Kanban mesmo
// movidas de pasta; só um filtro ativo deve escondê-las, não a localização física do arquivo.
export function arquivoEhTarefaRelevante(configuracoes: ConfigEfetivaGrupo, caminhoArquivo: string): boolean {
	const { pastaTarefas, moverConcluidas, pastaConcluidas } = configuracoes;
	if (dentroDeUmaPasta(caminhoArquivo, pastaTarefas)) return true;
	if (moverConcluidas && pastaConcluidas && dentroDeUmaPasta(caminhoArquivo, pastaConcluidas)) return true;
	return false;
}

function corDaPropriedade(tarefa: Tarefa, configuracoes: ConfigEfetivaGrupo, propriedadeId: string): string | null {
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
	configuracoes: ConfigEfetivaGrupo,
	estilo: EstiloDestaque
): string | null {
	const destaque = configuracoes.destaques[estilo];
	if (!destaque) return null;
	return corDaPropriedade(tarefa, configuracoes, destaque.propriedadeId);
}

export function obterVisualizacao(
	configuracoes: ConfigEfetivaGrupo,
	idOuNome: string
): VisualizacaoSalva | undefined {
	const porId = configuracoes.visualizacoesSalvas.find((v) => v.id === idOuNome);
	if (porId) return porId;
	const alvo = idOuNome.toLowerCase();
	return configuracoes.visualizacoesSalvas.find((v) => v.nome.toLowerCase() === alvo);
}

export function obterFiltroSalvo(configuracoes: ConfigEfetivaGrupo, id: string): FiltroSalvo | undefined {
	return configuracoes.filtrosSalvos.find((f) => f.id === id);
}

// Ids de todos os campos que podem aparecer na nota criada por "Nova tarefa": os 7 fixos + cada
// propriedade customizada cadastrada no grupo.
export function idsTemplateNotaDisponiveis(config: ConfigEfetivaGrupo): string[] {
	const fixos = config.recorrenciaAtiva
		? CAMPOS_TEMPLATE_NOTA_FIXOS
		: CAMPOS_TEMPLATE_NOTA_FIXOS.filter((c) => c.id !== "recorrencia" && c.id !== "repetir_ate");
	return [...fixos.map((c) => c.id), ...config.propriedades.map((p) => p.id)];
}

// Todos os campos que EXISTEM no grupo, incluindo os que a config esconde da tela (recorrência/repetir até
// quando `recorrenciaAtiva` é false). Diferente de idsTemplateNotaDisponiveis, que é a lista para MOSTRAR em
// Configurações. Quem decide o que gravar no frontmatter precisa desta lista completa: um campo escondido
// pela config continua tendo chave própria e precisa ser explicitamente marcado como "não pré-gravar".
export function idsTemplateNotaTodos(config: ConfigEfetivaGrupo): string[] {
	return [...CAMPOS_TEMPLATE_NOTA_FIXOS.map((c) => c.id), ...config.propriedades.map((p) => p.id)];
}

// "Repetir até" só faz sentido com uma Recorrência definida, mas o Meta Bind não tem como esconder um
// campo condicionado ao valor de outro sem instalar plugins extras e ligar execução de JS nas notas — a
// Fernanda preferiu não fazer isso. Meio-termo: esse campo nasce desligado por padrão (ela liga na mão
// quando for configurar uma recorrência); os demais continuam nascendo todos ligados.
const CAMPO_TEMPLATE_NOTA_OCULTO_POR_PADRAO = "repetir_ate";

// Ids visíveis quando templateNota.camposVisiveis ainda é null (padrão de fábrica, antes dela customizar).
export function idsTemplateNotaVisiveisPorPadrao(config: ConfigEfetivaGrupo): string[] {
	return idsTemplateNotaDisponiveis(config).filter((id) => id !== CAMPO_TEMPLATE_NOTA_OCULTO_POR_PADRAO);
}

export function campoVisivelNaNota(config: ConfigEfetivaGrupo, campoId: string): boolean {
	if (!config.recorrenciaAtiva && (campoId === "recorrencia" || campoId === "repetir_ate")) return false;
	const lista = config.templateNota.camposVisiveis;
	if (lista === null) return idsTemplateNotaVisiveisPorPadrao(config).includes(campoId);
	return lista.includes(campoId);
}

// "antecedencia" = já entrou no período de aviso, mas o prazo ainda não chegou (visual mais claro).
// "prazo" = hoje é o dia do prazo (visual cheio). null = fora do período de aviso.
export type FaseAviso = "antecedencia" | "prazo";

export function faseDeAviso(tarefa: Tarefa, hoje: Date): FaseAviso | null {
	if (!tarefa.data) return null;
	if (!tarefa.diasAntecedenciaAviso || tarefa.diasAntecedenciaAviso <= 0) return null;

	const [ano, mes, dia] = tarefa.data.split("-").map(Number);
	const dataTarefa = new Date(ano, mes - 1, dia);
	const dataAviso = new Date(dataTarefa);
	dataAviso.setDate(dataAviso.getDate() - tarefa.diasAntecedenciaAviso);

	const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
	if (hojeSemHora < dataAviso || hojeSemHora > dataTarefa) return null;
	return hojeSemHora.getTime() === dataTarefa.getTime() ? "prazo" : "antecedencia";
}

export function emPeriodoDeAviso(tarefa: Tarefa, hoje: Date): boolean {
	return faseDeAviso(tarefa, hoje) !== null;
}
