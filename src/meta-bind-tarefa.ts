import { App } from "obsidian";
import { ConfigEfetivaGrupo, OpcaoSelecao, PropriedadeDefinida, RECORRENCIA_LABELS, Recorrencia, campoPodeSerOpcional, campoVisivelNaNota } from "./tipos";

// Meta Bind aceita valor de option() sem aspas só quando não há espaço/vírgula/parênteses/aspas. Qualquer
// outro caractere exige aspas (com a aspas interna escapada) — mais seguro que assumir sempre sem aspas.
function valorOpcaoMetaBind(valor: string): string {
	if (/^[\p{L}\p{N}_-]+$/u.test(valor)) return valor;
	return `"${valor.replace(/"/g, '\\"')}"`;
}

function opcaoMetaBind(valor: string, rotulo: string): string {
	return `option(${valorOpcaoMetaBind(valor)}, ${valorOpcaoMetaBind(rotulo)})`;
}

function campoInlineSelect(chave: string, opcoes: OpcaoSelecao[]): string {
	const partes = opcoes.map((o) => opcaoMetaBind(o.valor, o.valor));
	return `INPUT[inlineSelect(${partes.join(", ")}):${chave}]`;
}

function opcoesStatusVisiveis(config: ConfigEfetivaGrupo): OpcaoSelecao[] {
	const permitidas = config.templateNota.opcoesStatusVisiveis;
	if (!permitidas) return config.status.opcoes;
	return config.status.opcoes.filter((o) => permitidas.includes(o.valor));
}

function opcoesRecorrenciaVisiveis(config: ConfigEfetivaGrupo): Recorrencia[] {
	const todas = Object.keys(RECORRENCIA_LABELS) as Recorrencia[];
	const permitidas = config.templateNota.opcoesRecorrenciaVisiveis;
	if (!permitidas) return todas;
	return todas.filter((chave) => permitidas.includes(chave));
}

function opcoesPropriedadeVisiveis(config: ConfigEfetivaGrupo, def: PropriedadeDefinida): OpcaoSelecao[] {
	const todas = def.opcoes ?? [];
	const permitidas = config.templateNota.opcoesPropriedadeVisiveis?.[def.id];
	if (!permitidas) return todas;
	return todas.filter((o) => permitidas.includes(o.valor));
}

// Um campo/propriedade traduzido pra sintaxe Meta Bind. `inline: true` = campo simples (`INPUT[...]`,
// mostrado entre crases simples numa nota); `inline: false` = precisa de bloco de código (``` meta-bind).
// `chave`/`valorInicialBotao`: usados pra gerar o botão "adicionar propriedade" (só pra campos que podem
// ser opcionais — ver botaoAdicionarCampo). Ausentes = campo não gera botão (ex: concluir_botao).
export interface CampoMetaBind {
	id: string;
	rotulo: string;
	codigo: string;
	inline: boolean;
	chave?: string;
	valorInicialBotao?: string;
}

// Texto pronto pra colar numa nota: envolve em crase simples quando inline, ou devolve o bloco de código
// como está (já vem com as crases triplas).
export function codigoParaColar(campo: CampoMetaBind): string {
	return campo.inline ? `\`${campo.codigo}\`` : campo.codigo;
}

// Botão Meta Bind (declarativo, sem JS) que CRIA a propriedade do campo no frontmatter da nota atual —
// pra campos marcados "opcionais", que não nascem pré-gravados. A ação updateMetadata com evaluate:false
// escreve um valor literal na `bindTarget` (a chave), fazendo a chave passar a existir; a partir daí o
// campo de preenchimento (INPUT[...]) que ela colou ao lado consegue editar a propriedade normalmente.
// Retorna null se o campo não tem chave (ex: um botão não vira "propriedade opcional").
export function botaoAdicionarCampo(campo: CampoMetaBind): string | null {
	if (!campo.chave || !campoPodeSerOpcional(campo.id)) return null;
	const valor = campo.valorInicialBotao ?? "null";
	return [
		"```meta-bind-button",
		`label: "adicionar ${campo.rotulo}"`,
		"icon: plus",
		"style: default",
		"action:",
		"  type: updateMetadata",
		`  bindTarget: ${campo.chave}`,
		"  evaluate: false",
		`  value: ${valor}`,
		"```",
	].join("\n");
}

function campoPropriedade(
	app: App,
	config: ConfigEfetivaGrupo,
	def: PropriedadeDefinida,
	obterValoresUsados?: (propriedadeId: string) => string[]
): CampoMetaBind | null {
	switch (def.tipo) {
		case "texto":
			return { id: def.id, rotulo: def.rotulo, codigo: `INPUT[text:${def.id}]`, inline: true, chave: def.id, valorInicialBotao: "null" };
		case "data":
			return { id: def.id, rotulo: def.rotulo, codigo: `INPUT[date:${def.id}]`, inline: true, chave: def.id, valorInicialBotao: "null" };
		case "selecao":
			return {
				id: def.id,
				rotulo: def.rotulo,
				codigo: campoInlineSelect(def.id, opcoesPropriedadeVisiveis(config, def)),
				inline: true,
				chave: def.id,
				valorInicialBotao: "null",
			};
		case "link_arquivo": {
			if (def.arquivosFixos && def.arquivosFixos.length > 0) {
				const partes = def.arquivosFixos.map((caminho) => {
					const arquivo = app.vault.getAbstractFileByPath(caminho);
					const nome = arquivo?.name.replace(/\.md$/, "") ?? caminho;
					// O VALOR gravado precisa ser um wikilink [[nome]] — é a única forma que o Obsidian
					// reconhece como frontmatterLink (o que `extrairArquivoLinkado` lê). O rótulo mostrado
					// no suggester continua sendo só o nome legível.
					return opcaoMetaBind(`[[${nome}]]`, nome);
				});
				return { id: def.id, rotulo: def.rotulo, codigo: `INPUT[suggester(${partes.join(", ")}):${def.id}]`, inline: true, chave: def.id, valorInicialBotao: "null" };
			}
			return { id: def.id, rotulo: def.rotulo, codigo: `INPUT[suggester:${def.id}]`, inline: true, chave: def.id, valorInicialBotao: "null" };
		}
		case "lista": {
			// Bloco de código: listSuggester não é permitido inline. As sugestões são uma foto estática dos
			// valores já usados hoje nessa propriedade (não atualiza sozinha depois — o Meta Bind deste vault
			// roda com enableJs desligado, então não dá pra recalcular a lista dinamicamente).
			const usados = obterValoresUsados?.(def.id) ?? [];
			const partes = usados.map((v) => opcaoMetaBind(v, v));
			const corpo = partes.length > 0 ? `INPUT[listSuggester(${partes.join(", ")}):${def.id}]` : `INPUT[list:${def.id}]`;
			// Lista nasce como array vazio (o botão cria a chave já como lista pra o listSuggester escrever nela).
			return { id: def.id, rotulo: def.rotulo, codigo: `\`\`\`meta-bind\n${corpo}\n\`\`\``, inline: false, chave: def.id, valorInicialBotao: "[]" };
		}
		default:
			return null;
	}
}

// Lista, na ordem Status → Prazo → Horário → Manter registro → Recorrência → Repetir até → Antecedência →
// propriedades customizadas (por .ordem), todo campo visível (config.templateNota) com seu código Meta
// Bind pronto — usada tanto pra montar o corpo automático (gerarCorpoMetaBind) quanto pra mostrar os
// códigos copiáveis em Configurações → "Nota de tarefa".
export function listarCamposMetaBind(
	app: App,
	config: ConfigEfetivaGrupo,
	obterValoresUsados?: (propriedadeId: string) => string[]
): CampoMetaBind[] {
	const campos: CampoMetaBind[] = [];

	if (campoVisivelNaNota(config, "status")) {
		campos.push({
			id: "status",
			rotulo: config.status.rotulo,
			codigo: campoInlineSelect(config.status.chave || "status", opcoesStatusVisiveis(config)),
			inline: true,
		});
	}
	if (campoVisivelNaNota(config, "prazo")) {
		campos.push({
			id: "prazo",
			rotulo: config.dataTarefa.rotulo,
			codigo: `INPUT[date:${config.dataTarefa.chave || "data"}]`,
			inline: true,
		});
	}
	if (campoVisivelNaNota(config, "horario")) {
		campos.push({
			id: "horario",
			rotulo: "horário",
			codigo: `INPUT[time:${config.chavesFixas.horario}]`,
			inline: true,
			chave: config.chavesFixas.horario,
			valorInicialBotao: "null",
		});
	}
	if (campoVisivelNaNota(config, "manter_historico")) {
		campos.push({
			id: "manter_historico",
			rotulo: "manter registro ao concluir",
			codigo: `INPUT[toggle:${config.chavesFixas.manterHistorico}]`,
			inline: true,
			chave: config.chavesFixas.manterHistorico,
			valorInicialBotao: "true",
		});
	}
	if (campoVisivelNaNota(config, "recorrencia")) {
		const partes = opcoesRecorrenciaVisiveis(config).map((chave) => opcaoMetaBind(chave, RECORRENCIA_LABELS[chave]));
		campos.push({
			id: "recorrencia",
			rotulo: "recorrência",
			codigo: `INPUT[inlineSelect(${partes.join(", ")}):${config.chavesFixas.recorrencia}]`,
			inline: true,
			chave: config.chavesFixas.recorrencia,
			valorInicialBotao: "nenhuma",
		});
	}
	if (campoVisivelNaNota(config, "repetir_ate")) {
		campos.push({
			id: "repetir_ate",
			rotulo: "repetir até",
			codigo: `INPUT[date:${config.chavesFixas.recorrenciaDataFim}]`,
			inline: true,
			chave: config.chavesFixas.recorrenciaDataFim,
			valorInicialBotao: "null",
		});
	}
	if (campoVisivelNaNota(config, "antecedencia")) {
		campos.push({
			id: "antecedencia",
			rotulo: "avisar com antecedência",
			codigo: `INPUT[number:${config.chavesFixas.antecedencia}]`,
			inline: true,
			chave: config.chavesFixas.antecedencia,
			valorInicialBotao: "null",
		});
	}
	if (campoVisivelNaNota(config, "concluir_botao")) {
		// Roda o comando "Concluir tarefa atual" (main.ts) em vez de escrever o status direto no
		// frontmatter — assim o clique passa pela mesma lógica de recorrência/histórico/Concluídas que
		// o Kanban e a Lista já usam, ao invés de só trocar o valor cru da propriedade de status.
		campos.push({
			id: "concluir_botao",
			rotulo: "concluir tarefa",
			codigo:
				'```meta-bind-button\nlabel: "Concluir"\nicon: check\nstyle: primary\naction:\n  type: command\n  command: my-tasks:concluir-tarefa-atual\n```',
			inline: false,
		});
	}

	for (const def of [...config.propriedades].sort((a, b) => a.ordem - b.ordem)) {
		if (!campoVisivelNaNota(config, def.id)) continue;
		const campo = campoPropriedade(app, config, def, obterValoresUsados);
		if (campo) campos.push(campo);
	}

	return campos;
}

// Monta o CORPO (não o frontmatter) da nota criada por "Nova tarefa" quando nenhuma nota modelo está
// configurada (ver RepositorioTarefas.criarTarefaEmBranco) — uma linha rotulada por campo visível.
export function gerarCorpoMetaBind(
	app: App,
	config: ConfigEfetivaGrupo,
	obterValoresUsados?: (propriedadeId: string) => string[]
): string {
	return listarCamposMetaBind(app, config, obterValoresUsados)
		.map((campo) => (campo.inline ? `- ${campo.rotulo}: ${codigoParaColar(campo)}` : `- ${campo.rotulo}:\n${campo.codigo}`))
		.join("\n\n");
}
