import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TAbstractFile, TFile } from "obsidian";
import { ConfiguracoesGestorTarefas, arquivoEhTarefaRelevante } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { MotorKanban } from "./motor-kanban";
import { compilarBlocoKanban } from "./filtro-kanban";

export const LINGUAGEM_BLOCO_KANBAN = "mytasks-kanban";

class EmbedKanban extends MarkdownRenderChild {
	private motor: MotorKanban;

	constructor(
		containerEl: HTMLElement,
		source: string,
		private ctx: MarkdownPostProcessorContext,
		private app: App,
		private repositorio: RepositorioTarefas,
		private obterConfiguracoes: () => ConfiguracoesGestorTarefas
	) {
		super(containerEl);
		const compilado = compilarBlocoKanban(source, app, ctx.sourcePath, obterConfiguracoes());
		this.motor = new MotorKanban(containerEl, {
			app,
			repositorio,
			configuracoes: obterConfiguracoes(),
			agrupamentoInicial: compilado.agrupamento,
			filtro: compilado.filtro,
			filtrosExtrasIds: compilado.filtrosExtrasIds,
			filtroInicialId: compilado.filtroExtraPadraoId,
			permitirTrocaAgrupamento: false,
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

export function registrarProcessadorKanban(
	registerMarkdownCodeBlockProcessor: (
		language: string,
		handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
	) => void,
	app: App,
	repositorio: RepositorioTarefas,
	obterConfiguracoes: () => ConfiguracoesGestorTarefas
): void {
	registerMarkdownCodeBlockProcessor(LINGUAGEM_BLOCO_KANBAN, (source, el, ctx) => {
		const child = new EmbedKanban(el, source, ctx, app, repositorio, obterConfiguracoes);
		ctx.addChild(child);
	});
}
