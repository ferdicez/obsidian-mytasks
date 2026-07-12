import { ConfigEfetivaGrupo, ID_STATUS, Tarefa, TipoAgrupamento } from "./tipos";

export interface ClusterAgrupamento {
	chave: string;
	rotulo: string;
	cor?: string;
	tarefas: Tarefa[];
}

const NOMES_DIA_SEMANA_COMPLETO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const NOMES_MES = [
	"janeiro", "fevereiro", "março", "abril", "maio", "junho",
	"julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function rotuloDia(dataStr: string): string {
	const [ano, mes, dia] = dataStr.split("-").map(Number);
	const data = new Date(ano, mes - 1, dia);
	return `${NOMES_DIA_SEMANA_COMPLETO[data.getDay()]}, ${data.getDate()} de ${NOMES_MES[data.getMonth()]}`;
}

export function agruparTarefas(
	tarefas: Tarefa[],
	agrupamento: TipoAgrupamento,
	configuracoes: ConfigEfetivaGrupo
): ClusterAgrupamento[] {
	if (agrupamento === "nenhum") {
		return [{ chave: "nenhum", rotulo: "", tarefas }];
	}

	if (agrupamento === "dia") {
		const porDia = new Map<string, Tarefa[]>();
		for (const tarefa of tarefas) {
			if (!tarefa.data) continue;
			if (!porDia.has(tarefa.data)) porDia.set(tarefa.data, []);
			porDia.get(tarefa.data)!.push(tarefa);
		}
		const dias = [...porDia.keys()].sort();
		return dias.map((dia) => ({ chave: dia, rotulo: rotuloDia(dia), tarefas: porDia.get(dia)! }));
	}

	const opcoes =
		agrupamento === ID_STATUS
			? configuracoes.status.opcoes
			: configuracoes.propriedades.find((p) => p.id === agrupamento)?.opcoes ?? [];

	const grupos: ClusterAgrupamento[] = opcoes.map((opcao) => ({
		chave: opcao.valor,
		rotulo: opcao.valor,
		cor: opcao.cor,
		tarefas: [],
	}));

	const semValor: Tarefa[] = [];
	for (const tarefa of tarefas) {
		const valor = agrupamento === ID_STATUS ? tarefa.status : tarefa.propriedades[agrupamento];
		const valorTexto = typeof valor === "string" ? valor : null;
		const grupo = valorTexto ? grupos.find((g) => g.chave === valorTexto) : null;
		if (grupo) grupo.tarefas.push(tarefa);
		else semValor.push(tarefa);
	}

	if (semValor.length > 0) {
		grupos.push({ chave: "__sem_valor__", rotulo: "Sem valor", tarefas: semValor });
	}

	return grupos;
}
