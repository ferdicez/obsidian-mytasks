import { App, parseYaml } from "obsidian";
import { ConfigEfetivaGrupo, ModoCalendario, Tarefa } from "./tipos";
import { compilarFiltro, condicoesDeFiltroYaml } from "./motor-filtro";

interface ConfigBlocoCalendario {
	modo?: string;
	filtro?: Record<string, string>;
}

export interface BlocoCalendarioCompilado {
	modo: ModoCalendario;
	filtro: (tarefa: Tarefa) => boolean;
}

const MODOS_VALIDOS: ModoCalendario[] = ["mes", "semana-horarios", "semana-kanban", "ano"];

export function compilarBlocoCalendario(
	source: string,
	app: App,
	sourcePath: string,
	configuracoes: ConfigEfetivaGrupo
): BlocoCalendarioCompilado {
	let config: ConfigBlocoCalendario = {};
	try {
		config = (parseYaml(source) as ConfigBlocoCalendario) ?? {};
	} catch {
		config = {};
	}

	const modo = MODOS_VALIDOS.includes(config.modo as ModoCalendario) ? (config.modo as ModoCalendario) : "mes";
	const condicoes = condicoesDeFiltroYaml(config.filtro);

	return {
		modo,
		filtro: compilarFiltro(condicoes, app, sourcePath, configuracoes),
	};
}
