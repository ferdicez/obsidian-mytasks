import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { ConfigEfetivaGrupo, arquivoEhTarefaRelevante } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { MotorKanban } from "./motor-kanban";
import { compilarBlocoKanban } from "./filtro-kanban";
import { observarMudancasDoVault } from "./observador-vault";

export const LINGUAGEM_BLOCO_KANBAN = "mytasks-kanban";

class EmbedKanban extends MarkdownRenderChild {
	private motor: MotorKanban;

	constructor(
		containerEl: HTMLElement,
		source: string,
		private ctx: MarkdownPostProcessorContext,
		private app: App,
		private repositorio: RepositorioTarefas,
		private obterConfiguracoes: () => ConfigEfetivaGrupo
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
			// Embed é uma visualização dentro da nota: o "nova tarefa" fica só nas views de verdade.
			permitirCriarTarefa: false,
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

export function registrarProcessadorKanban(
	registerMarkdownCodeBlockProcessor: (
		language: string,
		handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void
	) => void,
	app: App,
	repositorio: RepositorioTarefas,
	obterConfiguracoes: () => ConfigEfetivaGrupo
): void {
	registerMarkdownCodeBlockProcessor(LINGUAGEM_BLOCO_KANBAN, (source, el, ctx) => {
		const child = new EmbedKanban(el, source, ctx, app, repositorio, obterConfiguracoes);
		ctx.addChild(child);
	});
}
