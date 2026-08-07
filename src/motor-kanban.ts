import { App } from "obsidian";
import {
	ConfigEfetivaGrupo,
	ConfiguracoesGestorTarefas,
	GrupoFiltro,
	ID_STATUS,
	Tarefa,
	TipoAgrupamento,
	clonarGrupoFiltro,
	grupoFiltroVazio,
	obterFiltroSalvo,
	ultimaOpcaoStatus,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ID_DATA_ENTRADA, desenharCartaoTarefa, FORMATO_DRAG_TAREFA } from "./render-tarefa";
import { CHAVE_SEM_VALOR, agruparTarefas } from "./motor-agrupamento";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";
import { SeletorAgrupamento } from "./seletor-agrupamento";
import { SeletorGrupo } from "./seletor-grupo";

export interface OpcoesMotorKanban {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfigEfetivaGrupo;
	agrupamentoInicial?: TipoAgrupamento;
	// Subagrupamento pré-selecionado ao abrir (seções dentro de cada coluna). Ausente = "nenhum".
	subagrupamentoInicial?: TipoAgrupamento;
	filtro?: (tarefa: Tarefa) => boolean;
	// Filtro salvo pré-selecionado ao abrir (ex: filtro padrão configurado em Configurações, ou o filtro
	// móvel padrão de uma Visualização salva — nesse caso deve ser um dos IDs presentes em filtrosExtrasIds).
	filtroInicialId?: string | null;
	permitirTrocaAgrupamento?: boolean;
	permitirEdicaoFiltro?: boolean;
	permitirCriarTarefa?: boolean;
	// Restringe o SeletorFiltroSalvo do cabeçalho a só estes IDs (usado no embed, "filtro móvel" da visualização).
	// Sem isso, o seletor mostra todos os Filtros salvos (comportamento da Lista/Kanban geral).
	filtrosExtrasIds?: string[];
	// Seletor de grupo (view única): config global para listar grupos + grupo ativo + callback de troca.
	// Só desenha o ícone quando há mais de um grupo. Ausente = embed/contexto sem troca de grupo.
	configuracoesGlobais?: ConfiguracoesGestorTarefas;
	grupoAtivoId?: string;
	aoTrocarGrupo?: (grupoId: string) => void;
}

// Modo "Semana": em vez das colunas de agrupamento, uma coluna por dia da semana com as tarefas
// FIXAS da rotina — só as de recorrência semanal, que é o que ela pediu ("aparecem apenas tarefas
// fixas (recorrencia semanal)"). Segunda a domingo: a semana de trabalho começa na segunda, ao
// contrário da grade do calendário, que começa no domingo por convenção de calendário.
const DIAS_SEMANA_KANBAN: { indice: number; rotulo: string }[] = [
	{ indice: 1, rotulo: "segunda" },
	{ indice: 2, rotulo: "terça" },
	{ indice: 3, rotulo: "quarta" },
	{ indice: 4, rotulo: "quinta" },
	{ indice: 5, rotulo: "sexta" },
	{ indice: 6, rotulo: "sábado" },
	{ indice: 0, rotulo: "domingo" },
];

// Dia da semana de uma data AAAA-MM-DD, lida como data local. `new Date("2026-08-04")` seria
// interpretada como UTC e cairia no dia anterior à noite no fuso do Brasil — mesmo cuidado que
// formatarData já toma no resto do plugin.
function diaDaSemanaDaData(dataStr: string): number {
	const [ano, mes, dia] = dataStr.split("-").map(Number);
	return new Date(ano, mes - 1, dia).getDay();
}

// Chave AAAA-MM-DD de uma data local (o mesmo formato gravado no frontmatter).
function chaveData(data: Date): string {
	const mes = String(data.getMonth() + 1).padStart(2, "0");
	const dia = String(data.getDate()).padStart(2, "0");
	return `${data.getFullYear()}-${mes}-${dia}`;
}

// Segunda-feira da semana que contém `data`. A semana de trabalho começa na segunda, igual às
// colunas de DIAS_SEMANA_KANBAN — domingo (getDay() === 0) pertence à semana que começou seis
// dias antes, não à que começa no dia seguinte.
function segundaDaSemana(data: Date): Date {
	const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
	const recuo = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - recuo);
	return d;
}

// Uma rotina fixa é uma CADEIA de ocorrências, não um arquivo: concluir gera um arquivo novo com a
// data seguinte (`ocorrenciaAnterior` aponta pro anterior) ou reescreve o mesmo arquivo. Para o
// quadro da semana, todas as ocorrências de uma cadeia são a MESMA linha da rotina — é isso que
// faz a tarefa continuar na coluna depois de concluída, em vez de sumir com a ocorrência.
//
// A cadeia é percorrida pelos elos que existem no vault. Uma ocorrência cujo anterior já foi
// apagado (histórico limpo, ou "manter histórico" desligado) simplesmente inicia a própria cadeia.
function agruparEmCadeias(tarefas: Tarefa[]): Tarefa[][] {
	const porCaminho = new Map<string, Tarefa>();
	for (const t of tarefas) porCaminho.set(t.caminho, t);

	// Raiz de cada cadeia, seguindo `nasceuDeOcorrenciaCaminho` para trás. O conjunto `visitados`
	// protege de um ciclo — dois arquivos apontando um pro outro travariam o laço.
	const raizDe = new Map<string, string>();
	for (const tarefa of tarefas) {
		const visitados = new Set<string>([tarefa.caminho]);
		let atual = tarefa;
		while (atual.nasceuDeOcorrenciaCaminho) {
			const anterior = porCaminho.get(atual.nasceuDeOcorrenciaCaminho);
			if (!anterior || visitados.has(anterior.caminho)) break;
			visitados.add(anterior.caminho);
			atual = anterior;
		}
		raizDe.set(tarefa.caminho, atual.caminho);
	}

	const cadeias = new Map<string, Tarefa[]>();
	for (const tarefa of tarefas) {
		const raiz = raizDe.get(tarefa.caminho) ?? tarefa.caminho;
		const cadeia = cadeias.get(raiz);
		if (cadeia) cadeia.push(tarefa);
		else cadeias.set(raiz, [tarefa]);
	}
	return [...cadeias.values()];
}

export class MotorKanban {
	private agrupamento: TipoAgrupamento;
	// Segundo nível: divide as tarefas DENTRO de cada coluna em seções. "nenhum" = lista corrida (padrão).
	private subagrupamento: TipoAgrupamento = "nenhum";
	private grupoFiltro: GrupoFiltro = grupoFiltroVazio();
	private filtroSalvoId: string | null = null;
	private areaGrade: HTMLElement | null = null;
	// "colunas" = Kanban de sempre (agrupamento em colunas). "semana" = rotina fixa da semana.
	private modo: "colunas" | "semana" = "colunas";
	// Cadeia de ocorrências de cada cartão desenhado no modo semana, indexada pelo caminho do cartão.
	// Preenchida em renderizarSemana e lida no arrasto — mover a rotina precisa das outras ocorrências.
	private cadeiaPorCaminho = new Map<string, Tarefa[]>();

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesMotorKanban) {
		this.agrupamento = opcoes.agrupamentoInicial ?? ID_STATUS;
		this.subagrupamento = opcoes.subagrupamentoInicial ?? "nenhum";

		const filtroInicial = opcoes.filtroInicialId ? obterFiltroSalvo(opcoes.configuracoes, opcoes.filtroInicialId) : undefined;
		if (filtroInicial) {
			this.filtroSalvoId = filtroInicial.id;
			this.grupoFiltro = clonarGrupoFiltro(filtroInicial.raiz);
		}
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
		const filtroInterativo = compilarFiltro(this.grupoFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
		return todas.filter((t) => (this.opcoes.filtro ? this.opcoes.filtro(t) : true)).filter(filtroInterativo);
	}

	private colunas() {
		return agruparTarefas(this.tarefasFiltradas(), this.agrupamento, this.opcoes.configuracoes, this.opcoes.app);
	}

	// Subagrupamento efetivo: "nenhum" quando desligado, ou quando ele coincide com o agrupamento das
	// colunas — subdividir a coluna "fazer" por status renderia uma única seção "fazer" dentro dela,
	// só ruído. Nesse caso a coluna desenha a lista corrida de sempre.
	private subagrupamentoEfetivo(): TipoAgrupamento {
		if (this.subagrupamento === "nenhum") return "nenhum";
		return this.subagrupamento === this.agrupamento ? "nenhum" : this.subagrupamento;
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

	// Modo "Semana": uma coluna por dia (seg→dom) com as tarefas de recorrência SEMANAL — a rotina
	// fixa dela. A unidade aqui é a ROTINA, não a ocorrência: cada cadeia de ocorrências rende UM
	// cartão, sempre visível na coluna do seu dia, concluída ou não. Concluir marca o cartão como
	// feito e ele CONTINUA ali até virar a semana, em vez de sumir junto com a ocorrência que
	// avançou de data. É a visão de "o que eu faço toda semana", pedido dela.
	//
	// Tarefa semanal sem data fica de fora: sem data não há dia da semana, e ela não teria coluna.
	private renderizarSemana(): void {
		if (!this.areaGrade) return;
		this.areaGrade.empty();

		// As cadeias são montadas sobre TODAS as tarefas do repositório, não sobre as filtradas — e é
		// essa a diferença entre a rotina continuar à vista ou sumir ao ser concluída. A ocorrência
		// concluída costuma cair fora do filtro (o filtro esconde concluídas, ou ela foi movida pra
		// pasta de Concluídas): montando a cadeia sobre a lista filtrada, ela nunca entra, não há elo
		// nenhum, e o cartão desaparece exatamente como antes da correção.
		//
		// O filtro continua valendo — só que aplicado a QUAIS ROTINAS aparecem (uma rotina entra se
		// qualquer ocorrência dela passa no filtro), não a quais ocorrências formam a cadeia.
		const todasSemanais = this.opcoes.repositorio
			.listarTarefas()
			.filter((t) => t.recorrencia === "semanal" && t.data);
		const visiveis = new Set(this.tarefasFiltradas().map((t) => t.caminho));

		const inicioSemana = chaveData(segundaDaSemana(new Date()));
		const porDia = new Map<number, Tarefa[]>();
		for (const dia of DIAS_SEMANA_KANBAN) porDia.set(dia.indice, []);

		// A cadeia de cada cartão fica guardada pro arrasto: mudar o dia da rotina precisa saber quais
		// outras ocorrências existem (a concluída não é a que se move — ver moverRotinaParaDia).
		this.cadeiaPorCaminho.clear();
		let rotinas = 0;
		for (const cadeia of agruparEmCadeias(todasSemanais)) {
			if (!cadeia.some((t) => visiveis.has(t.caminho))) continue;
			rotinas++;
			const tarefa = this.ocorrenciaDaSemana(cadeia, inicioSemana);
			if (!tarefa?.data) continue;
			this.cadeiaPorCaminho.set(tarefa.caminho, cadeia);
			porDia.get(diaDaSemanaDaData(tarefa.data))?.push(tarefa);
		}

		if (rotinas === 0) {
			this.areaGrade.createEl("p", {
				text: "Nenhuma tarefa com recorrência semanal e data. As tarefas fixas da sua rotina aparecem aqui.",
				cls: "mytasks-vazio",
			});
			return;
		}

		for (const dia of DIAS_SEMANA_KANBAN) {
			this.desenharColunaSemana(dia.rotulo, porDia.get(dia.indice) ?? [], dia.indice);
		}
	}

	// Move uma rotina para outro dia da semana, arrastando o cartão. O quadro é "a rotina fixa", então
	// o gesto muda o dia DA ROTINA daqui pra frente — não é um adiamento pontual desta semana.
	//
	// Qual arquivo recebe a data nova: a ocorrência ATIVA da cadeia, nunca uma já concluída. O cartão
	// visível pode ser a concluída desta semana (é justamente o que faz a rotina continuar à vista
	// depois de marcada), e reescrever a data dela falsificaria o registro do que já aconteceu — a
	// tarefa de terça passaria a dizer que foi feita na quinta. Nesse caso quem se move é a próxima
	// ocorrência, que é o que "a rotina agora é quinta" significa.
	private async moverRotinaParaDia(tarefa: Tarefa, diaDestino: number): Promise<void> {
		// O mapa é indexado pelo cartão EXIBIDO, mas o arrasto pode trazer outra ocorrência da mesma
		// cadeia — daí a varredura como segunda tentativa, antes de tratar a tarefa como cadeia de um.
		const cadeia =
			this.cadeiaPorCaminho.get(tarefa.caminho) ??
			[...this.cadeiaPorCaminho.values()].find((c) => c.some((t) => t.caminho === tarefa.caminho)) ??
			[tarefa];
		const concluido = ultimaOpcaoStatus(this.opcoes.configuracoes.status);
		const ativas = cadeia.filter((t) => t.data && t.status !== concluido);

		// Sem nenhuma ativa (rotina cuja última ocorrência foi concluída e ainda não gerou a seguinte —
		// acontece quando a recorrência chegou na data-fim), não há o que reagendar sem inventar uma
		// ocorrência nova. Melhor não fazer nada em silêncio do que reescrever a concluída.
		const alvo = ativas.length > 0 ? ativas.reduce((a, b) => (a.data! <= b.data! ? a : b)) : null;
		if (!alvo?.data) return;

		const novaData = this.dataNoMesmoDiaDaSemana(alvo.data, diaDestino);
		if (novaData === alvo.data) return;
		await this.opcoes.repositorio.atualizarData(alvo, novaData);
		this.renderizar();
	}

	// Desloca uma data para o `diaDestino` DENTRO da mesma semana (segunda→domingo) em que ela cai.
	// Mover terça→quinta anda +2 dias; quinta→terça anda −2 e a ocorrência fica no passado dessa
	// semana, que é o correto: a rotina passa a ser terça, e a próxima conclusão avança +7 a partir
	// daí. Trabalhar em dias corridos (não em "próxima quinta") mantém o intervalo semanal intacto.
	private dataNoMesmoDiaDaSemana(dataStr: string, diaDestino: number): string {
		const [ano, mes, dia] = dataStr.split("-").map(Number);
		const data = new Date(ano, mes - 1, dia);
		// Posição na semana com a segunda valendo 0, igual à ordem das colunas — no índice cru do
		// getDay() o domingo é 0 e ficaria antes da segunda, invertendo o sentido do arrasto.
		const posicaoAtual = (data.getDay() + 6) % 7;
		const posicaoDestino = (diaDestino + 6) % 7;
		data.setDate(data.getDate() + (posicaoDestino - posicaoAtual));
		return chaveData(data);
	}

	// Qual ocorrência de uma rotina representa a semana corrente. Concluir avança a data (o mesmo
	// arquivo, quando "manter histórico" está desligado) ou cria a ocorrência seguinte e arquiva a
	// concluída — nos dois casos, a que tem data DENTRO da semana é a que interessa, mesmo já feita.
	//
	// Sem nenhuma na semana (rotina adiantada, cuja próxima ocorrência já caiu na semana que vem),
	// vale a mais recente ANTES do fim da semana: é o registro do que aconteceu no dia dela. E se
	// toda a cadeia estiver no futuro (rotina que ainda vai começar), vale a mais próxima — o dia
	// fixo da semana é o mesmo de qualquer jeito, e assim a linha da rotina nunca some do quadro.
	private ocorrenciaDaSemana(cadeia: Tarefa[], inicioSemana: string): Tarefa | null {
		const comData = cadeia.filter((t): t is Tarefa & { data: string } => Boolean(t.data));
		if (comData.length === 0) return null;

		const fimSemana = chaveData(
			(() => {
				const [ano, mes, dia] = inicioSemana.split("-").map(Number);
				const d = new Date(ano, mes - 1, dia);
				d.setDate(d.getDate() + 6);
				return d;
			})()
		);

		const naSemana = comData.filter((t) => t.data >= inicioSemana && t.data <= fimSemana);
		// Mais de uma na mesma semana (rotina concluída e refeita no mesmo dia) — a última é a atual.
		if (naSemana.length > 0) return naSemana.reduce((a, b) => (b.data >= a.data ? b : a));

		const passadas = comData.filter((t) => t.data < inicioSemana);
		if (passadas.length > 0) return passadas.reduce((a, b) => (b.data >= a.data ? b : a));

		return comData.reduce((a, b) => (b.data < a.data ? b : a));
	}

	// A coluna do modo Semana usa a mesma casca visual das colunas do Kanban, e desde a rodada do
	// arrasto também é alvo de soltura: soltar aqui muda o dia FIXO da rotina (ver moverRotinaParaDia).
	private desenharColunaSemana(rotulo: string, tarefas: Tarefa[], diaIndice: number): void {
		if (!this.areaGrade) return;
		const colunaEl = this.areaGrade.createDiv({ cls: "mytasks-kanban-coluna" });

		const cabecalhoColuna = colunaEl.createDiv({ cls: "mytasks-kanban-cabecalho-coluna" });
		cabecalhoColuna.createEl("span", { text: rotulo, cls: "mytasks-kanban-titulo-coluna" });
		cabecalhoColuna.createEl("span", { text: String(tarefas.length), cls: "mytasks-kanban-contagem-coluna" });

		const listaColuna = colunaEl.createDiv({ cls: "mytasks-kanban-lista-coluna" });

		// A coluna inteira é o alvo, registrada ANTES do desenho dos cartões porque o caminho sem
		// subagrupamento sai por um return no meio. As seções de subagrupamento NÃO são alvos aqui
		// (ao contrário do Kanban de colunas): soltar numa seção gravaria também o valor do
		// subagrupamento, e no modo semana a coluna já significa outra coisa — o dia. Uma soltura,
		// uma mudança.
		this.registrarAlvoDeSolturaSemana(colunaEl, diaIndice);

		// O subagrupamento vale aqui também: dentro do dia, as tarefas podem ser divididas por status,
		// etiqueta etc. No modo semana ele NUNCA coincide com as colunas (que são dias, não uma
		// propriedade), então não passa por subagrupamentoEfetivo — nada a excluir.
		if (this.subagrupamento === "nenhum") {
			for (const tarefa of tarefas) this.desenharCartao(listaColuna, tarefa);
			return;
		}

		for (const secao of agruparTarefas(tarefas, this.subagrupamento, this.opcoes.configuracoes, this.opcoes.app)) {
			if (secao.tarefas.length === 0) continue;
			const secaoEl = listaColuna.createDiv({ cls: "mytasks-kanban-secao" });
			secaoEl.createDiv({ cls: "mytasks-kanban-cabecalho-secao", text: secao.rotulo });
			const listaSecao = secaoEl.createDiv({ cls: "mytasks-kanban-lista-secao" });
			for (const tarefa of secao.tarefas) this.desenharCartao(listaSecao, tarefa);
		}
	}

	// Soltura no modo semana: muda o DIA da rotina, não uma propriedade. É um método próprio em vez
	// de um parâmetro a mais em registrarAlvoDeSoltura porque as duas gravam coisas diferentes por
	// caminhos diferentes (data via atualizarData; agrupamento via gravarValorDeAgrupamento), e
	// misturar os dois num só deixaria o método cheio de "se estiver no modo semana".
	private registrarAlvoDeSolturaSemana(elemento: HTMLElement, diaIndice: number): void {
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
			evento.stopPropagation();
			// Procura na cadeia guardada, não em tarefasFiltradas: o cartão arrastado pode ser uma
			// ocorrência concluída que já mora na pasta de Concluídas, e o filtro interativo pode não
			// devolvê-la — mas ela ESTÁ desenhada na tela, então precisa poder ser arrastada.
			const tarefa =
				[...this.cadeiaPorCaminho.values()].flat().find((t) => t.caminho === caminho) ??
				this.tarefasFiltradas().find((t) => t.caminho === caminho);
			if (!tarefa) return;
			await this.moverRotinaParaDia(tarefa, diaIndice);
		});
	}

	private renderizarGrade(): void {
		if (!this.areaGrade) return;
		if (this.modo === "semana") {
			this.renderizarSemana();
			return;
		}
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
			const subagrupamento = this.subagrupamentoEfetivo();

			if (subagrupamento === "nenhum") {
				for (const tarefa of coluna.tarefas) this.desenharCartao(listaColuna, tarefa);
			} else {
				// Reusa o MESMO motor de agrupamento das colunas, agora sobre as tarefas de uma coluna só.
				// Seção vazia é omitida: o agrupamento por opções fixas devolve um cluster por opção
				// configurada, e desenhar "pessoal (0)" em toda coluna que não tem nenhuma seria ruído.
				for (const secao of agruparTarefas(coluna.tarefas, subagrupamento, this.opcoes.configuracoes, this.opcoes.app)) {
					if (secao.tarefas.length === 0) continue;
					const secaoEl = listaColuna.createDiv({ cls: "mytasks-kanban-secao" });
					secaoEl.createDiv({ cls: "mytasks-kanban-cabecalho-secao", text: secao.rotulo });
					const listaSecao = secaoEl.createDiv({ cls: "mytasks-kanban-lista-secao" });
					for (const tarefa of secao.tarefas) this.desenharCartao(listaSecao, tarefa);
					this.registrarAlvoDeSoltura(secaoEl, coluna.chave, secao.chave);
				}
			}

			this.registrarAlvoDeSoltura(colunaEl, coluna.chave);
		}
	}

	private desenharCartao(container: HTMLElement, tarefa: Tarefa): void {
		desenharCartaoTarefa(container, this.opcoes.app, this.opcoes.repositorio, this.opcoes.configuracoes, tarefa, {
			propriedadesMeta: this.propriedadesMeta(),
			ocultarNaMeta: this.ocultarNaMeta(),
			aoAtualizar: () => this.renderizar(),
		});
	}

	// Grava um valor de agrupamento na tarefa. Usado tanto pela coluna (agrupamento principal) quanto
	// pela seção (subagrupamento) — a diferença entre os dois é só QUAL agrupamento está sendo gravado.
	private async gravarValorDeAgrupamento(tarefa: Tarefa, agrupamento: TipoAgrupamento, valor: string): Promise<void> {
		if (agrupamento === ID_STATUS) {
			await this.opcoes.repositorio.atualizarStatus(tarefa, valor);
			return;
		}
		// A seção "outros" reúne quem não tem valor — soltar ali LIMPA a propriedade (null), em vez de
		// gravar a string "__sem_valor__" no frontmatter.
		await this.opcoes.repositorio.atualizarPropriedade(
			tarefa,
			agrupamento,
			valor === CHAVE_SEM_VALOR ? null : valor
		);
	}

	// Registra um alvo de soltura. Sem `valorSecao`, é a coluna inteira e grava só o agrupamento
	// principal (comportamento de sempre). Com `valorSecao`, é uma seção de subagrupamento e grava
	// TAMBÉM o valor do subagrupamento — soltar em "pessoal" dentro de "feito" muda as duas coisas.
	private registrarAlvoDeSoltura(elemento: HTMLElement, valorColuna: string, valorSecao?: string): void {
		elemento.addEventListener("dragover", (evento) => {
			if (!evento.dataTransfer?.types.includes(FORMATO_DRAG_TAREFA)) return;
			evento.preventDefault();
			// A seção fica DENTRO da coluna: sem parar a propagação, as duas acenderiam ao mesmo tempo
			// e a usuária não saberia onde vai soltar. O alvo mais interno vence.
			evento.stopPropagation();
			elemento.addClass("mytasks-kanban-alvo-soltura");
		});
		elemento.addEventListener("dragleave", () => elemento.removeClass("mytasks-kanban-alvo-soltura"));
		elemento.addEventListener("drop", async (evento) => {
			const caminho = evento.dataTransfer?.getData(FORMATO_DRAG_TAREFA);
			elemento.removeClass("mytasks-kanban-alvo-soltura");
			if (!caminho) return;
			evento.preventDefault();
			evento.stopPropagation();
			const tarefa = this.tarefasFiltradas().find((t) => t.caminho === caminho);
			if (!tarefa) return;

			// Subagrupamento PRIMEIRO: concluir uma tarefa recorrente pode reescrever/mover o arquivo
			// (ver atualizarStatus), e a `tarefa` em mãos apontaria pro caminho antigo. Gravando a
			// propriedade antes, ela vai pro arquivo certo; o status por último fecha a operação.
			const subagrupamento = this.subagrupamentoEfetivo();
			if (valorSecao !== undefined && subagrupamento !== "nenhum") {
				await this.gravarValorDeAgrupamento(tarefa, subagrupamento, valorSecao);
			}
			await this.gravarValorDeAgrupamento(tarefa, this.agrupamento, valorColuna);
			this.renderizar();
		});
	}

	private desenharCabecalho(): void {
		const cabecalho = this.containerEl.createDiv({ cls: "mytasks-cabecalho" });

		// Ícone discreto de troca de grupo, ANTES da palavra "Kanban" (só quando há mais de um grupo).
		if (this.opcoes.configuracoesGlobais && this.opcoes.grupoAtivoId && this.opcoes.aoTrocarGrupo) {
			const cfgGlobal = this.opcoes.configuracoesGlobais;
			if (cfgGlobal.grupos.length > 1) {
				new SeletorGrupo(cabecalho, {
					configuracoes: cfgGlobal,
					grupoAtivoId: this.opcoes.grupoAtivoId,
					icone: "square-kanban",
					aoEscolher: (grupoId) => this.opcoes.aoTrocarGrupo!(grupoId),
				});
			}
		}

		cabecalho.createEl("h3", { text: "kanban" });

		// Agrupamento como abas lado a lado (igual às visualizações do Calendário), não como menu:
		// trocar de agrupamento é a ação mais frequente do Kanban, então fica sempre à vista.
		//
		// A aba "semana" entra no MESMO bloco das de agrupamento porque as duas são a mesma escolha do
		// ponto de vista dela ("como o quadro está dividido"), e são mutuamente exclusivas: no modo
		// semana as colunas são os dias, não o agrupamento. O seletor de agrupamento move a marcação
		// sozinho, então a aba semana precisa apagá-la à mão ao ser clicada — e vice-versa.
		if (this.opcoes.permitirTrocaAgrupamento !== false) {
			const seletor = new SeletorAgrupamento(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				agrupamentoAtual: this.agrupamento,
				permitirNenhum: false,
				permitirDia: false,
				apresentacao: "abas",
				// No modo semana NENHUMA aba de agrupamento fica acesa: as colunas são os dias. O valor
				// de `agrupamento` continua guardado (é pra onde ela volta ao sair do modo), mas mostrá-lo
				// como ativo dizia que o quadro estava agrupado por status quando não estava.
				semSelecao: this.modo === "semana",
				aoEscolher: (agrupamento) => {
					this.agrupamento = agrupamento;
					// Escolher um agrupamento sai do modo semana: as colunas voltam a ser o agrupamento.
					const saiuDaSemana = this.modo === "semana";
					this.modo = "colunas";
					if (saiuDaSemana) {
						// O cabeçalho tem controles que só existem fora do modo semana (subagrupamento) —
						// redesenha inteiro pra eles voltarem, em vez de só a grade. O redesenho já
						// reconstrói as abas com a marcação certa, então não há o que apagar à mão aqui.
						this.renderizar();
						return;
					}
					this.renderizarGrade();
				},
			});

			// A marcação da aba é reconstruída a cada `renderizar()` (que roda ao entrar e ao sair do
			// modo), então não é preciso guardar o elemento pra apagá-la à mão.
			seletor.adicionarAba("semana", this.modo === "semana", () => {
				if (this.modo === "semana") return;
				this.modo = "semana";
				this.renderizar();
			});
		}

		// Subagrupamento: botão discreto ANTES do filtro. Menu (não abas) de propósito — as abas do
		// cabeçalho já são o agrupamento principal, e uma segunda fileira igual competiria por espaço
		// e confundiria os dois níveis. Vale TAMBÉM no modo semana, dividindo cada dia em seções.
		if (this.opcoes.permitirTrocaAgrupamento !== false) {
			new SeletorAgrupamento(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				agrupamentoAtual: this.subagrupamento,
				permitirNenhum: true,
				permitirDia: false,
				// Escolha dela. "rows-3" desenha faixas horizontais empilhadas — é a leitura certa pro
				// subagrupamento (seções dentro de uma coluna). As alternativas cobrem versões do
				// Obsidian em que esse nome ainda não existe: "rows" é o nome antigo do mesmo ícone,
				// e "layout-grid" é o último recurso pra nunca cair num botão vazio.
				icone: ["rows-3", "rows", "layout-grid"],
				rotulo: "subagrupamento",
				// No modo semana as colunas são os dias, não uma propriedade: não há agrupamento pra
				// excluir da lista, e esconder um item ali tiraria uma opção legítima.
				excluir: () => (this.modo === "semana" ? undefined : this.agrupamento),
				// Sem `elementoAlinhamento`: o menu desce colado no próprio botão, igual ao do filtro
				// ao lado. Alinhar pelo cabeçalho inteiro jogava o menu lá pra borda esquerda da view,
				// longe do botão clicado — os dois seletores vizinhos abriam em lugares diferentes.
				aoEscolher: (agrupamento) => {
					this.subagrupamento = agrupamento;
					this.renderizarGrade();
				},
			});
		}

		this.desenharFiltroSalvo(cabecalho);

		// O botão "nova tarefa" foi REMOVIDO do Kanban a pedido dela: criar tarefa agora é papel da
		// área de captura da barra lateral. `permitirCriarTarefa` continua na interface porque a Lista
		// e os embeds ainda a usam.
	}

	// A barrinha de Filtro salvo. Extraída num método porque o modo semana também a desenha — lá ela é
	// o único controle depois das abas.
	private desenharFiltroSalvo(cabecalho: HTMLElement): void {
		const filtroMovelVazio = this.opcoes.filtrosExtrasIds && this.opcoes.filtrosExtrasIds.length === 0;
		if (this.opcoes.permitirEdicaoFiltro === false || filtroMovelVazio) return;

		new SeletorFiltroSalvo(cabecalho, {
			configuracoes: this.opcoes.configuracoes,
			filtroAtualId: this.filtroSalvoId,
			restringirAIds: this.opcoes.filtrosExtrasIds,
			aoEscolher: (filtroId, raiz) => {
				this.filtroSalvoId = filtroId;
				this.grupoFiltro = raiz;
				this.renderizarGrade();
			},
		});
	}
}
