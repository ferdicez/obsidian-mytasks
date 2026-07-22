import { App, TFile, parseYaml, stringifyYaml } from "obsidian";
import {
	CombinacaoPeriodos,
	CombinadorGrupo,
	CondicaoFiltro,
	ConfigEfetivaGrupo,
	GrupoFiltro,
	ID_STATUS,
	ItemFiltro,
	OperadorFiltro,
	PeriodoFiltro,
	PropriedadeValor,
	Tarefa,
	grupoFiltroVazio,
	periodosDaCondicao,
} from "./tipos";
import { ID_DATA } from "./render-tarefa";

function formatarDataLocal(data: Date): string {
	const ano = data.getFullYear();
	const mes = String(data.getMonth() + 1).padStart(2, "0");
	const dia = String(data.getDate()).padStart(2, "0");
	return `${ano}-${mes}-${dia}`;
}

function somarDias(data: Date, dias: number): Date {
	const copia = new Date(data);
	copia.setDate(copia.getDate() + dias);
	return copia;
}

function inicioDaSemana(data: Date): Date {
	const copia = new Date(data);
	copia.setDate(copia.getDate() - copia.getDay());
	return copia;
}

// Resolve uma âncora relativa em uma data-limite única (para antes/depois) ou numa janela [início, fim] (para referente-a).
export function resolverPeriodo(periodo: PeriodoFiltro, hoje: Date): { limite?: string; inicio?: string; fim?: string } {
	const hojeIso = formatarDataLocal(hoje);

	if (periodo.operador !== "referente-a") {
		if (periodo.ancora === "dia-especifico") return { limite: periodo.dataEspecifica ?? hojeIso };
		if (periodo.ancora === "amanha") return { limite: formatarDataLocal(somarDias(hoje, 1)) };
		if (periodo.ancora === "ontem") return { limite: formatarDataLocal(somarDias(hoje, -1)) };
		return { limite: hojeIso };
	}

	switch (periodo.ancora) {
		case "hoje":
			return { inicio: hojeIso, fim: hojeIso };
		case "esta-semana": {
			const inicio = inicioDaSemana(hoje);
			return { inicio: formatarDataLocal(inicio), fim: formatarDataLocal(somarDias(inicio, 6)) };
		}
		case "este-mes": {
			const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
			const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
			return { inicio: formatarDataLocal(primeiroDia), fim: formatarDataLocal(ultimoDia) };
		}
		case "proximo-mes": {
			const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
			const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
			return { inicio: formatarDataLocal(primeiroDia), fim: formatarDataLocal(ultimoDia) };
		}
		case "ultimo-mes": {
			const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
			const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
			return { inicio: formatarDataLocal(primeiroDia), fim: formatarDataLocal(ultimoDia) };
		}
		case "proximos-dias": {
			const n = periodo.quantidadeDias ?? 7;
			return { inicio: hojeIso, fim: formatarDataLocal(somarDias(hoje, n)) };
		}
		case "ultimos-dias": {
			const n = periodo.quantidadeDias ?? 7;
			return { inicio: formatarDataLocal(somarDias(hoje, -n)), fim: hojeIso };
		}
		default:
			return { inicio: hojeIso, fim: hojeIso };
	}
}

// Valor cru de uma propriedade (ou pseudo-propriedade status/data) numa tarefa, pra qualquer operador
// além de arquivo-atual/período (que têm leitura própria, ver compilarCondicao).
function valorBrutoDaPropriedade(tarefa: Tarefa, propriedadeId: string): PropriedadeValor {
	if (propriedadeId === ID_STATUS) return tarefa.status;
	if (propriedadeId === ID_DATA) return tarefa.data;
	return tarefa.propriedades[propriedadeId] ?? null;
}

function estaVazio(valor: PropriedadeValor): boolean {
	if (valor === null || valor === undefined || valor === "") return true;
	if (Array.isArray(valor)) return valor.length === 0;
	return false;
}

// "igual" de sempre: string bate se estiver entre os valores selecionados; array (lista) bate se tiver
// QUALQUER um dos valores selecionados (comportamento inalterado, só ganhou nome mais claro pra lista: "contem").
function casaIgual(valor: PropriedadeValor, valores: string[]): boolean {
	if (Array.isArray(valor)) return valores.some((v) => valor.includes(v));
	if (valor === null || valor === undefined) return false;
	return valores.includes(valor);
}

function compilarCondicao(condicao: CondicaoFiltro, notaAtual: TFile | null): (tarefa: Tarefa) => boolean {
	if (condicao.operador === "arquivo-atual") {
		if (!notaAtual) return () => false;
		return (tarefa: Tarefa) => tarefa.propriedades[condicao.propriedadeId] === notaAtual.path;
	}

	if (condicao.operador === "periodo") {
		const periodos = periodosDaCondicao(condicao);
		if (periodos.length === 0) return () => false;
		const combinacao = condicao.combinacaoPeriodos ?? "ou";
		return (tarefa: Tarefa) => {
			const valor =
				condicao.propriedadeId === ID_DATA
					? tarefa.data
					: (tarefa.propriedades[condicao.propriedadeId] as string | null);

			const casaPeriodo = (periodo: PeriodoFiltro) => {
				// "sem prazo" é o único período que casa JUSTAMENTE quando não há valor — tratado antes de
				// tudo, tanto pra dizer "sim, sem prazo" quanto pra que os demais períodos digam "não" aqui.
				if (periodo.ancora === "sem-prazo") return !valor;
				if (!valor) return false;
				const { limite, inicio, fim } = resolverPeriodo(periodo, new Date());
				if (periodo.operador === "antes") return limite !== undefined && valor < limite;
				if (periodo.operador === "depois") return limite !== undefined && valor > limite;
				return inicio !== undefined && fim !== undefined && valor >= inicio && valor <= fim;
			};

			return combinacao === "e" ? periodos.every(casaPeriodo) : periodos.some(casaPeriodo);
		};
	}

	if (condicao.operador === "vazio") {
		return (tarefa: Tarefa) => estaVazio(valorBrutoDaPropriedade(tarefa, condicao.propriedadeId));
	}
	if (condicao.operador === "nao-vazio") {
		return (tarefa: Tarefa) => !estaVazio(valorBrutoDaPropriedade(tarefa, condicao.propriedadeId));
	}

	if (condicao.operador === "contem" || condicao.operador === "nao-contem") {
		const negar = condicao.operador === "nao-contem";
		return (tarefa: Tarefa) => {
			const valor = valorBrutoDaPropriedade(tarefa, condicao.propriedadeId);
			let bate: boolean;
			if (Array.isArray(valor)) bate = casaIgual(valor, condicao.valores); // lista: mesma semântica de sempre
			else if (typeof valor === "string") {
				const alvo = valor.toLowerCase();
				bate = condicao.valores.some((v) => alvo.includes(v.toLowerCase())); // texto: substring
			} else bate = false;
			return negar ? !bate : bate;
		};
	}

	// "igual" / "diferente"
	const negar = condicao.operador === "diferente";
	return (tarefa: Tarefa) => {
		const bate = casaIgual(valorBrutoDaPropriedade(tarefa, condicao.propriedadeId), condicao.valores);
		return negar ? !bate : bate;
	};
}

// Grupo com 0 itens é sempre inerte (não filtra nada), em QUALQUER nível — não só na raiz. Sem essa regra,
// um subgrupo "ou" vazio (ela acabou de clicar "+ Adicionar grupo de filtros") combinado com "e" no pai
// faria o pai inteiro virar falso na hora, por causa de .some() num array vazio.
function compilarGrupo(grupo: GrupoFiltro, notaAtual: TFile | null): (tarefa: Tarefa) => boolean {
	if (grupo.itens.length === 0) return () => true;

	const testes = grupo.itens.map((item: ItemFiltro) =>
		item.tipo === "grupo" ? compilarGrupo(item, notaAtual) : compilarCondicao(item, notaAtual)
	);

	if (grupo.combinador === "e") return (tarefa: Tarefa) => testes.every((teste) => teste(tarefa));
	if (grupo.combinador === "ou") return (tarefa: Tarefa) => testes.some((teste) => teste(tarefa));
	return (tarefa: Tarefa) => !testes.some((teste) => teste(tarefa)); // "nenhum" = NÃO(OU(...))
}

export function compilarFiltro(
	raiz: GrupoFiltro,
	app: App,
	sourcePath: string | null,
	_configuracoes: ConfigEfetivaGrupo
): (tarefa: Tarefa) => boolean {
	const notaAtual = sourcePath ? app.vault.getAbstractFileByPath(sourcePath) : null;
	return compilarGrupo(raiz, notaAtual instanceof TFile ? notaAtual : null);
}

// ---------- Gramática YAML de filtro (bloco `filtro:` do embed, e o modo texto "</>" do construtor) ----------
//
// Formato plano legado (continua funcionando sem mudar nada): `propriedade: valor` direto, sem chave
// e:/ou:/nao: no topo — cada par vira uma condição, tudo combinado com E (comportamento de sempre).
//   filtro:
//     status: Fazer
//     workspace: arquivo-atual
//
// Grupos aninhados: uma chave e:/ou:/nao: cujo valor é uma LISTA — cada item da lista é ou uma condição
// ({propriedade: valor}, 1 chave) ou outro grupo (recursivo).
//   filtro:
//     e:
//       - status: Fazer
//       - ou:
//           - prioridade: Alta
//           - workspace: arquivo-atual
//       - nao:
//           - tags: Bloqueada
//       - titulo: { contem: "revisão" }   # forma explícita pra operadores sem atalho direto
//
// Valor de uma condição: escalar (igual), "arquivo-atual"/"vazio"/"nao-vazio" (strings mágicas, igual
// hoje), uma lista (igual com múltiplos valores), ou { operador: valor } explícito.
//
// Ambiguidade conhecida: se existir uma propriedade chamada literalmente "e"/"ou"/"nao", o desempate é
// pelo VALOR — só é tratado como grupo se o valor for uma lista; senão cai no caminho de condição normal.

function ehChaveGrupo(chave: string): chave is "e" | "ou" | "nao" {
	return chave === "e" || chave === "ou" || chave === "nao";
}

function combinadorDaChaveGrupo(chave: "e" | "ou" | "nao"): CombinadorGrupo {
	return chave === "nao" ? "nenhum" : chave;
}

function chaveGrupoDoCombinador(combinador: CombinadorGrupo): "e" | "ou" | "nao" {
	return combinador === "nenhum" ? "nao" : combinador;
}

function condicaoDeValor(propriedadeId: string, valorBruto: unknown): CondicaoFiltro {
	if (valorBruto === "arquivo-atual") return { tipo: "condicao", propriedadeId, operador: "arquivo-atual", valores: [] };
	if (valorBruto === "vazio") return { tipo: "condicao", propriedadeId, operador: "vazio", valores: [] };
	if (valorBruto === "nao-vazio") return { tipo: "condicao", propriedadeId, operador: "nao-vazio", valores: [] };
	if (Array.isArray(valorBruto)) return { tipo: "condicao", propriedadeId, operador: "igual", valores: valorBruto.map(String) };

	// Forma explícita { operador: valor } — cobre os operadores sem atalho direto (contem/diferente/etc).
	if (valorBruto && typeof valorBruto === "object") {
		const entradas = Object.entries(valorBruto as Record<string, unknown>);
		if (entradas.length === 1) {
			const [operadorBruto, valorInterno] = entradas[0];
			if (operadorBruto === "periodo" && valorInterno && typeof valorInterno === "object" && !Array.isArray(valorInterno)) {
				const v = valorInterno as { periodos?: PeriodoFiltro[]; combinacaoPeriodos?: CombinacaoPeriodos };
				return {
					tipo: "condicao",
					propriedadeId,
					operador: "periodo",
					valores: [],
					periodos: v.periodos ?? [],
					combinacaoPeriodos: v.combinacaoPeriodos ?? "ou",
				};
			}
			const valores = Array.isArray(valorInterno)
				? valorInterno.map(String)
				: valorInterno === undefined || valorInterno === null
					? []
					: [String(valorInterno)];
			return { tipo: "condicao", propriedadeId, operador: operadorBruto as OperadorFiltro, valores };
		}
	}

	return { tipo: "condicao", propriedadeId, operador: "igual", valores: [String(valorBruto)] };
}

// Um nó dentro de uma lista de grupo: condição-folha (1 chave, não é marcador de grupo) ou subgrupo
// (1 chave e/ou/nao cujo valor é lista). Nunca lança — nó com formato inesperado vira null e é descartado
// pelo chamador (um item malformado no meio da lista não derruba o resto do filtro).
function itemFiltroDeNo(no: unknown): ItemFiltro | null {
	if (!no || typeof no !== "object" || Array.isArray(no)) return null;
	const entradas = Object.entries(no as Record<string, unknown>);
	if (entradas.length !== 1) return null;
	const [chave, valor] = entradas[0];

	if (ehChaveGrupo(chave) && Array.isArray(valor)) {
		const itens = valor.map((v) => itemFiltroDeNo(v)).filter((v): v is ItemFiltro => v !== null);
		return { tipo: "grupo", combinador: combinadorDaChaveGrupo(chave), itens };
	}
	return condicaoDeValor(chave, valor);
}

// Parser do bloco `filtro:` do embed (e ponto de entrada da árvore inteira). Nunca lança — entrada
// ausente/malformada vira grupo vazio (não filtra nada), igual ao comportamento de sempre.
export function grupoFiltroDeYaml(bruto: unknown): GrupoFiltro {
	if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return grupoFiltroVazio();
	const entradas = Object.entries(bruto as Record<string, unknown>);
	if (entradas.length === 0) return grupoFiltroVazio();

	if (entradas.length === 1) {
		const [chave, valor] = entradas[0];
		if (ehChaveGrupo(chave) && Array.isArray(valor)) {
			const itens = valor.map((v) => itemFiltroDeNo(v)).filter((v): v is ItemFiltro => v !== null);
			return { tipo: "grupo", combinador: combinadorDaChaveGrupo(chave), itens };
		}
	}

	// Formato plano (legado, ou só não usa grupo): cada chave vira uma condição, tudo E — comportamento
	// idêntico ao parser antigo (condicoesDeFiltroYaml).
	const itens = entradas.map(([propriedadeId, valorBruto]) => condicaoDeValor(propriedadeId, valorBruto));
	return { tipo: "grupo", combinador: "e", itens };
}

// Usado pelo "</>" do construtor: parseia o texto de UM nó (condição ou grupo). Retorna null se o texto
// não parsear como YAML válido ou não bater no formato esperado — quem chama deve manter o valor antigo
// nesse caso, nunca aplicar algo quebrado.
export function itemFiltroDeYaml(texto: string): ItemFiltro | null {
	try {
		return itemFiltroDeNo(parseYaml(texto));
	} catch {
		return null;
	}
}

function valorDeCondicao(condicao: CondicaoFiltro): unknown {
	if (condicao.operador === "arquivo-atual") return "arquivo-atual";
	if (condicao.operador === "vazio") return "vazio";
	if (condicao.operador === "nao-vazio") return "nao-vazio";
	if (condicao.operador === "periodo") {
		return { periodo: { periodos: periodosDaCondicao(condicao), combinacaoPeriodos: condicao.combinacaoPeriodos ?? "ou" } };
	}
	if (condicao.operador === "igual") {
		return condicao.valores.length === 1 ? condicao.valores[0] : condicao.valores;
	}
	// diferente/contem/nao-contem: sem atalho direto, sempre forma explícita { operador: valor }.
	const valor = condicao.valores.length === 1 ? condicao.valores[0] : condicao.valores;
	return { [condicao.operador]: valor };
}

function noDeItemFiltro(item: ItemFiltro): Record<string, unknown> {
	if (item.tipo === "grupo") {
		return { [chaveGrupoDoCombinador(item.combinador)]: item.itens.map(noDeItemFiltro) };
	}
	return { [item.propriedadeId]: valorDeCondicao(item) };
}

// Serializa a árvore inteira pro bloco `filtro:` do embed. Quando o grupo raiz é só E de condições-folha
// (nenhum grupo aninhado — o caso comum, inclusive todo filtro migrado do formato antigo), devolve a
// forma plana de sempre em vez de embrulhar em `e:` — mantém os embeds já escritos com essa cara.
export function yamlDeGrupoFiltro(grupo: GrupoFiltro): string {
	if (grupo.combinador === "e" && grupo.itens.every((item) => item.tipo === "condicao")) {
		const achatado: Record<string, unknown> = {};
		for (const item of grupo.itens as CondicaoFiltro[]) {
			achatado[item.propriedadeId] = valorDeCondicao(item);
		}
		return stringifyYaml(achatado);
	}
	return stringifyYaml(noDeItemFiltro(grupo));
}

// Usado pelo "</>" do construtor: serializa só o nó clicado (condição ou grupo), sem tentar achatar —
// aqui o texto deve refletir fielmente aquele nó específico, não uma forma "bonita" alternativa.
export function yamlDeItemFiltro(item: ItemFiltro): string {
	return stringifyYaml(noDeItemFiltro(item));
}
