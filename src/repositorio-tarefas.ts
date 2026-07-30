import { App, Notice, TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import {
	ConfigEfetivaGrupo,
	PropriedadeValor,
	Recorrencia,
	REGEX_HORARIO,
	Tarefa,
	arquivoEhTarefaRelevante,
	campoPodeSerOpcional,
	campoVisivelNaNota,
	idsTemplateNotaTodos,
	opcaoStatusComData,
	primeiraOpcaoStatus,
	ultimaOpcaoStatus,
} from "./tipos";
import { DadosTarefaEscrita, escreverFrontmatter, formatarLinkArquivo, lerFrontmatter } from "./frontmatter-tarefas";
import { gerarCorpoMetaBind } from "./meta-bind-tarefa";
import { herdarPropriedadesDaNota, resolverNotaPorAlias, separarSufixoAlias } from "./alias-captura";

function formatarData(data: Date): string {
	const ano = data.getFullYear();
	const mes = String(data.getMonth() + 1).padStart(2, "0");
	const dia = String(data.getDate()).padStart(2, "0");
	return `${ano}-${mes}-${dia}`;
}

function proximaData(dataAtual: string, recorrencia: Recorrencia): string {
	const [ano, mes, dia] = dataAtual.split("-").map(Number);
	const data = new Date(ano, mes - 1, dia);

	if (recorrencia === "diaria") data.setDate(data.getDate() + 1);
	else if (recorrencia === "a_cada_2_dias") data.setDate(data.getDate() + 2);
	else if (recorrencia === "a_cada_3_dias") data.setDate(data.getDate() + 3);
	else if (recorrencia === "semanal") data.setDate(data.getDate() + 7);
	else if (recorrencia === "mensal") data.setMonth(data.getMonth() + 1);
	else if (recorrencia === "anual") data.setFullYear(data.getFullYear() + 1);

	return formatarData(data);
}

function sanitizarNomeArquivo(titulo: string): string {
	return titulo.replace(/[\\/:*?"<>|]/g, "-").trim();
}

// Tira o bloco de frontmatter do início do conteúdo de uma nota modelo (se ela tiver um) — só o corpo
// interessa pra copiar pra dentro da tarefa nova, o frontmatter da própria tarefa já é gravado à parte.
function removerFrontmatter(conteudo: string): string {
	const match = conteudo.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return match ? conteudo.slice(match[0].length) : conteudo;
}

// Lê o valor de UMA chave direto do texto do frontmatter, sem passar por parser de YAML. Existe
// porque notas modelo costumam ter placeholders de Templater (`<% ... %>`) que invalidam o YAML
// inteiro — nesses arquivos o metadataCache do Obsidian não indexa frontmatter algum, e ler pelo
// cache devolveria vazio para uma nota que visivelmente tem a chave preenchida.
//
// Deliberadamente simples: só chaves de primeiro nível no formato `chave: valor`. Devolve o valor
// como string minúscula e sem aspas, ou null se a chave não existir (ou estiver vazia).
export function lerChaveDoFrontmatterCru(conteudo: string, chave: string): string | null {
	const bloco = conteudo.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!bloco) return null;

	for (const linha of bloco[1].split(/\r?\n/)) {
		// Ignora aninhamento (linha indentada) e itens de lista: só interessa `chave: valor` na raiz.
		if (/^\s/.test(linha) || linha.startsWith("-")) continue;
		const separador = linha.indexOf(":");
		if (separador === -1) continue;
		if (linha.slice(0, separador).trim() !== chave) continue;

		const valor = linha
			.slice(separador + 1)
			.trim()
			.replace(/^["']|["']$/g, "")
			.trim();
		return valor.length > 0 ? valor.toLowerCase() : null;
	}
	return null;
}

// Renomeia uma chave de frontmatter num conjunto de arquivos já resolvido — reaproveitado tanto pelo
// rename de UM grupo (RepositorioTarefas.renomearChaveFrontmatter, escopado pela pasta do grupo) quanto
// pelo rename do discriminador de grupo (MyTasksPlugin.renomearChavePropriedadeGrupo, que precisa somar os
// arquivos de TODOS os grupos). Não sobrescreve um valor que já exista na chave nova (colisão silenciosa
// vira "mantém o valor novo, descarta o antigo" em vez de perder dado por engano). Devolve quantos
// arquivos tinham a chave antiga (não necessariamente quantos tiveram o valor efetivamente movido).
export async function renomearChaveEmArquivos(app: App, arquivos: TFile[], chaveAntiga: string, chaveNova: string): Promise<number> {
	if (chaveAntiga === chaveNova) return 0;

	let migrados = 0;
	for (const arquivo of arquivos) {
		const cache = app.metadataCache.getFileCache(arquivo);
		if (!cache?.frontmatter || !(chaveAntiga in cache.frontmatter)) continue;

		await app.fileManager.processFrontMatter(arquivo, (fm) => {
			if (!(chaveAntiga in fm)) return;
			const valorExistenteNaChaveNova = fm[chaveNova];
			const temValorNaChaveNova = valorExistenteNaChaveNova !== undefined && valorExistenteNaChaveNova !== null && valorExistenteNaChaveNova !== "";
			if (!temValorNaChaveNova) fm[chaveNova] = fm[chaveAntiga];
			delete fm[chaveAntiga];
		});
		migrados++;
	}
	return migrados;
}

export class RepositorioTarefas {
	constructor(private app: App, private obterConfiguracoes: () => ConfigEfetivaGrupo) {}

	private async garantirPasta(caminho: string): Promise<TFolder> {
		const normalizado = normalizePath(caminho);
		let pasta = this.app.vault.getAbstractFileByPath(normalizado);
		if (!pasta) {
			pasta = await this.app.vault.createFolder(normalizado);
		}
		return pasta as TFolder;
	}

	private async garantirPastaMesConcluidas(dataConclusao: Date): Promise<TFolder> {
		const { pastaConcluidas } = this.obterConfiguracoes();
		const ano = dataConclusao.getFullYear();
		const mes = String(dataConclusao.getMonth() + 1).padStart(2, "0");
		return this.garantirPasta(`${pastaConcluidas}/${ano}-${mes}`);
	}

	listarTarefas(): Tarefa[] {
		const configuracoes = this.obterConfiguracoes();
		const arquivos = this.app.vault.getMarkdownFiles().filter((f) => arquivoEhTarefaRelevante(configuracoes, f.path));

		const tarefas: Tarefa[] = [];
		for (const arquivo of arquivos) {
			const tarefa = this.paraTarefa(arquivo);
			if (tarefa) tarefas.push(tarefa);
		}
		return tarefas;
	}

	private paraTarefa(arquivo: TFile): Tarefa | null {
		const cache = this.app.metadataCache.getFileCache(arquivo);
		const fm = cache?.frontmatter;
		if (!fm) return null;
		return this.montarTarefa(arquivo, fm);
	}

	// Lê o frontmatter direto do conteúdo do arquivo em disco, sem depender do metadataCache — que é
	// assíncrono e pode estar obsoleto logo após uma escrita recente (ex: tarefa acabou de ser criada).
	private async lerTarefaDoDisco(arquivo: TFile): Promise<Tarefa | null> {
		const conteudo = await this.app.vault.read(arquivo);
		const match = conteudo.match(/^---\n([\s\S]*?)\n---/);
		if (!match) return null;
		let fm: Record<string, unknown>;
		try {
			fm = (parseYaml(match[1]) as Record<string, unknown>) ?? {};
		} catch {
			return null;
		}
		return this.montarTarefa(arquivo, fm);
	}

	private montarTarefa(arquivo: TFile, fm: Record<string, unknown>): Tarefa | null {
		const config = this.obterConfiguracoes();
		const { propriedades, dataTarefa, chavesFixas } = config;
		const chaveStatus = config.status.chave || "status";
		const valorStatus = fm[chaveStatus];
		if (!valorStatus) return null;

		const chaveData = dataTarefa.chave ?? "data";
		const valorData = fm[chaveData];

		const propriedadeGrupo = config.__propriedadeGrupo ?? null;
		const valorGrupoBruto = propriedadeGrupo ? fm[propriedadeGrupo] : null;

		const valorHorario = fm[chavesFixas.horario];
		const valorAntecedencia = fm[chavesFixas.antecedencia];

		return {
			caminho: arquivo.path,
			titulo: arquivo.basename,
			status: valorStatus as string,
			valorGrupo: typeof valorGrupoBruto === "string" ? valorGrupoBruto : null,
			statusAnterior: typeof fm[chavesFixas.statusAnterior] === "string" ? (fm[chavesFixas.statusAnterior] as string) : null,
			data: typeof valorData === "string" ? valorData : null,
			dataEntrada:
				typeof fm[chavesFixas.entrada] === "string"
					? (fm[chavesFixas.entrada] as string)
					: typeof fm.data_entrada === "string"
						? fm.data_entrada
						: formatarData(new Date(arquivo.stat.ctime)),
			horario: typeof valorHorario === "string" && REGEX_HORARIO.test(valorHorario) ? valorHorario : null,
			recorrencia: (fm[chavesFixas.recorrencia] ?? "nenhuma") as Recorrencia,
			manterHistorico: (fm[chavesFixas.manterHistorico] ?? fm.recorrencia_manter_historico ?? true) as boolean,
			recorrenciaDataFim: (fm[chavesFixas.recorrenciaDataFim] as string) ?? null,
			diasAntecedenciaAviso:
				typeof valorAntecedencia === "number"
					? valorAntecedencia
					: typeof fm.dias_antecedencia_aviso === "number"
						? fm.dias_antecedencia_aviso
						: null,
			propriedades: lerFrontmatter(this.app, arquivo, fm, propriedades),
			proximaOcorrenciaCaminho:
				typeof fm[chavesFixas.proximaOcorrencia] === "string" ? (fm[chavesFixas.proximaOcorrencia] as string) : null,
			nasceuDeOcorrenciaCaminho:
				typeof fm[chavesFixas.ocorrenciaAnterior] === "string"
					? (fm[chavesFixas.ocorrenciaAnterior] as string)
					: typeof fm.veio_de_ocorrencia === "string"
						? fm.veio_de_ocorrencia
						: null,
		};
	}

	// Espera o metadataCache confirmar que já indexou o frontmatter deste arquivo antes de devolver o
	// controle pro chamador — sem isso, quem cria uma tarefa e re-renderiza a tela logo em seguida (ex:
	// captura rápida do Inbox) pode ler um cache ainda desatualizado (frontmatter undefined) e a tarefa
	// nova fica invisível até algum evento posterior forçar um novo render. Some plugins concorrentes no
	// vault (Dataview, Templater etc.) podem atrasar/perder esse evento, então isso é aguardado com um
	// timeout de segurança em vez de depender só do listener de "changed" registrado pelas views.
	private async aguardarFrontmatterIndexado(arquivo: TFile): Promise<void> {
		if (this.app.metadataCache.getFileCache(arquivo)?.frontmatter) return;
		await new Promise<void>((resolve) => {
			let resolvido = false;
			const finalizar = () => {
				if (resolvido) return;
				resolvido = true;
				this.app.metadataCache.offref(referencia);
				clearTimeout(timeoutId);
				resolve();
			};
			const referencia = this.app.metadataCache.on("changed", (arquivoMudado) => {
				if (arquivoMudado.path === arquivo.path) finalizar();
			});
			const timeoutId = setTimeout(finalizar, 2000);
		});
	}

	async criarTarefa(titulo: string, dados: DadosTarefaEscrita): Promise<TFile> {
		const pasta = await this.garantirPasta(this.obterConfiguracoes().pastaTarefas);
		const nomeArquivo = sanitizarNomeArquivo(titulo);
		let caminho = normalizePath(`${pasta.path}/${nomeArquivo}.md`);

		let contador = 1;
		while (this.app.vault.getAbstractFileByPath(caminho)) {
			caminho = normalizePath(`${pasta.path}/${nomeArquivo} ${++contador}.md`);
		}

		const arquivo = await this.app.vault.create(caminho, "");
		const config = this.obterConfiguracoes();
		const { propriedades, dataTarefa, chavesFixas } = config;
		// Campos que NÃO nascem pré-gravados no frontmatter: (a) marcados "Opcional" — a chave só existe quando
		// ela adiciona pela nota; e (b) marcados "Oculto" — se ela escondeu o campo, não faz sentido ele nascer
		// no frontmatter (era o bug: "oculto" só sumia da geração de código, mas a chave ainda era pré-gravada).
		// Só vale pros campos opcionalizáveis — status/prazo (essenciais) nascem sempre, mesmo ocultos, pra não
		// sumir das views. Ver escreverFrontmatter.
		//
		// Percorre TODOS os campos opcionalizáveis, não só os "disponíveis": quando o grupo tem
		// `recorrenciaAtiva: false`, idsTemplateNotaDisponiveis tira "recorrencia"/"repetir_ate" da lista, e eles
		// nunca chegavam a ser marcados como não-pré-graváveis — a chave `recorrencia` nascia no frontmatter mesmo
		// com a recorrência desligada no grupo. campoVisivelNaNota já devolve false pros dois nesse caso.
		const camposOpcionais = new Set(config.templateNota.camposOpcionais ?? []);
		for (const id of idsTemplateNotaTodos(config)) {
			if (campoPodeSerOpcional(id) && !campoVisivelNaNota(config, id)) camposOpcionais.add(id);
		}
		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			// Ordem pedida pela Fernanda: 1) grupo, 2) entrada, 3) prazo, 4) propriedades customizadas
			// (as duas últimas são gravadas dentro de escreverFrontmatter). A ordem de inserção das
			// chaves no objeto `fm` é o que decide a ordem final no frontmatter da nota.
			if (config.__propriedadeGrupo) {
				fm[config.__propriedadeGrupo] = config.__valorGrupo ?? "";
			}
			fm[chavesFixas.entrada] = formatarData(new Date());
			escreverFrontmatter(this.app, arquivo, fm, dados, propriedades, dataTarefa.chave ?? "data", config.status.chave || "status", chavesFixas, true, camposOpcionais);
		});
		await this.aguardarFrontmatterIndexado(arquivo);
		return arquivo;
	}

	async criarTarefaRapida(titulo: string): Promise<TFile> {
		const config = this.obterConfiguracoes();

		// Sufixo " - fulano": procura, SÓ entre as notas cadastradas em "Arquivos fixos" das propriedades do
		// tipo link de arquivo, uma cujo nome/aliases casem — e herda dela as propriedades que TAMBÉM estão
		// cadastradas no plugin (interseção — ver alias-captura.ts). O TÍTULO NÃO É CORTADO: a tarefa se chama
		// "gravar reels - soie.md" mesmo, o sufixo é identificação visual e fica no nome do arquivo. Sem match,
		// nada é preenchido — uma tarefa com traço legítimo no nome nasce igual a antes.
		let propriedades: Record<string, PropriedadeValor> = {};
		const sufixo = separarSufixoAlias(titulo);
		if (sufixo) {
			const encontrada = resolverNotaPorAlias(this.app, sufixo.alias, config.propriedades);
			if (encontrada) {
				propriedades = herdarPropriedadesDaNota(this.app, encontrada.arquivo, config.propriedades);
				// A(s) propriedade(s) que cadastraram esta nota em "Arquivos fixos" recebem o link pra ela
				// própria (ex: cadastrada em "pasta" → `pasta: [[cliente - soie]]`). Vem DEPOIS da herança
				// pra vencer um valor herdado do frontmatter da nota na mesma chave.
				for (const id of encontrada.propriedadesDeOrigem) propriedades[id] = encontrada.arquivo.path;
				if (encontrada.ambiguas.length > 0) {
					new Notice(`"${sufixo.alias}" casa com ${encontrada.ambiguas.length + 1} notas — usando "${encontrada.arquivo.basename}".`);
				}
			} else {
				new Notice(`Nenhuma nota cadastrada com alias "${sufixo.alias}" — nada preenchido.`);
			}
		}

		const arquivo = await this.criarTarefa(titulo, {
			status: primeiraOpcaoStatus(config.status) ?? "",
			data: null,
			horario: null,
			recorrencia: "nenhuma",
			// Captura rápida nasce sempre no Inbox, então a modelo consultada é a do Inbox (se houver).
			manterHistorico: await this.manterHistoricoInicial(config, true),
			recorrenciaDataFim: null,
			diasAntecedenciaAviso: null,
			propriedades,
		});

		// A captura rápida nasce sempre no Inbox — aplica o mesmo corpo de nota modelo que "Nova tarefa" usa
		// (nota modelo do Inbox se houver, senão a geral, senão a geração automática). Ao contrário do botão
		// "Nova tarefa", mantém o título digitado e NÃO abre a nota (o fluxo de captura rápida segue fluido).
		const corpo = await this.obterCorpoNovaTarefa(config, true);
		if (corpo) await this.app.vault.append(arquivo, "\n" + corpo + "\n");

		return arquivo;
	}

	// Cria uma tarefa com nome genérico (sem pedir título) e o corpo já preenchido — quem chama abre a nota
	// em seguida (o clique em "Nova tarefa" deixou de abrir o modal de formulário). Status segue a mesma
	// regra posicional de sempre: sem data cai no Inbox (1ª opção), com data cai na opção seguinte.
	async criarTarefaEmBranco(valoresIniciais?: { data?: string | null; horario?: string | null }): Promise<TFile> {
		const config = this.obterConfiguracoes();
		const data = valoresIniciais?.data ?? null;
		const horario = valoresIniciais?.horario ?? null;
		const status = data ? opcaoStatusComData(config.status) ?? "" : primeiraOpcaoStatus(config.status) ?? "";

		// Calculado antes da criação porque também decide QUAL nota modelo define o valor inicial de
		// "manter registro ao concluir" (a do Inbox tem prioridade quando a tarefa nasce lá).
		const noInbox = status === (primeiraOpcaoStatus(config.status) ?? "");

		const arquivo = await this.criarTarefa("Nova tarefa", {
			status,
			data,
			horario,
			recorrencia: "nenhuma",
			manterHistorico: await this.manterHistoricoInicial(config, noInbox),
			recorrenciaDataFim: null,
			diasAntecedenciaAviso: null,
			propriedades: {},
		});

		const corpo = await this.obterCorpoNovaTarefa(config, noInbox);
		if (corpo) await this.app.vault.append(arquivo, "\n" + corpo + "\n");

		return arquivo;
	}

	// Escolhe o corpo da nota nova. Se a tarefa nasce no Inbox E existe uma "nota modelo (Inbox)" configurada,
	// ela tem prioridade; senão cai na "nota modelo" geral (Configurações → Nota de tarefa), que copia o CORPO
	// dessa nota (sem o frontmatter). Sem nenhuma modelo aplicável (ou se a configurada sumiu/foi movida), cai
	// na geração automática de sempre.
	private async obterCorpoNovaTarefa(config: ConfigEfetivaGrupo, noInbox: boolean): Promise<string> {
		const caminhoInbox = config.templateNota.notaModeloInboxCaminho;
		const caminhoModelo = noInbox && caminhoInbox ? caminhoInbox : config.templateNota.notaModeloCaminho;
		if (caminhoModelo) {
			const arquivoModelo = this.app.vault.getAbstractFileByPath(caminhoModelo);
			if (arquivoModelo instanceof TFile) {
				const conteudo = await this.app.vault.read(arquivoModelo);
				return removerFrontmatter(conteudo);
			}
		}
		return gerarCorpoMetaBind(this.app, config, (propriedadeId) => this.valoresUsados(propriedadeId));
	}

	// Valor inicial de "manter registro ao concluir" numa tarefa nova. O corpo da nota modelo é copiado
	// sem o frontmatter (ver obterCorpoNovaTarefa), então um `manter: false` deixado lá era perdido e
	// toda tarefa nascia com `true` fixo. Aqui esse valor é lido da modelo aplicável e respeitado; sem
	// nota modelo — ou sem a chave nela — segue o default `true` de sempre.
	//
	// Lê o TEXTO CRU em vez do metadataCache de propósito: notas modelo costumam ter placeholders de
	// Templater (`<% tp.date.now(...) %>`) no frontmatter, que não são YAML válido. Quando o parse
	// falha, o Obsidian não indexa frontmatter nenhum e o cache devolveria vazio — o valor da usuária
	// seria silenciosamente ignorado justamente nas notas modelo que mais precisam dele.
	private async manterHistoricoInicial(config: ConfigEfetivaGrupo, noInbox: boolean): Promise<boolean> {
		const caminhoInbox = config.templateNota.notaModeloInboxCaminho;
		const caminhoModelo = noInbox && caminhoInbox ? caminhoInbox : config.templateNota.notaModeloCaminho;
		if (!caminhoModelo) return true;

		const arquivoModelo = this.app.vault.getAbstractFileByPath(caminhoModelo);
		if (!(arquivoModelo instanceof TFile)) return true;

		const conteudo = await this.app.vault.read(arquivoModelo);
		const valor = lerChaveDoFrontmatterCru(conteudo, config.chavesFixas.manterHistorico);
		if (valor === null) return true;
		return valor !== "false";
	}

	async atualizarTarefaCompleta(tarefa: Tarefa, dados: DadosTarefaEscrita): Promise<void> {
		const arquivo = this.app.vault.getAbstractFileByPath(tarefa.caminho);
		if (!(arquivo instanceof TFile)) return;

		const config = this.obterConfiguracoes();
		const { propriedades, dataTarefa, chavesFixas } = config;
		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			escreverFrontmatter(this.app, arquivo, fm, dados, propriedades, dataTarefa.chave ?? "data", config.status.chave || "status", chavesFixas, false);
		});
	}

	// Renomeia o arquivo da tarefa quando o título muda (o título É o nome do arquivo). Desambigua com
	// "nome 2.md" se já existir outro na mesma pasta. Retorna o novo caminho (ou o antigo, se nada mudou).
	async renomearTarefa(tarefa: Tarefa, novoTitulo: string): Promise<string> {
		const arquivo = this.app.vault.getAbstractFileByPath(tarefa.caminho);
		if (!(arquivo instanceof TFile)) return tarefa.caminho;

		const nomeLimpo = sanitizarNomeArquivo(novoTitulo);
		if (!nomeLimpo || nomeLimpo === arquivo.basename) return tarefa.caminho;

		const pasta = arquivo.parent?.path ?? "";
		let destino = normalizePath(pasta ? `${pasta}/${nomeLimpo}.md` : `${nomeLimpo}.md`);
		let contador = 1;
		while (destino !== tarefa.caminho && this.app.vault.getAbstractFileByPath(destino)) {
			destino = normalizePath(pasta ? `${pasta}/${nomeLimpo} ${++contador}.md` : `${nomeLimpo} ${++contador}.md`);
		}
		if (destino === tarefa.caminho) return tarefa.caminho;

		await this.app.fileManager.renameFile(arquivo, destino);
		return destino;
	}

	async atualizarData(tarefa: Tarefa, novaData: string, novoHorario?: string | null): Promise<void> {
		const arquivo = this.app.vault.getAbstractFileByPath(tarefa.caminho);
		if (!(arquivo instanceof TFile)) return;

		const config = this.obterConfiguracoes();
		const chaveData = config.dataTarefa.chave ?? "data";
		const chaveHorario = config.chavesFixas.horario;
		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			fm[chaveData] = novaData;
			if (novoHorario !== undefined) {
				if (novoHorario) fm[chaveHorario] = novoHorario;
				else delete fm[chaveHorario];
			}
		});
	}

	// Usada pelo comando "Concluir tarefa atual" (o botão Meta Bind colado na própria nota, ver
	// meta-bind-tarefa.ts) — reaproveita atualizarStatus (recorrência, mover pra Concluídas, apagar
	// se não guarda histórico) em vez de só escrever o status no frontmatter, que perderia esses efeitos.
	async concluirTarefaAtual(arquivo: TFile): Promise<void> {
		const tarefa = await this.lerTarefaDoDisco(arquivo);
		if (!tarefa) return;
		const concluido = ultimaOpcaoStatus(this.obterConfiguracoes().status);
		if (!concluido) return;
		await this.atualizarStatus(tarefa, concluido);
	}

	async atualizarStatus(tarefaRecebida: Tarefa, novoStatus: string): Promise<void> {
		const arquivo = this.app.vault.getAbstractFileByPath(tarefaRecebida.caminho);
		if (!(arquivo instanceof TFile)) return;

		// Relê o frontmatter direto do conteúdo do arquivo em disco (não do metadataCache, que pode
		// estar obsoleto se a tela ainda não tiver re-renderizado desde a última escrita, ex: tarefa recém-criada).
		const tarefa = (await this.lerTarefaDoDisco(arquivo)) ?? tarefaRecebida;

		const config = this.obterConfiguracoes();
		const { status, moverConcluidas, chavesFixas } = config;
		const chaveStatus = config.status.chave || "status";
		const concluido = ultimaOpcaoStatus(status);
		const estaConcluindo = novoStatus === concluido;

		if (!estaConcluindo) {
			const estavaConcluida = tarefa.status === concluido;
			if (estavaConcluida) {
				const statusRestaurado = tarefa.statusAnterior ?? novoStatus;
				await this.desfazerConclusao(tarefa, statusRestaurado);
				return;
			}
			await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
				fm[chaveStatus] = novoStatus;
			});
			return;
		}

		if (tarefa.recorrencia !== "nenhuma" && !tarefa.manterHistorico) {
			await this.reescreverParaProximaOcorrencia(arquivo, tarefa);
			return;
		}

		// Tarefa não recorrente com "manter registro" desligado: concluir apaga o arquivo, sem deixar
		// nada no histórico (nem move para a pasta de Concluídas). Vale para qualquer tarefa, não só recorrentes.
		if (tarefa.recorrencia === "nenhuma" && !tarefa.manterHistorico) {
			await this.app.vault.delete(arquivo);
			return;
		}

		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			fm[chavesFixas.statusAnterior] = tarefa.status;
			fm[chaveStatus] = novoStatus;
		});

		let caminhoFinal = arquivo.path;
		if (moverConcluidas) {
			caminhoFinal = await this.moverParaConcluidas(arquivo);
		}

		if (tarefa.recorrencia !== "nenhuma") {
			const arquivoAtualizado = this.app.vault.getAbstractFileByPath(caminhoFinal);
			if (arquivoAtualizado instanceof TFile) {
				const proxima = await this.gerarProximaOcorrencia(tarefa, caminhoFinal);
				if (proxima) {
					await this.app.fileManager.processFrontMatter(arquivoAtualizado, (fm) => {
						fm[chavesFixas.proximaOcorrencia] = proxima.path;
					});
				}
			}
		}
	}

	// Reverte uma conclusão: restaura o status anterior, move a tarefa de volta para a pasta de
	// ativas (se tiver sido movida) e, se a próxima ocorrência gerada ainda estiver intocada
	// (nunca editada), apaga-a — evita duas ocorrências "ativas" da mesma recorrência.
	async desfazerConclusao(tarefa: Tarefa, novoStatus: string): Promise<TFile | null> {
		const arquivoInicial = this.app.vault.getAbstractFileByPath(tarefa.caminho);
		if (!(arquivoInicial instanceof TFile)) return null;
		let arquivo: TFile = arquivoInicial;

		if (tarefa.proximaOcorrenciaCaminho) {
			const proximo = this.app.vault.getAbstractFileByPath(tarefa.proximaOcorrenciaCaminho);
			if (proximo instanceof TFile) {
				const proximaTarefa = await this.lerTarefaDoDisco(proximo);
				const { status } = this.obterConfiguracoes();
				const intocada =
					proximaTarefa &&
					proximaTarefa.nasceuDeOcorrenciaCaminho === tarefa.caminho &&
					proximaTarefa.status === (opcaoStatusComData(status) ?? proximaTarefa.status);
				if (intocada) {
					await this.app.vault.delete(proximo);
				}
			}
		}

		const pastaAtivas = normalizePath(this.obterConfiguracoes().pastaTarefas);
		if (arquivo.parent?.path !== pastaAtivas) {
			const nomeBase = arquivo.basename;
			const extensao = arquivo.extension;
			let novoCaminho = normalizePath(`${pastaAtivas}/${arquivo.name}`);
			let contador = 1;
			while (this.app.vault.getAbstractFileByPath(novoCaminho) && novoCaminho !== arquivo.path) {
				novoCaminho = normalizePath(`${pastaAtivas}/${nomeBase} ${++contador}.${extensao}`);
			}
			if (novoCaminho !== arquivo.path) {
				await this.app.fileManager.renameFile(arquivo, novoCaminho);
				arquivo = this.app.vault.getAbstractFileByPath(novoCaminho) as TFile;
			}
		}

		const configAtual = this.obterConfiguracoes();
		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			fm[configAtual.status.chave || "status"] = novoStatus;
			delete fm[configAtual.chavesFixas.statusAnterior];
			delete fm[configAtual.chavesFixas.proximaOcorrencia];
		});

		return arquivo;
	}

	private async reescreverParaProximaOcorrencia(arquivo: TFile, tarefa: Tarefa): Promise<void> {
		if (!tarefa.data) return;
		const novaData = proximaData(tarefa.data, tarefa.recorrencia);

		if (tarefa.recorrenciaDataFim && novaData > tarefa.recorrenciaDataFim) {
			const config = this.obterConfiguracoes();
			await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
				fm[config.status.chave || "status"] = ultimaOpcaoStatus(config.status);
			});
			return;
		}

		const config = this.obterConfiguracoes();
		const { status, dataTarefa } = config;
		const chaveData = dataTarefa.chave ?? "data";
		const chaveHorario = config.chavesFixas.horario;
		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			fm[config.status.chave || "status"] = opcaoStatusComData(status) ?? tarefa.status;
			fm[chaveData] = novaData;
			// A próxima ocorrência nasce SEM horário — o horário posto numa ocorrência vale só para
			// ela. Aqui o mesmo arquivo é reescrito, então a chave precisa ser esvaziada à mão; sem
			// isso o horário da ocorrência concluída seguiria para a seguinte.
			// Esvaziada, não deletada: a chave presente e vazia é o que mantém o INPUT[time:...] da
			// nota modelo funcionando (o Meta Bind só escreve em chave que já existe).
			if (chaveHorario in fm) fm[chaveHorario] = null;
		});
	}

	private async moverParaConcluidas(arquivo: TFile): Promise<string> {
		const pastaDestino = await this.garantirPastaMesConcluidas(new Date());
		const nomeBase = arquivo.basename;
		const extensao = arquivo.extension;

		let novoCaminho = normalizePath(`${pastaDestino.path}/${arquivo.name}`);
		let contador = 1;
		while (this.app.vault.getAbstractFileByPath(novoCaminho) && novoCaminho !== arquivo.path) {
			novoCaminho = normalizePath(`${pastaDestino.path}/${nomeBase} ${++contador}.${extensao}`);
		}

		if (novoCaminho === arquivo.path) return arquivo.path;
		await this.app.fileManager.renameFile(arquivo, novoCaminho);
		return novoCaminho;
	}

	private async gerarProximaOcorrencia(tarefa: Tarefa, caminhoOrigem: string): Promise<TFile | null> {
		if (!tarefa.data) return null;
		const novaData = proximaData(tarefa.data, tarefa.recorrencia);

		if (tarefa.recorrenciaDataFim && novaData > tarefa.recorrenciaDataFim) {
			return null;
		}

		const { status } = this.obterConfiguracoes();
		const arquivoNovo = await this.criarTarefa(tarefa.titulo, {
			status: opcaoStatusComData(status) ?? tarefa.status,
			data: novaData,
			// Sem horário de propósito: a próxima ocorrência nasce como a tarefa recorrente foi
			// criada. Horário posto numa ocorrência é dela só, não se propaga para as seguintes.
			horario: null,
			recorrencia: tarefa.recorrencia,
			manterHistorico: tarefa.manterHistorico,
			recorrenciaDataFim: tarefa.recorrenciaDataFim,
			diasAntecedenciaAviso: tarefa.diasAntecedenciaAviso,
			propriedades: tarefa.propriedades,
		});
		await this.app.fileManager.processFrontMatter(arquivoNovo, (fm) => {
			fm[this.obterConfiguracoes().chavesFixas.ocorrenciaAnterior] = caminhoOrigem;
		});
		return arquivoNovo;
	}

	async atualizarPropriedade(tarefa: Tarefa, propriedadeId: string, novoValor: PropriedadeValor): Promise<void> {
		const arquivo = this.app.vault.getAbstractFileByPath(tarefa.caminho);
		if (!(arquivo instanceof TFile)) return;

		const { propriedades } = this.obterConfiguracoes();
		const def = propriedades.find((p) => p.id === propriedadeId);

		await this.app.fileManager.processFrontMatter(arquivo, (fm) => {
			if (novoValor === null || (Array.isArray(novoValor) && novoValor.length === 0)) {
				delete fm[propriedadeId];
			} else if (def?.tipo === "link_arquivo" && typeof novoValor === "string") {
				const link = formatarLinkArquivo(this.app, arquivo, novoValor);
				if (link) fm[propriedadeId] = link;
				else delete fm[propriedadeId];
			} else if (def?.tipo === "lista") {
				fm[propriedadeId] = Array.isArray(novoValor) ? novoValor : [novoValor];
			} else {
				fm[propriedadeId] = novoValor;
			}
		});
	}

	// Renomeia a CHAVE de uma propriedade no frontmatter de todas as tarefas do grupo (não só o rótulo
	// exibido no plugin). Usado quando a usuária muda o "id"/chave técnica de uma propriedade, ou a chave
	// de qualquer campo fixo (status, data, horário, recorrência...) em Configurações — sem isso, o plugin
	// continuaria lendo/escrevendo a chave antiga, que já não existe mais no arquivo, e a tarefa pareceria
	// ter perdido o valor (bug relatado originalmente com a propriedade "referência").
	async renomearChaveFrontmatter(chaveAntiga: string, chaveNova: string): Promise<number> {
		const configuracoes = this.obterConfiguracoes();
		const arquivos = this.app.vault.getMarkdownFiles().filter((f) => arquivoEhTarefaRelevante(configuracoes, f.path));
		return renomearChaveEmArquivos(this.app, arquivos, chaveAntiga, chaveNova);
	}

	async excluirTarefa(tarefa: Tarefa): Promise<void> {
		const arquivo = this.app.vault.getAbstractFileByPath(tarefa.caminho);
		if (arquivo instanceof TFile) {
			await this.app.vault.delete(arquivo);
		}
	}

	async migrarChaveData(chaveAntiga: string, chaveNova: string): Promise<number> {
		return this.renomearChaveFrontmatter(chaveAntiga, chaveNova);
	}

	async migrarValoresStatus(mapaAntigoParaNovo: Map<string, string>): Promise<void> {
		const config = this.obterConfiguracoes();
		const chaveStatus = config.status.chave || "status";
		// arquivoEhTarefaRelevante (não só a pasta de ativas) — uma tarefa já concluída também pode ter um
		// valor de status antigo (ex: antes de ser movida) e precisa ser migrada junto.
		const arquivos = this.app.vault.getMarkdownFiles().filter((f) => arquivoEhTarefaRelevante(config, f.path));

		for (const arquivo of arquivos) {
			const fm = this.app.metadataCache.getFileCache(arquivo)?.frontmatter;
			const statusAtual = fm?.[chaveStatus] as string | undefined;
			if (!statusAtual) continue;

			const novoStatus = mapaAntigoParaNovo.get(statusAtual);
			if (!novoStatus || novoStatus === statusAtual) continue;

			await this.app.fileManager.processFrontMatter(arquivo, (frontmatter) => {
				frontmatter[chaveStatus] = novoStatus;
			});
		}
	}

	valoresUsados(propriedadeId: string): string[] {
		const vistos = new Set<string>();
		for (const tarefa of this.listarTarefas()) {
			const valor = tarefa.propriedades[propriedadeId];
			if (Array.isArray(valor)) {
				for (const item of valor) vistos.add(item);
			} else if (typeof valor === "string" && valor) {
				vistos.add(valor);
			}
		}
		return Array.from(vistos).sort((a, b) => a.localeCompare(b));
	}

	valoresDeStatusEmUso(): string[] {
		const vistos = new Set<string>();
		for (const tarefa of this.listarTarefas()) {
			if (tarefa.status) vistos.add(tarefa.status);
		}
		return Array.from(vistos);
	}
}
