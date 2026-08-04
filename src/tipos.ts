export type Recorrencia = "nenhuma" | "diaria" | "a_cada_2_dias" | "a_cada_3_dias" | "semanal" | "mensal" | "anual";

export type TipoPropriedade = "texto" | "selecao" | "data" | "link_arquivo" | "lista";

// A chave "semana-horarios" é histórica: o modo virou "Dia" (um dia só, dividido em manhã/tarde/noite),
// mas o id técnico é preservado pra não invalidar data.json nem Visualizações salvas já existentes.
export type ModoCalendario = "lista" | "mes" | "semana-horarios" | "semana-kanban" | "ano";

// A ordem das chaves aqui é a ordem em que os modos aparecem no seletor do calendário
// e na tela de Configurações (lista → dia → semana → mês → ano). "Lista" vem ANTES de "Dia"
// por pedido dela — é a visão de entrada, com duas Visualizações salvas lado a lado.
export const ROTULOS_MODO: Record<ModoCalendario, string> = {
	lista: "Lista",
	"semana-horarios": "Dia",
	"semana-kanban": "Semana",
	mes: "Mês",
	ano: "Ano",
};

export interface OpcaoSelecao {
	valor: string;
	cor?: string;
}

// "linha" (fundo do cartão inteiro colorido) voltou: o aviso de prazo deixou de pintar o fundo no dia do
// vencimento — agora a corAviso só tinge levemente os dias de ANTECEDÊNCIA (o lembrete), então o fundo do
// cartão está livre de novo pra ser destaque de propriedade. O estilo "borda" mantém a chave por
// compatibilidade, mas é renderizado como uma BOLINHA colorida no fim do título.
export type EstiloDestaque = "checkbox" | "borda" | "linha";

export const ROTULOS_ESTILO_DESTAQUE: Record<EstiloDestaque, string> = {
	checkbox: "Checkbox colorido",
	borda: "Bolinha colorida (no fim do título)",
	linha: "Fundo colorido (cartão inteiro)",
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

// ID interno do campo "prazo" (o mesmo valor exportado como ID_DATA por render-tarefa.ts, reexportado
// de lá pra não quebrar os imports existentes). Mora aqui porque tipos.ts não pode importar de
// render-tarefa.ts — seria circular, já que render-tarefa importa daqui.
export const ID_DATA_ACAO = "data";

// Campos da tarefa que não são propriedade customizada nem status/prazo, mas que a captura pode
// oferecer: os três controles de comportamento da tarefa. Ficam com id próprio (e não com a chave do
// frontmatter) pela mesma razão de ID_STATUS/ID_DATA_ACAO — a chave é renomeável em Configurações →
// Avançado, e o campo da captura continua apontando pro lugar certo depois da renomeação.
export const ID_RECORRENCIA_ACAO = "recorrencia";
export const ID_ANTECEDENCIA_ACAO = "antecedencia";
export const ID_MANTER_HISTORICO_ACAO = "manter_historico";

// Os três acima, juntos: quem trata "campo da captura" precisa distinguir esses do resto (eles não
// entram em `propriedades`, têm caminho próprio na criação da tarefa).
export const IDS_CAMPOS_COMPORTAMENTO: string[] = [
	ID_RECORRENCIA_ACAO,
	ID_ANTECEDENCIA_ACAO,
	ID_MANTER_HISTORICO_ACAO,
];

// Opções de "avisar com antecedência" oferecidas na captura. Antecedência é um número livre de dias no
// modal de editar tarefa; na captura vira uma lista curta, porque o gesto ali é escolher rápido, não
// digitar. Quem precisa de 5 dias ajusta depois na tarefa.
export const OPCOES_ANTECEDENCIA_CAPTURA: { valor: string; rotulo: string }[] = [
	{ valor: "1", rotulo: "1 dia antes" },
	{ valor: "2", rotulo: "2 dias antes" },
	{ valor: "3", rotulo: "3 dias antes" },
	{ valor: "7", rotulo: "7 dias antes" },
];

// "manter registro ao concluir" é booleano; na captura ele é uma escolha entre dois rótulos.
export const OPCOES_MANTER_HISTORICO_CAPTURA: { valor: string; rotulo: string }[] = [
	{ valor: "sim", rotulo: "Manter no histórico" },
	{ valor: "nao", rotulo: "Não manter" },
];

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
	// Só para tipo "link_arquivo": nos botões/pastilhas da captura, mostrar o primeiro `aliases` da nota
	// em vez do nome do arquivo. Ausente/false = nome do arquivo (comportamento de sempre). Nota sem
	// alias cai no nome do arquivo de qualquer jeito. Muda só o RÓTULO — o valor gravado é o link.
	exibirAliasNaCaptura?: boolean;
}

// ---------------------------------------------------------------------------
// Botões de ação (menu do clique direito no cartão da tarefa)
// ---------------------------------------------------------------------------

// Uma AÇÃO é "grave este valor neste campo". Um botão executa uma lista delas em sequência, então um
// mesmo clique pode mover a tarefa de status E marcar o prazo pra hoje (o exemplo que a Fernanda deu).
//
// `campo` é o ID do alvo: ID_STATUS pro status, ID_DATA pro prazo, ou o `id` de uma propriedade
// customizada. Guardar o ID (e não a chave do frontmatter) é de propósito — a chave é renomeável em
// Configurações → Avançado, e o botão continua apontando pro campo certo depois da renomeação.
export interface AcaoBotao {
	campo: string;
	// Como o valor é calculado na hora do clique. Só o prazo (ID_DATA) usa os modos relativos; os
	// demais campos usam sempre "fixo", com o valor digitado/escolhido na configuração do botão.
	//   fixo         → grava `valor` como está
	//   hoje         → grava a data de hoje
	//   dias         → grava hoje + `dias` (1 = amanhã; aceita negativo pra trás)
	//   limpar       → apaga a chave (tarefa fica sem prazo / propriedade sem valor)
	modo: "fixo" | "hoje" | "dias" | "limpar";
	valor?: string;
	dias?: number;
}

export interface BotaoAcao {
	id: string;
	nome: string;
	visivel: boolean;
	icone?: string;
	acoes: AcaoBotao[];
}

// Ações embutidas do menu (não são configuráveis em O QUE fazem — só se aparecem e com que nome).
// Ficam depois de uma linha divisória, no fim do menu.
export type IdAcaoFixa = "abrir" | "renomear" | "excluir";

export interface ConfigAcaoFixa {
	visivel: boolean;
	nome: string;
}

export const ACOES_FIXAS_PADRAO: Record<IdAcaoFixa, ConfigAcaoFixa> = {
	abrir: { visivel: true, nome: "Abrir tarefa" },
	renomear: { visivel: true, nome: "Renomear" },
	excluir: { visivel: true, nome: "Excluir tarefa" },
};

// Ordem de exibição das fixas no menu (o Record acima não garante ordem por si só).
export const ORDEM_ACOES_FIXAS: IdAcaoFixa[] = ["abrir", "renomear", "excluir"];

// O que cada ação fixa FAZ — mostrado em Configurações ao lado do campo de nome, já que o nome é
// editável e sozinho deixaria de dizer qual ação é qual depois que ela renomeasse.
export const DESCRICOES_ACOES_FIXAS: Record<IdAcaoFixa, string> = {
	abrir: "Abre a nota da tarefa",
	renomear: "Muda o título (e o nome do arquivo) da tarefa",
	excluir: "Apaga a nota da tarefa (pede confirmação)",
};

export const ICONES_ACOES_FIXAS: Record<IdAcaoFixa, string> = {
	abrir: "file-text",
	renomear: "pencil",
	excluir: "trash",
};

// Botões que já nascem prontos, pra ela ter de onde partir em vez de uma lista vazia (escolha dela).
// São gerados a partir dos STATUS REAIS do grupo, não de valores fixos: o grupo dela usa
// "inbox/fazer/iniciado/concluído", outra instalação usa outros nomes, e um botão que grave um status
// inexistente sujaria o frontmatter com um valor que nenhuma coluna do Kanban reconhece.
//
// Só é chamada na criação de um grupo (e na migração de grupos antigos) — depois disso a lista é dela,
// e editar/apagar aqui não mexe no que já está salvo.
export function botoesAcaoPadrao(status: ConfigStatus): BotaoAcao[] {
	const primeiro = primeiraOpcaoStatus(status);
	const comData = opcaoStatusComData(status);
	const botoes: BotaoAcao[] = [];

	if (comData) {
		botoes.push({
			id: "botao_padrao_fazer_hoje",
			nome: "Fazer hoje",
			visivel: true,
			icone: "sun",
			acoes: [
				{ campo: ID_STATUS, modo: "fixo", valor: comData },
				{ campo: ID_DATA_ACAO, modo: "hoje" },
			],
		});
	}

	botoes.push(
		{
			id: "botao_padrao_amanha",
			nome: "Adiar para amanhã",
			visivel: true,
			icone: "arrow-right",
			acoes: [{ campo: ID_DATA_ACAO, modo: "dias", dias: 1 }],
		},
		{
			id: "botao_padrao_semana",
			nome: "Adiar 7 dias",
			visivel: true,
			icone: "calendar-clock",
			acoes: [{ campo: ID_DATA_ACAO, modo: "dias", dias: 7 }],
		},
		{
			id: "botao_padrao_sem_prazo",
			nome: "Tirar o prazo",
			visivel: true,
			icone: "calendar-x",
			acoes: [{ campo: ID_DATA_ACAO, modo: "limpar" }],
		}
	);

	if (primeiro) {
		botoes.push({
			id: "botao_padrao_inbox",
			nome: `Mandar para ${primeiro}`,
			visivel: true,
			icone: "inbox",
			acoes: [{ campo: ID_STATUS, modo: "fixo", valor: primeiro }],
		});
	}

	return botoes;
}

// ---------------------------------------------------------------------------
// Captura rápida da barra lateral
// ---------------------------------------------------------------------------

// Um PRESET de captura: digita o título, clica no preset, e a tarefa nasce já com o conjunto de
// propriedades dele. Reusa `AcaoBotao` de propósito — "grave este valor neste campo" é exatamente a
// mesma operação do menu do clique direito, com a diferença de que aqui ela roda na CRIAÇÃO da tarefa
// (ver aplicarAcoesNaCriacao em repositorio-tarefas.ts) em vez de numa tarefa que já existe.
export interface PresetCaptura {
	id: string;
	nome: string;
	visivel: boolean;
	icone?: string;
	acoes: AcaoBotao[];
}

// Como um campo da captura se apresenta na tela.
//   menu   → uma pastilha só ("status"); clicar abre a lista de opções (o padrão, econômico em espaço)
//   botoes → uma pastilha por opção, todas à vista ("fazer", "iniciado", "em andamento"…), um clique marca
export type ApresentacaoCampoCaptura = "menu" | "botoes";

// Configuração de UM campo na barra de captura. A ordem da lista `campos` é a ordem na tela — é assim
// que ela escolhe o que vem primeiro (o prazo, no layout que ela desenhou).
export interface CampoCaptura {
	// ID_STATUS, ID_DATA_ACAO ou id de propriedade customizada.
	id: string;
	apresentacao: ApresentacaoCampoCaptura;
}

// Configuração da área de captura da sidebar. Os campos viram controles fixos embaixo do input — o
// ajuste fino. Os presets são o caminho de um clique. Ela pediu os dois.
export interface ConfigCaptura {
	// Desliga a área inteira (volta ao input simples de antes).
	ativa: boolean;
	// Formato NOVO: ordem + apresentação por campo. `camposVisiveis` (só os ids) é o formato antigo,
	// mantido para migrar configs já salvas — ver migrarCamposDeGrupo.
	campos?: CampoCaptura[];
	camposVisiveis: string[];
	presets: PresetCaptura[];
	// Depois de capturar, os campos voltam ao valor vazio? Ligado = cada captura começa limpa;
	// desligado = os valores escolhidos ficam grudados pra capturar várias parecidas em sequência.
	limparAposCapturar: boolean;
	// Carimbo de "os campos padrão já foram semeados neste grupo". Distingue "nunca semeado" (a
	// primeira versão gravou a lista vazia em todo mundo → semeia) de "ela desmarcou todos de
	// propósito" (respeita). Sem ele, os campos ressuscitariam a cada carga do plugin.
	camposSemeados?: boolean;
	// Status com que toda tarefa capturada nasce, quando NADA foi escolhido na tela (nem campo, nem
	// preset, nem statusFixo do bloco do Inbox). Ausente/vazio = a regra posicional de sempre: com
	// prazo cai na primeira opção "com data", sem prazo cai no Inbox. Um valor que não existe mais na
	// lista de status é ignorado (volta à regra posicional) — ver statusInicialDaCaptura.
	statusPadrao?: string | null;
}

export const CONFIG_CAPTURA_PADRAO: ConfigCaptura = {
	ativa: true,
	camposVisiveis: [],
	presets: [],
	limparAposCapturar: true,
};

// Presets de exemplo, gerados a partir dos STATUS REAIS do grupo — mesma razão de botoesAcaoPadrao:
// um preset que gravasse "Fazer" num vault com outros nomes de status sujaria o frontmatter.
export function presetsCapturaPadrao(status: ConfigStatus): PresetCaptura[] {
	const comData = opcaoStatusComData(status);
	const presets: PresetCaptura[] = [];

	if (comData) {
		presets.push(
			{
				id: "preset_captura_hoje",
				nome: "Hoje",
				visivel: true,
				icone: "sun",
				acoes: [
					{ campo: ID_STATUS, modo: "fixo", valor: comData },
					{ campo: ID_DATA_ACAO, modo: "hoje" },
				],
			},
			{
				id: "preset_captura_semana",
				nome: "Em 7 dias",
				visivel: true,
				icone: "calendar-clock",
				acoes: [
					{ campo: ID_STATUS, modo: "fixo", valor: comData },
					{ campo: ID_DATA_ACAO, modo: "dias", dias: 7 },
				],
			}
		);
	}

	return presets;
}

// Campos que já nascem como pastilha na captura. Sem isso a barra de propriedades nasce VAZIA, e o
// recurso parece quebrado até ela achar a tela de Configurações — foi exatamente o que aconteceu.
//
// Status e prazo entram sempre (são os dois campos que toda tarefa tem). Das propriedades
// customizadas entram só as de SELEÇÃO, que têm opções cadastradas e viram um menu direto de
// escolher; texto e link de arquivo exigem digitar/buscar, o que não é o gesto rápido da captura —
// ela liga esses à mão se quiser.
export function camposCapturaPadrao(propriedades: PropriedadeDefinida[]): CampoCaptura[] {
	return [
		// O prazo vem PRIMEIRO por pedido dela ("a primeira linha é de prazo"), e como botões: hoje,
		// amanhã e escolher data ficam a um clique, que é o caso mais frequente da captura.
		{ id: ID_DATA_ACAO, apresentacao: "botoes" },
		{ id: ID_STATUS, apresentacao: "menu" },
		...propriedades
			.filter((p) => p.tipo === "selecao" || p.tipo === "link_arquivo")
			.map((p): CampoCaptura => ({ id: p.id, apresentacao: "menu" })),
	];
}

// Os campos da captura no formato novo, migrando na hora a config antiga (lista de ids). Fica aqui,
// e não só na migração de carga, porque uma config salva por uma versão anterior pode chegar às views
// antes de ser regravada — assim quem lê nunca precisa saber dos dois formatos.
export function camposDaCaptura(captura: ConfigCaptura): CampoCaptura[] {
	if (captura.campos) return captura.campos;
	return (captura.camposVisiveis ?? []).map((id): CampoCaptura => ({ id, apresentacao: "menu" }));
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

// Nomes EXIBIDOS dos três campos de comportamento — os rótulos que aparecem na captura e nas telas.
// Separados de ChavesFixas pelo mesmo motivo que status/prazo separam rotulo de chave: renomear o que
// se lê na tela não pode mexer no que está gravado no frontmatter das notas.
export interface RotulosFixos {
	recorrencia: string;
	antecedencia: string;
	manterHistorico: string;
}

export const ROTULOS_FIXOS_PADRAO: RotulosFixos = {
	recorrencia: "Recorrência",
	antecedencia: "Avisar antes",
	manterHistorico: "Histórico",
};

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
	// Faz a tarefa APARECER nos dias de antecedência (filtros de prazo e calendário), em vez de só mudar
	// de cor no dia do prazo. Ver inicioDaJanelaDeTarefa/tarefaOcupaDia. Desligado por padrão: ligar muda
	// o que já aparece nas views de quem usa "avisar com antecedência", então é escolha do grupo.
	anteciparPendencias: boolean;
	// Liga/desliga a funcionalidade de recorrência inteira pra este grupo — some do modal de editar
	// tarefa, dos campos oferecidos pra nota (Configurações → Nota de tarefa) e do ícone no card.
	recorrenciaAtiva: boolean;
	calendarioMostrarDetalhes: boolean;
	calendarioPropriedadesVisiveisPorModo: Record<ModoCalendario, string[] | null>;
	// Agendas externas (Google via .ics) que aparecem no calendário DESTE grupo, junto das tarefas
	// dele. Ficam no grupo — e não no topo global — porque cada grupo é um contexto de trabalho
	// próprio: a agenda de um cliente não deve poluir o calendário de outro.
	calendariosExternos: CalendarioExterno[];
	// Interruptor do grupo: esconde os compromissos sem apagar o cadastro das agendas.
	mostrarEventosExternos: boolean;
	kanbanPropriedadesVisiveis: string[] | null;
	listaPropriedadesVisiveis: string[] | null;
	listaInboxPropriedadesVisiveis: string[] | null;
	visualizacoesSalvas: VisualizacaoSalva[];
	filtrosSalvos: FiltroSalvo[];
	// Aplicados sempre que a respectiva view abre pela primeira vez (sidebar ou aba) — não afeta
	// Visualizações salvas nem o "filtro móvel" de embeds, que já têm seus próprios mecanismos.
	agrupamentoPadraoKanban: TipoAgrupamento;
	// Seções dentro de cada coluna do Kanban ao abrir. "nenhum" = coluna corrida, como sempre. Só o
	// Kanban tem subagrupamento (a Lista já agrupa em um nível só).
	subagrupamentoPadraoKanban: TipoAgrupamento;
	agrupamentoPadraoLista: TipoAgrupamento;
	filtroPadraoCalendarioId: string | null;
	filtroPadraoKanbanId: string | null;
	filtroPadraoListaId: string | null;
	// Quais campos/opções aparecem na nota criada por "Nova tarefa" (ver meta-bind-tarefa.ts).
	templateNota: TemplateNotaTarefa;
	// Chaves técnicas dos campos fixos (fora status/prazo, que têm seu próprio par rotulo/chave) — ver
	// ChavesFixas. Renomeável em Configurações → Avançado, com migração automática no vault.
	chavesFixas: ChavesFixas;
	// Nomes exibidos dos três campos de comportamento (recorrência, antecedência, histórico). Ausente
	// em configs salvas antes desta versão — quem lê usa `rotuloFixo()`, que cai no padrão.
	rotulosFixos?: RotulosFixos;
	// Menu do clique direito no cartão: os botões que a usuária monta (ver BotaoAcao) e as três ações
	// embutidas, que ela só liga/desliga e renomeia.
	botoesAcao: BotaoAcao[];
	acoesFixas: Record<IdAcaoFixa, ConfigAcaoFixa>;
	// Área de captura rápida da barra lateral (input + campos configuráveis + presets).
	captura: ConfigCaptura;
	// Visualização "Lista" do calendário: duas colunas, cada uma renderizando uma Visualização salva
	// (ids de `visualizacoesSalvas`). Null = coluna vazia, com um aviso pedindo pra configurar.
	calendarioListaColunaEsquerdaId: string | null;
	calendarioListaColunaDireitaId: string | null;
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

// ---------- Calendários externos (Google Agenda via .ics) ----------

// Uma agenda externa assinada por URL .ics ("endereço secreto em formato iCal" do Google Agenda).
// Só leitura: o plugin busca, lê e desenha os eventos no calendário — nunca escreve de volta.
export interface CalendarioExterno {
	id: string;
	nome: string;
	// URL do .ics. É um segredo (dá acesso de leitura à agenda a quem tiver) e vive só no data.json.
	url: string;
	cor: string;
	ativo: boolean;
}

// Um evento já normalizado a partir do .ics, pronto pro calendário desenhar. Ocorrências de eventos
// recorrentes viram entradas separadas (uma por data), então quem consome não precisa saber de RRULE.
export interface EventoExterno {
	// `${calendarioId}:${uid}:${data}` — único por ocorrência (o UID do .ics se repete entre ocorrências).
	id: string;
	calendarioId: string;
	calendarioNome: string;
	cor: string;
	titulo: string;
	descricao: string | null;
	local: string | null;
	// AAAA-MM-DD no fuso local, mesmo formato que Tarefa.data — é o que casa evento e tarefa no mesmo dia.
	data: string;
	// HH:MM no fuso local, ou null em evento de dia inteiro (que cai na coluna "sem horário" do modo Dia).
	horario: string | null;
	// HH:MM de término; null quando é dia inteiro ou quando o .ics não trouxe fim.
	horarioFim: string | null;
	diaInteiro: boolean;
}

// Cache do que foi baixado de cada calendário, persistido junto das configurações: o calendário
// continua mostrando os compromissos offline (possivelmente desatualizados) em vez de esvaziar.
export interface CacheCalendarioExterno {
	calendarioId: string;
	// Epoch ms da última busca BEM-SUCEDIDA.
	buscadoEm: number;
	// Conteúdo bruto do .ics — reprocessado a cada leitura, então correção no parser vale pro cache antigo.
	conteudo: string;
	// Mensagem do último erro de busca, ou null se a última tentativa deu certo. Mostrada em Configurações.
	erro: string | null;
}

export const INTERVALO_ATUALIZACAO_PADRAO_MIN = 30;

export interface ConfiguracoesGestorTarefas {
	// Propriedade global (chave de frontmatter) que discrimina a qual grupo cada tarefa pertence. Null = ainda
	// não configurada -> modo single-group (todo mundo cai no primeiro grupo).
	propriedadeGrupo: string | null;
	grupos: GrupoTarefas[];
	// Grupo lembrado por view única (Kanban/Calendário). Null cai no primeiro grupo.
	grupoAtivoKanbanId: string | null;
	grupoAtivoCalendarioId: string | null;
	// O CACHE do conteúdo baixado é global mesmo com as agendas sendo por grupo: é dado derivado
	// (o .ics puro, indexado por id de agenda), não configuração. Manter num lugar só evita baixar
	// duas vezes a mesma URL caso dois grupos assinem a mesma agenda.
	cacheCalendariosExternos: CacheCalendarioExterno[];
	intervaloAtualizacaoMin: number;
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
	anteciparPendencias: false,
	recorrenciaAtiva: true,
	calendarioMostrarDetalhes: true,
	calendarioPropriedadesVisiveisPorModo: {
		lista: [],
		mes: [],
		"semana-horarios": [],
		"semana-kanban": [],
		ano: [],
	},
	// Sem agenda cadastrada, todo o caminho de eventos externos fica inerte e o calendário do grupo
	// desenha exatamente o que desenhava antes.
	calendariosExternos: [],
	mostrarEventosExternos: true,
	kanbanPropriedadesVisiveis: [],
	listaPropriedadesVisiveis: [],
	listaInboxPropriedadesVisiveis: [],
	visualizacoesSalvas: [],
	filtrosSalvos: [],
	agrupamentoPadraoKanban: ID_STATUS,
	subagrupamentoPadraoKanban: "nenhum",
	agrupamentoPadraoLista: "nenhum",
	filtroPadraoCalendarioId: null,
	filtroPadraoKanbanId: null,
	filtroPadraoListaId: null,
	templateNota: { ...TEMPLATE_NOTA_PADRAO },
	chavesFixas: { ...CHAVES_FIXAS_PADRAO },
	rotulosFixos: { ...ROTULOS_FIXOS_PADRAO },
	// Vazio na constante: os botões de exemplo são gerados a partir dos status REAIS do grupo, o que
	// só dá pra fazer quando o grupo existe (ver botoesAcaoPadrao, chamada em migrarCamposDeGrupo e
	// na criação de grupo). Uma lista literal aqui gravaria "Fazer"/"Inbox" em vaults que usam outros
	// nomes de status.
	botoesAcao: [],
	acoesFixas: { ...ACOES_FIXAS_PADRAO },
	// Presets vazios pelo mesmo motivo de botoesAcao: são semeados a partir dos status reais do grupo
	// (ver presetsCapturaPadrao, chamada em migrarCamposDeGrupo e na criação de grupo).
	captura: { ...CONFIG_CAPTURA_PADRAO, camposVisiveis: [], presets: [] },
	calendarioListaColunaEsquerdaId: null,
	calendarioListaColunaDireitaId: null,
};

export const CONFIGURACOES_PADRAO: ConfiguracoesGestorTarefas = {
	propriedadeGrupo: null,
	grupos: [{ ...GRUPO_PADRAO }],
	grupoAtivoKanbanId: null,
	grupoAtivoCalendarioId: null,
	cacheCalendariosExternos: [],
	intervaloAtualizacaoMin: INTERVALO_ATUALIZACAO_PADRAO_MIN,
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
	if (grupo.subagrupamentoPadraoKanban === idAntigo) grupo.subagrupamentoPadraoKanban = idNovo;
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

	// Os botões do clique direito e os presets de captura guardam o ID da propriedade em `campo`
	// (ver AcaoBotao). Sem migrar aqui, renomear uma propriedade deixaria o botão gravando num campo
	// que não existe mais — falha silenciosa, igual à dos filtros acima.
	for (const botao of grupo.botoesAcao ?? []) {
		for (const acao of botao.acoes) if (acao.campo === idAntigo) acao.campo = idNovo;
	}
	for (const preset of grupo.captura?.presets ?? []) {
		for (const acao of preset.acoes) if (acao.campo === idAntigo) acao.campo = idNovo;
	}
	if (grupo.captura?.camposVisiveis) {
		grupo.captura.camposVisiveis = grupo.captura.camposVisiveis.map((v) => (v === idAntigo ? idNovo : v));
	}
	if (grupo.captura?.campos) {
		grupo.captura.campos = grupo.captura.campos.map((c) => (c.id === idAntigo ? { ...c, id: idNovo } : c));
	}
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

// Status com que uma tarefa capturada nasce quando NADA foi escolhido na tela. O "Status inicial das
// capturas" (Configurações → Captura) vence; sem ele — ou apontando pra uma opção que foi renomeada/
// apagada — cai na regra posicional de sempre, que é o comportamento anterior byte a byte.
// Nome exibido de um dos três campos de comportamento. Config salva antes desta versão não tem
// `rotulosFixos`, e um campo deixado em branco também cai no padrão — a captura nunca mostra pastilha
// sem nome.
export function rotuloFixo(config: ConfigEfetivaGrupo, campo: keyof RotulosFixos): string {
	return config.rotulosFixos?.[campo]?.trim() || ROTULOS_FIXOS_PADRAO[campo];
}

export function statusInicialDaCaptura(config: ConfigEfetivaGrupo, temData: boolean): string {
	const padrao = config.captura?.statusPadrao;
	if (padrao && config.status.opcoes.some((o) => o.valor === padrao)) return padrao;
	return (temData ? opcaoStatusComData(config.status) : primeiraOpcaoStatus(config.status)) ?? "";
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

// "antecedencia" = já entrou no período de aviso, mas o prazo ainda não chegou: é o LEMBRETE, e é a única
// fase que ganha cor (o tingido leve da corAviso). "prazo" = hoje é o dia do prazo: o cartão fica igual a
// qualquer outro, porque no dia do vencimento a tarefa é trabalho de hoje como os demais — quem avisa é o
// lembrete dos dias anteriores, não uma cor no dia. null = fora do período de aviso.
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

// ---------- Antecipação: a tarefa OCUPA os dias de aviso, não só o dia do prazo ----------
//
// A "avisar com antecedência" original só trocava a COR do cartão no dia do prazo — a tarefa continuava
// existindo em um único dia (o do prazo) para filtros e calendário. Resultado prático: abrir "pendências
// de hoje" no dia 7 não lembrava de nada que vence no dia 10, que é justamente o que a antecedência
// deveria fazer.
//
// Com `anteciparPendencias` ligado no grupo, a tarefa passa a ocupar a JANELA [prazo − antecedência, prazo]
// em vez de um ponto. Nada é gravado no frontmatter: a janela é derivada de `data` + `diasAntecedenciaAviso`
// a cada leitura, então mudar o prazo ou a antecedência a reajusta na hora, e os dias já vencidos saem
// sozinhos (a janela termina no prazo, e o dia de hoje só anda pra frente).

// Data (ISO) em que a tarefa começa a aparecer: o prazo, ou o início da antecedência quando ela existe.
// Sem antecedência — ou com o recurso desligado no grupo — devolve o próprio prazo, e todo o comportamento
// anterior é preservado byte a byte.
export function inicioDaJanelaDeTarefa(tarefa: Tarefa, anteciparAtivo: boolean): string | null {
	if (!tarefa.data) return null;
	if (!anteciparAtivo) return tarefa.data;
	if (!tarefa.diasAntecedenciaAviso || tarefa.diasAntecedenciaAviso <= 0) return tarefa.data;

	const [ano, mes, dia] = tarefa.data.split("-").map(Number);
	const inicio = new Date(ano, mes - 1, dia);
	inicio.setDate(inicio.getDate() - tarefa.diasAntecedenciaAviso);
	const a = inicio.getFullYear();
	const m = String(inicio.getMonth() + 1).padStart(2, "0");
	const d = String(inicio.getDate()).padStart(2, "0");
	return `${a}-${m}-${d}`;
}

// A tarefa ocupa o dia `diaIso`? Com o recurso desligado (ou sem antecedência) isto é exatamente a
// comparação `tarefa.data === diaIso` que o calendário sempre fez — por isso substitui as quatro cópias
// dela sem mudar o desenho de nenhum grupo que não ligou a opção.
export function tarefaOcupaDia(tarefa: Tarefa, diaIso: string, anteciparAtivo: boolean): boolean {
	if (!tarefa.data) return false;
	const inicio = inicioDaJanelaDeTarefa(tarefa, anteciparAtivo);
	if (inicio === null) return false;
	return diaIso >= inicio && diaIso <= tarefa.data;
}

// Quantos dias faltam para o prazo a partir de `hoje`. Negativo = prazo já passou. Usado só para rotular
// o lembrete ("em 3 dias"); a decisão de mostrar ou não é de tarefaOcupaDia.
export function diasAteOPrazo(tarefa: Tarefa, hoje: Date): number | null {
	if (!tarefa.data) return null;
	const [ano, mes, dia] = tarefa.data.split("-").map(Number);
	const prazo = new Date(ano, mes - 1, dia);
	const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
	return Math.round((prazo.getTime() - hojeSemHora.getTime()) / 86400000);
}
