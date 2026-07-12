import { App, TFile } from "obsidian";
import { PropriedadeDefinida, PropriedadeValor, Recorrencia, REGEX_HORARIO } from "./tipos";

export function formatarLinkArquivo(app: App, arquivoOrigem: TFile, caminhoDestino: string): string | undefined {
	const destino = app.vault.getAbstractFileByPath(caminhoDestino);
	if (!(destino instanceof TFile)) return undefined;
	return app.fileManager.generateMarkdownLink(destino, arquivoOrigem.path);
}

export function extrairArquivoLinkado(app: App, arquivo: TFile, propriedadeId: string): TFile | null {
	const cache = app.metadataCache.getFileCache(arquivo);
	const ref = cache?.frontmatterLinks?.find((l) => l.key === propriedadeId);
	if (!ref) return null;
	const destino = app.metadataCache.getFirstLinkpathDest(ref.link, arquivo.path);
	return destino ?? null;
}

export interface DadosTarefaEscrita {
	status: string;
	data: string | null;
	horario: string | null;
	recorrencia: Recorrencia;
	manterHistorico: boolean;
	recorrenciaDataFim: string | null;
	diasAntecedenciaAviso: number | null;
	propriedades: Record<string, PropriedadeValor>;
}

export function escreverFrontmatter(
	app: App,
	arquivo: TFile,
	fm: Record<string, unknown>,
	dados: DadosTarefaEscrita,
	definicoes: PropriedadeDefinida[],
	chaveData = "data"
): void {
	// Ordem de escrita pedida pela Fernanda (a ordem de inserção das chaves é o que decide a ordem
	// no frontmatter): 1) grupo (carimbado por fora, antes desta função) → 2) entrada (idem) →
	// 3) prazo → 4) propriedades customizadas. Os demais campos padrão do plugin (status, horário,
	// recorrência...) vêm depois, sem posição específica pedida por ela.
	if (dados.data) fm[chaveData] = dados.data;
	else delete fm[chaveData];

	for (const def of definicoes) {
		const valor = dados.propriedades[def.id];
		const vazio = valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0);
		if (vazio) {
			delete fm[def.id];
			continue;
		}
		if (def.tipo === "link_arquivo" && typeof valor === "string") {
			const link = formatarLinkArquivo(app, arquivo, valor);
			if (link) fm[def.id] = link;
			else delete fm[def.id];
		} else if (def.tipo === "lista") {
			fm[def.id] = Array.isArray(valor) ? valor : [valor];
		} else {
			fm[def.id] = valor;
		}
	}

	fm.status = dados.status;

	if (dados.horario && REGEX_HORARIO.test(dados.horario)) fm.horario = dados.horario;
	else delete fm.horario;

	fm.recorrencia = dados.recorrencia;
	fm.manter_historico = dados.manterHistorico;
	delete fm.recorrencia_manter_historico;

	if (dados.recorrenciaDataFim) fm.recorrencia_data_fim = dados.recorrenciaDataFim;
	else delete fm.recorrencia_data_fim;

	if (dados.diasAntecedenciaAviso) fm.antecedencia = dados.diasAntecedenciaAviso;
	else delete fm.antecedencia;
	delete fm.dias_antecedencia_aviso;
}

export function lerFrontmatter(
	app: App,
	arquivo: TFile,
	fm: Record<string, unknown> | undefined,
	definicoes: PropriedadeDefinida[]
): Record<string, PropriedadeValor> {
	const resultado: Record<string, PropriedadeValor> = {};
	for (const def of definicoes) {
		if (def.tipo === "link_arquivo") {
			const destino = extrairArquivoLinkado(app, arquivo, def.id);
			resultado[def.id] = destino?.path ?? null;
		} else if (def.tipo === "lista") {
			const bruto = fm?.[def.id];
			resultado[def.id] = Array.isArray(bruto) ? bruto.filter((v) => typeof v === "string") : null;
		} else {
			const bruto = fm?.[def.id];
			resultado[def.id] = typeof bruto === "string" ? bruto : null;
		}
	}
	return resultado;
}
