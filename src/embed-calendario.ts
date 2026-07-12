import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TAbstractFile, TFile } from "obsidian";
import { ConfigEfetivaGrupo, arquivoEhTarefaRelevante } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { MotorCalendario } from "./motor-calendario";
import { compilarBlocoCalendario } from "./filtro-calendario";

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
		this.registerEvent(
			this.app.metadataCache.on("changed", (arquivo: TAbstractFile) => {
				if (this.arquivoRelevante(arquivo)) this.motor.renderizar();
			})
		);
	}

	onunload(): void {
		this.motor.destruir();
	}

	private arquivoRelevante(arquivo: TAbstractFile): boolean {
		if (!(arquivo instanceof TFile)) return false;
		return arquivoEhTarefaRelevante(this.obterConfiguracoes(), arquivo.path);
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
