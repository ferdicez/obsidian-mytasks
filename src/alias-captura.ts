import { App, TFile } from "obsidian";
import { PropriedadeDefinida, PropriedadeValor } from "./tipos";

// Sufixo de captura rápida: " - fulano" no FIM do título. O separador precisa estar cercado de espaços
// (" - ") pra não confundir com hífen dentro de palavra ("pré-alinhamento"). Usa o ÚLTIMO separador da
// linha, então "reunião - alinhamento - pamela" procura por "pamela".
const REGEX_SUFIXO_ALIAS = /^(.*\S)\s+-\s+([^-]+?)\s*$/;

export interface SufixoCaptura {
	titulo: string;
	alias: string;
}

// Separa "gravar reels - pamela" em { titulo: "gravar reels", alias: "pamela" } — só para descobrir QUAL é
// o alias digitado. O título da tarefa NÃO é cortado (o nome do arquivo mantém o sufixo); quem chama usa
// apenas o campo `alias`. Devolve null quando não há sufixo no formato esperado.
export function separarSufixoAlias(entrada: string): SufixoCaptura | null {
	const casou = entrada.match(REGEX_SUFIXO_ALIAS);
	if (!casou) return null;
	const titulo = casou[1].trim();
	const alias = casou[2].trim();
	if (!titulo || !alias) return null;
	return { titulo, alias };
}

// Normaliza pra comparação: sem acentos, sem caixa, espaços colapsados. Assim "Pâmela", "pamela" e
// "PAMELA " casam entre si.
function normalizar(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

// Como uma nota de "Arquivos fixos" deve APARECER nos botões da captura, dado o caminho salvo na
// propriedade. Com `preferirAlias`, o primeiro `aliases` da nota ganha do nome do arquivo — é a opção
// "Mostrar o alias nos botões de captura". Sem alias (ou com a opção desligada) devolve o basename,
// e o caminho cru vira o rótulo se a nota tiver sido apagada/movida.
export function rotuloDeArquivoNaCaptura(app: App, caminho: string, preferirAlias: boolean): string {
	const nome = caminho.split("/").pop()?.replace(/\.md$/, "") ?? caminho;
	if (!preferirAlias) return nome;
	const arquivo = app.vault.getAbstractFileByPath(caminho);
	if (!(arquivo instanceof TFile)) return nome;
	return aliasesDaNota(app, arquivo)[0]?.trim() || nome;
}

function aliasesDaNota(app: App, arquivo: TFile): string[] {
	const bruto = app.metadataCache.getFileCache(arquivo)?.frontmatter?.aliases;
	if (Array.isArray(bruto)) return bruto.filter((v): v is string => typeof v === "string");
	if (typeof bruto === "string") return [bruto];
	return [];
}

export interface ResultadoAlias {
	arquivo: TFile;
	// Ids das propriedades `link_arquivo` que têm esta nota nos seus "Arquivos fixos" — são elas que recebem
	// o link pra própria nota encontrada (ex: a nota está cadastrada em "pasta" → a tarefa nasce com
	// `pasta: [[cliente - soie]]`). Normalmente uma só; mais de uma se a nota estiver em várias listas.
	propriedadesDeOrigem: string[];
	// Outras notas que também casaram com o mesmo alias (quem chama avisa a usuária). Vazio no caso normal.
	ambiguas: TFile[];
}

interface NotaCadastrada {
	arquivo: TFile;
	propriedades: string[];
}

// Universo de busca da captura por alias: SÓ as notas cadastradas em "Arquivos fixos" das propriedades do
// tipo `link_arquivo`. Não varre o vault inteiro — a usuária pré-cadastra quais notas participam, então uma
// nota qualquer com nome coincidente nunca é capturada por acidente (e a busca fica barata).
// Propriedade `link_arquivo` sem arquivos fixos (busca livre no vault) não entra: não define uma lista.
// Guarda de qual(is) propriedade(s) cada nota veio, pra depois preencher essa propriedade com o link.
function notasCadastradas(app: App, definicoes: PropriedadeDefinida[]): NotaCadastrada[] {
	const porCaminho = new Map<string, NotaCadastrada>();
	for (const def of definicoes) {
		if (def.tipo !== "link_arquivo" || !def.arquivosFixos) continue;
		for (const caminho of def.arquivosFixos) {
			const existente = porCaminho.get(caminho);
			if (existente) {
				existente.propriedades.push(def.id);
				continue;
			}
			const arquivo = app.vault.getAbstractFileByPath(caminho);
			// Caminho que aponta pra nota apagada/movida é ignorado em silêncio (mesma tolerância que
			// meta-bind-tarefa e modal-nova-tarefa já têm com arquivosFixos órfãos).
			if (arquivo instanceof TFile) porCaminho.set(caminho, { arquivo, propriedades: [def.id] });
		}
	}
	return [...porCaminho.values()];
}

// Procura, entre as notas cadastradas em "Arquivos fixos", uma cujo NOME ou cujos `aliases` casem com o
// texto digitado. Nome e alias são comparados normalizados (sem acento/caixa). Null quando nada casa.
export function resolverNotaPorAlias(app: App, alias: string, definicoes: PropriedadeDefinida[]): ResultadoAlias | null {
	const alvo = normalizar(alias);
	if (!alvo) return null;

	const porAlias: NotaCadastrada[] = [];
	const porNome: NotaCadastrada[] = [];
	for (const cadastrada of notasCadastradas(app, definicoes)) {
		if (aliasesDaNota(app, cadastrada.arquivo).some((a) => normalizar(a) === alvo)) {
			porAlias.push(cadastrada);
			continue;
		}
		if (normalizar(cadastrada.arquivo.basename) === alvo) porNome.push(cadastrada);
	}

	// Alias explícito ganha de coincidência de nome de arquivo: se a usuária cadastrou `aliases: [pamela]`
	// numa nota, é essa que ela quer, mesmo que exista outra nota chamada literalmente "pamela.md".
	const candidatas = porAlias.length > 0 ? porAlias : porNome;
	if (candidatas.length === 0) return null;
	return {
		arquivo: candidatas[0].arquivo,
		propriedadesDeOrigem: candidatas[0].propriedades,
		ambiguas: candidatas.slice(1).map((c) => c.arquivo),
	};
}

// Monta os valores de propriedade a herdar da nota do "fulano". A regra é a INTERSEÇÃO entre o que a nota
// tem no frontmatter e o que está cadastrado como propriedade no plugin — chave que existe só de um lado
// não entra. Nada de configuração extra: o cadastro de propriedades é a única fonte de verdade.
export function herdarPropriedadesDaNota(
	app: App,
	nota: TFile,
	definicoes: PropriedadeDefinida[]
): Record<string, PropriedadeValor> {
	const fm = app.metadataCache.getFileCache(nota)?.frontmatter;
	if (!fm) return {};

	const herdadas: Record<string, PropriedadeValor> = {};
	for (const def of definicoes) {
		const bruto = fm[def.id];
		if (bruto === null || bruto === undefined || bruto === "") continue;

		if (def.tipo === "lista") {
			const lista = Array.isArray(bruto)
				? bruto.filter((v): v is string => typeof v === "string")
				: typeof bruto === "string"
					? [bruto]
					: [];
			if (lista.length > 0) herdadas[def.id] = lista;
		} else if (def.tipo === "link_arquivo") {
			// escreverFrontmatter espera um CAMINHO nessa propriedade (é ele que chama generateMarkdownLink);
			// o frontmatter da nota de origem guarda um wikilink "[[nome]]". Converte um no outro — se o
			// destino não existir mais, a propriedade simplesmente não é herdada.
			if (typeof bruto !== "string") continue;
			const linkpath = bruto.replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim();
			const destino = app.metadataCache.getFirstLinkpathDest(linkpath, nota.path);
			if (destino) herdadas[def.id] = destino.path;
		} else if (typeof bruto === "string") {
			herdadas[def.id] = bruto;
		} else if (typeof bruto === "number" || typeof bruto === "boolean") {
			herdadas[def.id] = String(bruto);
		}
	}
	return herdadas;
}
