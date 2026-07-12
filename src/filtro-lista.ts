import { App, parseYaml } from "obsidian";
import { ConfigEfetivaGrupo, ID_STATUS, Tarefa, TipoAgrupamento, obterVisualizacao } from "./tipos";
import { compilarFiltro, condicoesDeFiltroYaml } from "./motor-filtro";

interface ConfigBlocoLista {
	view?: string;
	"agrupar-por"?: string;
	filtro?: Record<string, string>;
}

export interface BlocoListaCompilado {
	agrupamento: TipoAgrupamento;
	filtro: (tarefa: Tarefa) => boolean;
	filtrosExtrasIds: string[];
	filtroExtraPadraoId: string | null;
}

function agrupamentoValido(valor: string | undefined, configuracoes: ConfigEfetivaGrupo): TipoAgrupamento {
	if (!valor || valor === "nenhum") return "nenhum";
	if (valor === "dia") return "dia";
	if (valor === ID_STATUS) return ID_STATUS;
	const existe = configuracoes.propriedades.some((p) => p.id === valor && p.tipo === "selecao");
	return existe ? valor : "nenhum";
}

export function compilarBlocoLista(
	source: string,
	app: App,
	sourcePath: string,
	configuracoes: ConfigEfetivaGrupo
): BlocoListaCompilado {
	let config: ConfigBlocoLista = {};
	try {
		config = (parseYaml(source) as ConfigBlocoLista) ?? {};
	} catch {
		config = {};
	}

	const viewSalva = config.view ? obterVisualizacao(configuracoes, config.view) : undefined;

	const agrupamento = agrupamentoValido(
		config["agrupar-por"] ?? viewSalva?.agrupamento,
		configuracoes
	);
	const condicoes = config.filtro
		? condicoesDeFiltroYaml(config.filtro)
		: viewSalva?.condicoes ?? [];

	return {
		agrupamento,
		filtro: compilarFiltro(condicoes, app, sourcePath, configuracoes),
		filtrosExtrasIds: config.filtro ? [] : viewSalva?.filtrosExtrasIds ?? [],
		filtroExtraPadraoId: config.filtro ? null : viewSalva?.filtroExtraPadraoId ?? null,
	};
}
