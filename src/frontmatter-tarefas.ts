import { App, TFile } from "obsidian";
import { ChavesFixas, PropriedadeDefinida, PropriedadeValor, Recorrencia, REGEX_HORARIO } from "./tipos";

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
	chaveData: string,
	chaveStatus: string,
	chavesFixas: ChavesFixas,
	criando: boolean
): void {
	// Ordem de escrita pedida pela Fernanda (a ordem de inserção das chaves é o que decide a ordem
	// no frontmatter): 1) grupo (carimbado por fora, antes desta função) → 2) entrada (idem) →
	// 3) prazo → 4) propriedades customizadas. Os demais campos padrão do plugin (status, horário,
	// recorrência...) vêm depois, sem posição específica pedida por ela.
	//
	// Campo vazio na CRIAÇÃO vira `null` (a chave nasce presente, vazia — aparece no painel de
	// Properties e no widget do Meta Bind da nota nova, inclusive quando copiada de uma nota modelo).
	// Campo vazio na EDIÇÃO continua sendo apagado (limpar a data numa tarefa existente deve remover
	// a propriedade, não deixar `null` sobrando).
	if (dados.data) fm[chaveData] = dados.data;
	else if (criando) fm[chaveData] = null;
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

	fm[chaveStatus] = dados.status;

	if (dados.horario && REGEX_HORARIO.test(dados.horario)) fm[chavesFixas.horario] = dados.horario;
	else if (criando) fm[chavesFixas.horario] = null;
	else delete fm[chavesFixas.horario];

	fm[chavesFixas.recorrencia] = dados.recorrencia;
	fm[chavesFixas.manterHistorico] = dados.manterHistorico;
	// Chave legada do plugin (não tem relação com renomeação feita pela usuária) — limpa resquício de
	// versões antigas, só quando não é a própria chave configurada agora (evita apagar dado de verdade
	// no caso improvável dela ter escolhido esse mesmo nome).
	if (chavesFixas.manterHistorico !== "recorrencia_manter_historico") delete fm.recorrencia_manter_historico;

	if (dados.recorrenciaDataFim) fm[chavesFixas.recorrenciaDataFim] = dados.recorrenciaDataFim;
	else if (criando) fm[chavesFixas.recorrenciaDataFim] = null;
	else delete fm[chavesFixas.recorrenciaDataFim];

	if (dados.diasAntecedenciaAviso) fm[chavesFixas.antecedencia] = dados.diasAntecedenciaAviso;
	else if (criando) fm[chavesFixas.antecedencia] = null;
	else delete fm[chavesFixas.antecedencia];
	if (chavesFixas.antecedencia !== "dias_antecedencia_aviso") delete fm.dias_antecedencia_aviso;
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
