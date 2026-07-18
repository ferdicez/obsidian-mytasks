import { App, parseYaml } from "obsidian";
import { ConfigEfetivaGrupo, ModoCalendario, Tarefa } from "./tipos";
import { compilarFiltro, grupoFiltroDeYaml } from "./motor-filtro";

interface ConfigBlocoCalendario {
	modo?: string;
	// Formato plano ({propriedade: valor}) ou grupos aninhados e:/ou:/nao: — ver grupoFiltroDeYaml.
	filtro?: unknown;
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
	const raiz = grupoFiltroDeYaml(config.filtro);

	return {
		modo,
		filtro: compilarFiltro(raiz, app, sourcePath, configuracoes),
	};
}
