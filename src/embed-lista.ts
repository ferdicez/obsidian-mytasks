import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TAbstractFile, TFile } from "obsidian";
import { ConfigEfetivaGrupo, arquivoEhTarefaRelevante } from "./tipos";
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
		private obterConfiguracoes: () => ConfigEfetivaGrupo
	) {
		super(containerEl);
		const compilado = compilarBlocoLista(source, app, ctx.sourcePath, obterConfiguracoes());
		this.motor = new MotorLista(containerEl, {
			app,
			repositorio,
			configuracoes: obterConfiguracoes(),
			agrupamentoInicial: compilado.agrupamento,
			filtro: compilado.filtro,
			filtrosExtrasIds: compilado.filtrosExtrasIds,
			filtroInicialId: compilado.filtroExtraPadraoId,
			permitirTrocaAgrupamento: false,
			alinharControlesADireita: true,
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

export function registrarProcessadorLista(
	registerMarkdownCodeBlockProcessor: (
		language: string,
		handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
	) => void,
	app: App,
	repositorio: RepositorioTarefas,
	obterConfiguracoes: () => ConfigEfetivaGrupo
): void {
	registerMarkdownCodeBlockProcessor(LINGUAGEM_BLOCO_LISTA, (source, el, ctx) => {
		const child = new EmbedLista(el, source, ctx, app, repositorio, obterConfiguracoes);
		ctx.addChild(child);
	});
}
