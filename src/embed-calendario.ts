import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { ConfigEfetivaGrupo, arquivoEhTarefaRelevante } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { MotorCalendario } from "./motor-calendario";
import { compilarBlocoCalendario } from "./filtro-calendario";
import { observarMudancasDoVault } from "./observador-vault";

export const LINGUAGEM_BLOCO_CALENDARIO = "mytasks-calendario";

class EmbedCalendario extends MarkdownRenderChild {
	private motor: MotorCalendario;

	constructor(
		containerEl: HTMLElement,
		source: string,
		private ctx: MarkdownPostProcessorContext,
		private app: App,
		private repositorio: RepositorioTarefas,
		private obterConfiguracoes: () => ConfigEfetivaGrupo
	) {
		super(containerEl);
		const compilado = compilarBlocoCalendario(source, app, ctx.sourcePath, obterConfiguracoes());
		this.motor = new MotorCalendario(containerEl, {
			app,
			repositorio,
			configuracoes: obterConfiguracoes(),
			modoInicial: compilado.modo,
			filtro: compilado.filtro,
			permitirTrocaModo: false,
		});
	}

	onload(): void {
		this.motor.renderizar();
		observarMudancasDoVault({
			app: this.app,
			registerEvent: (ref) => this.registerEvent(ref),
			ehRelevante: (caminho) => arquivoEhTarefaRelevante(this.obterConfiguracoes(), caminho),
			redesenhar: () => this.motor.renderizar(),
		});
	}

	onunload(): void {
		this.motor.destruir();
	}
}

export function registrarProcessadorCalendario(
	registerMarkdownCodeBlockProcessor: (
		language: string,
		handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
	) => void,
	app: App,
	repositorio: RepositorioTarefas,
	obterConfiguracoes: () => ConfigEfetivaGrupo
): void {
	registerMarkdownCodeBlockProcessor(LINGUAGEM_BLOCO_CALENDARIO, (source, el, ctx) => {
		const child = new EmbedCalendario(el, source, ctx, app, repositorio, obterConfiguracoes);
		ctx.addChild(child);
	});
}
