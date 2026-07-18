import { App, parseYaml } from "obsidian";
import { ConfigEfetivaGrupo, ID_STATUS, Tarefa, TipoAgrupamento, grupoFiltroVazio, obterVisualizacao } from "./tipos";
import { compilarFiltro, grupoFiltroDeYaml } from "./motor-filtro";

interface ConfigBlocoKanban {
	view?: string;
	"agrupar-por"?: string;
	// Formato plano ({propriedade: valor}) ou grupos aninhados e:/ou:/nao: — ver grupoFiltroDeYaml.
	filtro?: unknown;
}

export interface BlocoKanbanCompilado {
	agrupamento: TipoAgrupamento;
	filtro: (tarefa: Tarefa) => boolean;
	filtrosExtrasIds: string[];
	filtroExtraPadraoId: string | null;
}

function agrupamentoValido(valor: string | undefined, configuracoes: ConfigEfetivaGrupo): TipoAgrupamento {
	if (!valor || valor === ID_STATUS) return ID_STATUS;
	const existe = configuracoes.propriedades.some((p) => p.id === valor && p.tipo === "selecao");
	return existe ? valor : ID_STATUS;
}

export function compilarBlocoKanban(
	source: string,
	app: App,
	sourcePath: string,
	configuracoes: ConfigEfetivaGrupo
): BlocoKanbanCompilado {
	let config: ConfigBlocoKanban = {};
	try {
		config = (parseYaml(source) as ConfigBlocoKanban) ?? {};
	} catch {
		config = {};
	}

	const viewSalva = config.view ? obterVisualizacao(configuracoes, config.view) : undefined;

	const agrupamento = agrupamentoValido(
		config["agrupar-por"] ?? viewSalva?.agrupamento,
		configuracoes
	);
	const raiz = config.filtro ? grupoFiltroDeYaml(config.filtro) : viewSalva?.raiz ?? grupoFiltroVazio();

	return {
		agrupamento,
		filtro: compilarFiltro(raiz, app, sourcePath, configuracoes),
		filtrosExtrasIds: config.filtro ? [] : viewSalva?.filtrosExtrasIds ?? [],
		filtroExtraPadraoId: config.filtro ? null : viewSalva?.filtroExtraPadraoId ?? null,
	};
}
