import { App, TFile } from "obsidian";
import { CondicaoFiltro, ConfiguracoesGestorTarefas, ID_STATUS, PeriodoFiltro, Tarefa, periodosDaCondicao } from "./tipos";
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

export function compilarFiltro(
	condicoes: CondicaoFiltro[],
	app: App,
	sourcePath: string | null,
	_configuracoes: ConfiguracoesGestorTarefas
): (tarefa: Tarefa) => boolean {
	if (condicoes.length === 0) return () => true;

	const notaAtual = sourcePath ? app.vault.getAbstractFileByPath(sourcePath) : null;

	const testes = condicoes.map((condicao) => {
		if (condicao.operador === "arquivo-atual") {
			if (!(notaAtual instanceof TFile)) return () => false;
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
				if (!valor) return false;

				const casaPeriodo = (periodo: PeriodoFiltro) => {
					const { limite, inicio, fim } = resolverPeriodo(periodo, new Date());
					if (periodo.operador === "antes") return limite !== undefined && valor < limite;
					if (periodo.operador === "depois") return limite !== undefined && valor > limite;
					return inicio !== undefined && fim !== undefined && valor >= inicio && valor <= fim;
				};

				return combinacao === "e" ? periodos.every(casaPeriodo) : periodos.some(casaPeriodo);
			};
		}

		const valores = condicao.valores;
		if (condicao.propriedadeId === ID_STATUS) {
			return (tarefa: Tarefa) => valores.includes(tarefa.status);
		}
		if (condicao.propriedadeId === ID_DATA) {
			return (tarefa: Tarefa) => (tarefa.data ? valores.includes(tarefa.data) : false);
		}

		return (tarefa: Tarefa) => {
			const valor = tarefa.propriedades[condicao.propriedadeId];
			if (Array.isArray(valor)) return valores.some((v) => valor.includes(v));
			if (valor === null || valor === undefined) return false;
			return valores.includes(valor);
		};
	});

	return (tarefa: Tarefa) => testes.every((teste) => teste(tarefa));
}

export function condicoesDeFiltroYaml(filtroYaml: Record<string, string> | undefined): CondicaoFiltro[] {
	if (!filtroYaml) return [];
	return Object.entries(filtroYaml).map(([propriedadeId, valorBruto]) => {
		if (valorBruto === "arquivo-atual") {
			return { propriedadeId, operador: "arquivo-atual", valores: [] };
		}
		return { propriedadeId, operador: "igual", valores: [valorBruto] };
	});
}
