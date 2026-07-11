import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TAbstractFile, TFile } from "obsidian";
import { ConfiguracoesGestorTarefas } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { MotorLista } from "./motor-lista";
import { compilarBlocoLista } from "./filtro-lista";

export const LINGUAGEM_BLOCO_LISTA = "mytasks-lista";

class EmbedLista extends MarkdownRenderChild {
	private motor: MotorLista;

	constructor(
		containerEl: HTMLElement,
		source: string,
		private ctx: MarkdownPostProcessorContext,
		private app: App,
		private repositorio: RepositorioTarefas,
		private obterConfiguracoes: () => ConfiguracoesGestorTarefas
	) {
		super(containerEl);
		const compilado = compilarBlocoLista(source, app, ctx.sourcePath, obterConfiguracoes());
		this.motor = new MotorLista(containerEl, {
			app,
			repositorio,
			configuracoes: obterConfiguracoes(),
			agrupamentoInicial: compilado.agrupamento,
			filtro: compilado.filtro,
			permitirTrocaAgrupamento: false,
			permitirCriarTarefa: false,
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
		const pasta = this.obterConfiguracoes().pastaTarefas;
		return arquivo.path.startsWith(pasta + "/") || arquivo.parent?.path === pasta;
	}
}

export function registrarProcessadorLista(
	registerMarkdownCodeBlockProcessor: (
		language: string,
		handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
	) => void,
	app: App,
	repositorio: RepositorioTarefas,
	obterConfiguracoes: () => ConfiguracoesGestorTarefas
): void {
	registerMarkdownCodeBlockProcessor(LINGUAGEM_BLOCO_LISTA, (source, el, ctx) => {
		const child = new EmbedLista(el, source, ctx, app, repositorio, obterConfiguracoes);
		ctx.addChild(child);
	});
}
