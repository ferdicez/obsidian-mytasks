import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { ConfigEfetivaGrupo, arquivoEhTarefaRelevante } from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { MotorLista } from "./motor-lista";
import { compilarBlocoLista } from "./filtro-lista";
import { observarMudancasDoVault } from "./observador-vault";

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
			// Embed é uma visualização dentro da nota: o "+" de nova tarefa fica só nas views de verdade.
			permitirCriarTarefa: false,
			alinharControlesADireita: true,
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
