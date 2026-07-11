import { App } from "obsidian";

const REGEX_BLOCO_VIEW = /```mytasks-(calendario|kanban|lista)\s[\s\S]*?```/g;
const REGEX_LINHA_VIEW = /^\s*view:\s*(.+?)\s*$/m;

export async function contarReferenciasView(app: App, idOuNome: string): Promise<number> {
	let total = 0;
	for (const arquivo of app.vault.getMarkdownFiles()) {
		const conteudo = await app.vault.cachedRead(arquivo);
		const blocos = conteudo.match(REGEX_BLOCO_VIEW);
		if (!blocos) continue;
		for (const bloco of blocos) {
			const linhaView = bloco.match(REGEX_LINHA_VIEW);
			if (!linhaView) continue;
			const valor = linhaView[1].replace(/^["']|["']$/g, "");
			if (valor === idOuNome) total++;
		}
	}
	return total;
}
