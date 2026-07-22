import { App } from "obsidian";
import { ConfigEfetivaGrupo, ID_STATUS, Tarefa, TipoAgrupamento } from "./tipos";
import { rotuloValorPropriedade } from "./render-tarefa";

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
	configuracoes: ConfigEfetivaGrupo,
	app: App
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

	const propriedadeDef = agrupamento === ID_STATUS ? null : configuracoes.propriedades.find((p) => p.id === agrupamento);
	const opcoesFixas = agrupamento === ID_STATUS ? configuracoes.status.opcoes : propriedadeDef?.tipo === "selecao" ? propriedadeDef.opcoes ?? [] : null;

	const semValor: Tarefa[] = [];

	// Propriedades sem opções fixas (texto, link para arquivo): não há uma lista pré-definida de
	// valores possíveis, então os grupos/colunas nascem dos valores que já aparecem nas tarefas —
	// um grupo por valor distinto encontrado, ordenado pelo rótulo exibido.
	if (!opcoesFixas) {
		const porValor = new Map<string, Tarefa[]>();
		for (const tarefa of tarefas) {
			const valor = tarefa.propriedades[agrupamento];
			const valorTexto = typeof valor === "string" && valor.trim() ? valor : null;
			if (!valorTexto) {
				semValor.push(tarefa);
				continue;
			}
			if (!porValor.has(valorTexto)) porValor.set(valorTexto, []);
			porValor.get(valorTexto)!.push(tarefa);
		}
		const rotular = (valor: string) =>
			propriedadeDef?.tipo === "link_arquivo" ? rotuloValorPropriedade(app, valor) : valor;
		const grupos: ClusterAgrupamento[] = [...porValor.keys()]
			.sort((a, b) => rotular(a).localeCompare(rotular(b)))
			.map((valor) => ({ chave: valor, rotulo: rotular(valor), tarefas: porValor.get(valor)! }));

		if (semValor.length > 0) {
			grupos.push({ chave: "__sem_valor__", rotulo: "outros", tarefas: semValor });
		}
		return grupos;
	}

	const grupos: ClusterAgrupamento[] = opcoesFixas.map((opcao) => ({
		chave: opcao.valor,
		rotulo: opcao.valor,
		cor: opcao.cor,
		tarefas: [],
	}));

	for (const tarefa of tarefas) {
		const valor = agrupamento === ID_STATUS ? tarefa.status : tarefa.propriedades[agrupamento];
		const valorTexto = typeof valor === "string" ? valor : null;
		const grupo = valorTexto ? grupos.find((g) => g.chave === valorTexto) : null;
		if (grupo) grupo.tarefas.push(tarefa);
		else semValor.push(tarefa);
	}

	if (semValor.length > 0) {
		grupos.push({ chave: "__sem_valor__", rotulo: "outros", tarefas: semValor });
	}

	return grupos;
}
