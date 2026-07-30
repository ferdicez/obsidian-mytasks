import { App, EventRef, TAbstractFile, TFile } from "obsidian";

/**
 * Redesenho automático das views quando o vault muda.
 *
 * Antes desta função, cada view escutava só `metadataCache.on("changed")` — evento que dispara
 * quando o frontmatter de um arquivo QUE JÁ EXISTE é reindexado. Isso deixava de fora justamente
 * os casos em que a tela mais precisa reagir:
 *   - tarefa CRIADA fora da view (nota nova, Templater, captura em outro lugar) não aparecia;
 *   - tarefa APAGADA continuava desenhada;
 *   - tarefa MOVIDA pra dentro/fora da pasta de tarefas não entrava nem saía.
 * O sintoma pra usuária era ter que atualizar/reabrir a view na mão pra ver a tarefa nova.
 *
 * `create` também dispara pra todo arquivo do vault durante a carga inicial do Obsidian, e uma
 * sincronização (Obsidian Sync, Git) pode mexer em dezenas de arquivos de uma vez — daí o
 * agendamento em microtarefa mais adiante: N eventos no mesmo tick viram UM render.
 */
export interface OpcoesObservadorVault {
	app: App;
	/** `registerEvent` da própria view/child — garante que os listeners morrem junto com ela. */
	registerEvent: (ref: EventRef) => void;
	/** Se este caminho interessa à view (pasta de tarefas / concluídas do grupo). */
	ehRelevante: (caminho: string) => boolean;
	/** Redesenha a view. Chamado no máximo uma vez por tick, mesmo com vários eventos. */
	redesenhar: () => void;
}

export function observarMudancasDoVault(opcoes: OpcoesObservadorVault): void {
	const { app, registerEvent, ehRelevante, redesenhar } = opcoes;

	// Agrupa vários eventos do mesmo tick num render só. Sem isso, sincronizar 40 tarefas
	// dispararia 40 renders completos em sequência e a view engasgaria.
	let agendado = false;
	const agendarRender = () => {
		if (agendado) return;
		agendado = true;
		queueMicrotask(() => {
			agendado = false;
			redesenhar();
		});
	};

	const seRelevante = (arquivo: TAbstractFile) => {
		// Só arquivo interessa: evento de pasta não muda a lista de tarefas por si só (os arquivos
		// de dentro dela geram os próprios eventos).
		if (!(arquivo instanceof TFile)) return;
		if (ehRelevante(arquivo.path)) agendarRender();
	};

	registerEvent(app.metadataCache.on("changed", seRelevante));
	registerEvent(app.vault.on("create", seRelevante));
	registerEvent(app.vault.on("delete", seRelevante));

	// Renomear/mover precisa olhar os DOIS caminhos: sair da pasta de tarefas é tão relevante
	// quanto entrar. Testar só o caminho novo deixaria a tarefa movida pra fora ainda na tela.
	registerEvent(
		app.vault.on("rename", (arquivo: TAbstractFile, caminhoAntigo: string) => {
			if (!(arquivo instanceof TFile)) return;
			if (ehRelevante(arquivo.path) || ehRelevante(caminhoAntigo)) agendarRender();
		})
	);
}
