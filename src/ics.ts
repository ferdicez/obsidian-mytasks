// Leitor de arquivos .ics (iCalendar, RFC 5545) — o formato que o Google Agenda publica no
// "endereço secreto em formato iCal". Só o suficiente pra DESENHAR eventos: título, descrição,
// local, início/fim e recorrência. Nada aqui escreve de volta.
//
// Este arquivo é deliberadamente livre de dependências do Obsidian: é lógica pura de data/texto,
// o que permite exercitá-la em Node isoladamente (recorrência é a parte com mais risco de erro).

// ---------- Estruturas intermediárias ----------

// Uma data/hora lida do .ics, já resolvida para os componentes do FUSO LOCAL. Guardamos os
// componentes (não um Date) porque é o formato em que o calendário desenha, e porque somar dias a
// componentes locais evita a armadilha de DST que um epoch puro traria.
export interface MomentoLocal {
	ano: number;
	mes: number; // 1-12
	dia: number;
	hora: number;
	minuto: number;
	// Evento "de dia inteiro" (DTSTART;VALUE=DATE) — sem horário, ocupa o dia todo.
	diaInteiro: boolean;
}

export interface RegraRecorrencia {
	frequencia: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
	intervalo: number;
	// Fim da repetição por data limite (UNTIL) e/ou por contagem (COUNT). Ambos podem faltar (infinito).
	ate: MomentoLocal | null;
	quantidade: number | null;
	// BYDAY: dias da semana (0=domingo … 6=sábado). Usado em WEEKLY ("toda terça e quinta") e em
	// MONTHLY posicional ("terceira quinta"), onde cada entrada pode ter um ordinal.
	porDiaSemana: { diaSemana: number; ordinal: number | null }[];
	porDiaMes: number[]; // BYMONTHDAY
	porMes: number[]; // BYMONTH (1-12)
}

export interface EventoIcs {
	uid: string;
	titulo: string;
	descricao: string | null;
	local: string | null;
	inicio: MomentoLocal;
	fim: MomentoLocal | null;
	recorrencia: RegraRecorrencia | null;
	// EXDATE: ocorrências canceladas ("essa semana não"), como chaves AAAA-MM-DD.
	excecoes: Set<string>;
	// RECURRENCE-ID: este VEVENT é a versão REMARCADA de uma ocorrência específica da série de mesmo
	// UID. Guardamos a data original pra suprimir a ocorrência gerada pela regra e usar esta no lugar.
	substituiData: string | null;
}

// ---------- Desdobramento de linhas ----------

// O .ics quebra linhas longas em 75 octetos e continua na linha seguinte com um espaço/tab inicial
// ("line folding", RFC 5545 §3.1). Sem desdobrar, um título ou descrição longa chega picotado.
function desdobrarLinhas(texto: string): string[] {
	const linhasBrutas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	const linhas: string[] = [];
	for (const linha of linhasBrutas) {
		if ((linha.startsWith(" ") || linha.startsWith("\t")) && linhas.length > 0) {
			linhas[linhas.length - 1] += linha.slice(1);
		} else {
			linhas.push(linha);
		}
	}
	return linhas;
}

// Uma linha do .ics é `NOME;PARAM=VALOR;PARAM=VALOR:valor`. O primeiro `:` separa a chave dos
// parâmetros do valor — mas `:` também aparece DENTRO do valor (ex: uma URL na descrição), então só
// o primeiro conta. Parâmetros entre aspas podem conter `;`, daí a varredura manual.
interface LinhaIcs {
	nome: string;
	parametros: Record<string, string>;
	valor: string;
}

function lerLinha(linha: string): LinhaIcs | null {
	let posDoisPontos = -1;
	let dentroDeAspas = false;
	for (let i = 0; i < linha.length; i++) {
		const c = linha[i];
		if (c === '"') dentroDeAspas = !dentroDeAspas;
		else if (c === ":" && !dentroDeAspas) {
			posDoisPontos = i;
			break;
		}
	}
	if (posDoisPontos === -1) return null;

	const cabecalho = linha.slice(0, posDoisPontos);
	const valor = linha.slice(posDoisPontos + 1);

	const partes: string[] = [];
	let atual = "";
	dentroDeAspas = false;
	for (const c of cabecalho) {
		if (c === '"') {
			dentroDeAspas = !dentroDeAspas;
			atual += c;
		} else if (c === ";" && !dentroDeAspas) {
			partes.push(atual);
			atual = "";
		} else {
			atual += c;
		}
	}
	partes.push(atual);

	const nome = partes[0].toUpperCase();
	const parametros: Record<string, string> = {};
	for (const parte of partes.slice(1)) {
		const igual = parte.indexOf("=");
		if (igual === -1) continue;
		const chave = parte.slice(0, igual).toUpperCase();
		let v = parte.slice(igual + 1);
		if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
		parametros[chave] = v;
	}

	return { nome, parametros, valor };
}

// Valores de texto escapam vírgula, ponto-e-vírgula, barra e quebra de linha (RFC 5545 §3.3.11).
function desescaparTexto(valor: string): string {
	return valor
		.replace(/\\n/gi, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";")
		.replace(/\\\\/g, "\\");
}

// ---------- Datas ----------

// Converte os componentes de um instante UTC para os componentes do fuso LOCAL. É o Date do JS que
// faz a conversão (inclusive DST); só extraímos os componentes de volta.
function utcParaLocal(
	ano: number,
	mes: number,
	dia: number,
	hora: number,
	minuto: number,
	segundo: number
): MomentoLocal {
	const d = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
	return {
		ano: d.getFullYear(),
		mes: d.getMonth() + 1,
		dia: d.getDate(),
		hora: d.getHours(),
		minuto: d.getMinutes(),
		diaInteiro: false,
	};
}

// Formas que DTSTART/DTEND/UNTIL assumem:
//   20260729           -> data pura (dia inteiro), sem fuso
//   20260729T140000Z   -> instante em UTC, converter pro fuso local
//   20260729T140000    -> hora "flutuante" ou com TZID declarado no parâmetro
//
// Sobre TZID: o correto seria resolver o fuso nomeado (ex: America/Sao_Paulo) via VTIMEZONE. Fazer
// isso direito exige interpretar as regras de DST embutidas no arquivo. Aqui tratamos a hora com
// TZID como hora LOCAL — o que é exato para quem lê a própria agenda no mesmo fuso em que ela foi
// criada (o caso real de uso) e erra para eventos criados em outro fuso. Documentado como limite
// conhecido em vez de fingir precisão que não temos.
export function lerMomento(valor: string, parametros: Record<string, string>): MomentoLocal | null {
	const bruto = valor.trim();

	const soData = /^(\d{4})(\d{2})(\d{2})$/.exec(bruto);
	if (soData) {
		return {
			ano: parseInt(soData[1], 10),
			mes: parseInt(soData[2], 10),
			dia: parseInt(soData[3], 10),
			hora: 0,
			minuto: 0,
			diaInteiro: parametros.VALUE === "DATE" || true,
		};
	}

	const comHora = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(bruto);
	if (!comHora) return null;

	const ano = parseInt(comHora[1], 10);
	const mes = parseInt(comHora[2], 10);
	const dia = parseInt(comHora[3], 10);
	const hora = parseInt(comHora[4], 10);
	const minuto = parseInt(comHora[5], 10);
	const segundo = parseInt(comHora[6], 10);
	const ehUtc = comHora[7] === "Z";

	if (ehUtc) return utcParaLocal(ano, mes, dia, hora, minuto, segundo);
	return { ano, mes, dia, hora, minuto, diaInteiro: false };
}

export function chaveData(momento: MomentoLocal): string {
	const mes = String(momento.mes).padStart(2, "0");
	const dia = String(momento.dia).padStart(2, "0");
	return `${momento.ano}-${mes}-${dia}`;
}

export function chaveHorario(momento: MomentoLocal): string | null {
	if (momento.diaInteiro) return null;
	return `${String(momento.hora).padStart(2, "0")}:${String(momento.minuto).padStart(2, "0")}`;
}

function paraDate(momento: MomentoLocal): Date {
	return new Date(momento.ano, momento.mes - 1, momento.dia, momento.hora, momento.minuto, 0, 0);
}

function deDate(data: Date, diaInteiro: boolean): MomentoLocal {
	return {
		ano: data.getFullYear(),
		mes: data.getMonth() + 1,
		dia: data.getDate(),
		hora: data.getHours(),
		minuto: data.getMinutes(),
		diaInteiro,
	};
}

// ---------- RRULE ----------

const DIAS_SEMANA_ICS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function lerRegraRecorrencia(valor: string): RegraRecorrencia | null {
	const partes = valor.split(";");
	const mapa: Record<string, string> = {};
	for (const parte of partes) {
		const igual = parte.indexOf("=");
		if (igual === -1) continue;
		mapa[parte.slice(0, igual).toUpperCase()] = parte.slice(igual + 1);
	}

	const freq = (mapa.FREQ ?? "").toUpperCase();
	if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;

	const porDiaSemana: { diaSemana: number; ordinal: number | null }[] = [];
	if (mapa.BYDAY) {
		for (const entrada of mapa.BYDAY.split(",")) {
			// Entradas podem vir com ordinal: "3TH" = terceira quinta, "-1FR" = última sexta.
			const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(entrada.trim().toUpperCase());
			if (!m) continue;
			const diaSemana = DIAS_SEMANA_ICS[m[2]];
			if (diaSemana === undefined) continue;
			porDiaSemana.push({ diaSemana, ordinal: m[1] ? parseInt(m[1], 10) : null });
		}
	}

	const numeros = (chave: string): number[] =>
		mapa[chave]
			? mapa[chave]
					.split(",")
					.map((n) => parseInt(n.trim(), 10))
					.filter((n) => !Number.isNaN(n))
			: [];

	return {
		frequencia: freq,
		intervalo: Math.max(1, parseInt(mapa.INTERVAL ?? "1", 10) || 1),
		ate: mapa.UNTIL ? lerMomento(mapa.UNTIL, {}) : null,
		quantidade: mapa.COUNT ? parseInt(mapa.COUNT, 10) : null,
		porDiaSemana,
		porDiaMes: numeros("BYMONTHDAY"),
		porMes: numeros("BYMONTH"),
	};
}

// Limite duro de ocorrências geradas por série. Uma regra sem UNTIL nem COUNT é infinita; como a
// geração é sempre pedida para uma janela finita, isso é só uma rede de segurança contra loop.
const MAX_OCORRENCIAS = 2000;

// Gera as datas de início das ocorrências de um evento recorrente que caem em [janelaInicio, janelaFim].
//
// Estratégia: iterar a partir do DTSTART no passo da frequência, testando cada candidata contra os
// filtros BY*. Simples e previsível; o custo é irrelevante nas janelas que o calendário usa (um mês,
// um ano). Séries que começaram há muitos anos são adiantadas em blocos antes do laço fino.
export function gerarOcorrencias(
	evento: EventoIcs,
	janelaInicio: Date,
	janelaFim: Date
): MomentoLocal[] {
	const regra = evento.recorrencia;
	if (!regra) {
		const d = paraDate(evento.inicio);
		return d >= janelaInicio && d <= janelaFim ? [evento.inicio] : [];
	}

	const inicio = paraDate(evento.inicio);
	const limiteRegra = regra.ate ? paraDate(regra.ate) : null;
	const fimEfetivo = limiteRegra && limiteRegra < janelaFim ? limiteRegra : janelaFim;

	const ocorrencias: MomentoLocal[] = [];
	// COUNT conta ocorrências desde o INÍCIO da série, não desde a janela — então contamos todas as
	// candidatas válidas que passam, mesmo as anteriores à janela, e só coletamos as que caem nela.
	let contador = 0;

	const cursor = new Date(inicio);
	// Índice do passo atual desde o DTSTART (0 = o próprio DTSTART). Para MONTHLY/YEARLY, é ele que
	// define o mês-alvo: derivar a data sempre de (mês do início + passo × intervalo) evita o
	// escorregamento que aconteceria ao somar meses sobre a data já deslocada.
	let passo = 0;

	// Uma série antiga sem UNTIL/COUNT (ex: reunião semanal desde 2020) tem milhares de ocorrências
	// antes da janela pedida. Iterar todas estouraria MAX_OCORRENCIAS e a série sumiria da tela.
	// Quando COUNT não está em jogo — só aí a contagem das anteriores importa — pulamos o cursor
	// direto para perto do início da janela.
	if (regra.quantidade === null && cursor < janelaInicio) {
		passo = passosAteJanela(inicio, janelaInicio, regra);
		posicionarCursor(cursor, inicio, regra, passo);
	}

	let iteracoes = 0;

	while (cursor <= fimEfetivo && iteracoes < MAX_OCORRENCIAS) {
		iteracoes++;

		// Para WEEKLY com BYDAY, cada passo do cursor é uma SEMANA e pode render vários dias.
		const candidatas: Date[] = [];

		if (regra.frequencia === "WEEKLY" && regra.porDiaSemana.length > 0) {
			const domingoDaSemana = new Date(cursor);
			domingoDaSemana.setDate(domingoDaSemana.getDate() - domingoDaSemana.getDay());
			for (const { diaSemana } of regra.porDiaSemana) {
				const d = new Date(domingoDaSemana);
				d.setDate(d.getDate() + diaSemana);
				d.setHours(inicio.getHours(), inicio.getMinutes(), 0, 0);
				// Ocorrência anterior ao começo da série não existe (a primeira semana pode ter dias antes).
				if (d >= inicio) candidatas.push(d);
			}
			candidatas.sort((a, b) => a.getTime() - b.getTime());
		} else if (regra.frequencia === "MONTHLY" && regra.porDiaSemana.length > 0) {
			// MONTHLY posicional: "terceira quinta-feira", "última sexta".
			for (const { diaSemana, ordinal } of regra.porDiaSemana) {
				const d = diaSemanaDoMes(cursor.getFullYear(), cursor.getMonth(), diaSemana, ordinal ?? 1);
				if (!d) continue;
				d.setHours(inicio.getHours(), inicio.getMinutes(), 0, 0);
				if (d >= inicio) candidatas.push(d);
			}
			candidatas.sort((a, b) => a.getTime() - b.getTime());
		} else if (regra.frequencia === "MONTHLY" && regra.porDiaMes.length > 0) {
			for (const diaMes of regra.porDiaMes) {
				const d = diaDoMes(cursor.getFullYear(), cursor.getMonth(), diaMes);
				if (!d) continue;
				d.setHours(inicio.getHours(), inicio.getMinutes(), 0, 0);
				if (d >= inicio) candidatas.push(d);
			}
			candidatas.sort((a, b) => a.getTime() - b.getTime());
		} else if (!(cursor as Date & { __diaInvalido?: boolean }).__diaInvalido) {
			// Sem __diaInvalido, o cursor É a ocorrência. Com ele (mês sem o dia da série, ex: 31/fev),
			// esta volta não rende nada e o laço segue para o próximo mês.
			candidatas.push(new Date(cursor));
		}

		for (const candidata of candidatas) {
			if (limiteRegra && candidata > limiteRegra) continue;
			// BYMONTH filtra qualquer frequência ("todo dia 10, mas só em janeiro e julho").
			if (regra.porMes.length > 0 && !regra.porMes.includes(candidata.getMonth() + 1)) continue;
			// BYDAY em DAILY/YEARLY funciona como filtro de dia da semana (sem ordinal).
			if (
				(regra.frequencia === "DAILY" || regra.frequencia === "YEARLY") &&
				regra.porDiaSemana.length > 0 &&
				!regra.porDiaSemana.some((d) => d.diaSemana === candidata.getDay())
			) {
				continue;
			}

			contador++;
			if (regra.quantidade !== null && contador > regra.quantidade) return ocorrencias;

			if (candidata >= janelaInicio && candidata <= fimEfetivo) {
				ocorrencias.push(deDate(candidata, evento.inicio.diaInteiro));
			}
		}

		passo++;
		posicionarCursor(cursor, inicio, regra, passo);
	}

	return ocorrencias;
}

// Coloca o cursor no N-ésimo passo da série, SEMPRE calculado a partir do DTSTART original em vez de
// somado sobre a posição anterior. Isso é o que faz "todo dia 31" pular fevereiro em vez de
// escorregar para 28/fev e depois arrastar a série inteira para o dia errado.
//
// Para MONTHLY/YEARLY o cursor aponta o dia 1 do mês-alvo quando a regra usa BYDAY/BYMONTHDAY (o
// laço deriva os dias reais dali). Sem BY*, o cursor É a data da ocorrência — e um mês sem aquele
// dia recebe a data inválida de propósito, para que o laço a descarte.
function posicionarCursor(cursor: Date, inicio: Date, regra: RegraRecorrencia, passo: number): void {
	const hora = inicio.getHours();
	const minuto = inicio.getMinutes();

	switch (regra.frequencia) {
		case "DAILY":
			cursor.setTime(inicio.getTime());
			cursor.setDate(inicio.getDate() + passo * regra.intervalo);
			break;
		case "WEEKLY":
			cursor.setTime(inicio.getTime());
			cursor.setDate(inicio.getDate() + passo * 7 * regra.intervalo);
			break;
		case "MONTHLY": {
			const mesAlvo = inicio.getMonth() + passo * regra.intervalo;
			const usaGradeDoMes = regra.porDiaSemana.length > 0 || regra.porDiaMes.length > 0;
			if (usaGradeDoMes) {
				cursor.setTime(new Date(inicio.getFullYear(), mesAlvo, 1, hora, minuto, 0, 0).getTime());
			} else {
				const ano = inicio.getFullYear() + Math.floor(mesAlvo / 12);
				const mesNormalizado = ((mesAlvo % 12) + 12) % 12;
				const ultimoDia = new Date(ano, mesNormalizado + 1, 0).getDate();
				// Dia inexistente no mês (31 em fevereiro): marca como inválido — o laço pula esta volta
				// mas o cursor continua avançando, então a série retoma no próximo mês que tiver o dia.
				if (inicio.getDate() > ultimoDia) {
					cursor.setTime(new Date(ano, mesNormalizado, 1, hora, minuto, 0, 0).getTime());
					cursor.setFullYear(cursor.getFullYear(), cursor.getMonth(), 1);
					(cursor as Date & { __diaInvalido?: boolean }).__diaInvalido = true;
					return;
				}
				cursor.setTime(new Date(ano, mesNormalizado, inicio.getDate(), hora, minuto, 0, 0).getTime());
			}
			break;
		}
		case "YEARLY":
			cursor.setTime(inicio.getTime());
			cursor.setFullYear(inicio.getFullYear() + passo * regra.intervalo);
			break;
	}
	delete (cursor as Date & { __diaInvalido?: boolean }).__diaInvalido;
}

// Quantos passos da série cabem entre o DTSTART e o começo da janela pedida. Só uma estimativa por
// baixo: o laço principal continua conferindo cada candidata, então errar para menos é seguro
// (rende algumas voltas a mais) e errar para mais nunca acontece porque arredondamos para baixo.
function passosAteJanela(inicio: Date, janelaInicio: Date, regra: RegraRecorrencia): number {
	const MS_DIA = 86400000;
	const diasDeDiferenca = Math.floor((janelaInicio.getTime() - inicio.getTime()) / MS_DIA);
	if (diasDeDiferenca <= 0) return 0;

	switch (regra.frequencia) {
		case "DAILY":
			return Math.max(0, Math.floor(diasDeDiferenca / regra.intervalo) - 1);
		case "WEEKLY":
			return Math.max(0, Math.floor(diasDeDiferenca / (7 * regra.intervalo)) - 1);
		case "MONTHLY": {
			const meses =
				(janelaInicio.getFullYear() - inicio.getFullYear()) * 12 + (janelaInicio.getMonth() - inicio.getMonth());
			return Math.max(0, Math.floor(meses / regra.intervalo) - 1);
		}
		case "YEARLY": {
			const anos = janelaInicio.getFullYear() - inicio.getFullYear();
			return Math.max(0, Math.floor(anos / regra.intervalo) - 1);
		}
	}
}

// N-ésimo dia-da-semana de um mês. Ordinal negativo conta do fim (-1 = último).
function diaSemanaDoMes(ano: number, mes: number, diaSemana: number, ordinal: number): Date | null {
	if (ordinal > 0) {
		const primeiro = new Date(ano, mes, 1);
		const deslocamento = (diaSemana - primeiro.getDay() + 7) % 7;
		const dia = 1 + deslocamento + (ordinal - 1) * 7;
		const ultimoDia = new Date(ano, mes + 1, 0).getDate();
		return dia > ultimoDia ? null : new Date(ano, mes, dia);
	}
	const ultimo = new Date(ano, mes + 1, 0);
	const deslocamento = (ultimo.getDay() - diaSemana + 7) % 7;
	const dia = ultimo.getDate() - deslocamento + (ordinal + 1) * 7;
	return dia < 1 ? null : new Date(ano, mes, dia);
}

// Dia do mês, aceitando negativo (-1 = último dia). Devolve null quando o mês não tem esse dia.
function diaDoMes(ano: number, mes: number, dia: number): Date | null {
	const ultimoDia = new Date(ano, mes + 1, 0).getDate();
	if (dia > 0) return dia > ultimoDia ? null : new Date(ano, mes, dia);
	const real = ultimoDia + dia + 1;
	return real < 1 ? null : new Date(ano, mes, real);
}

// ---------- Leitura do arquivo ----------

export function lerIcs(texto: string): EventoIcs[] {
	const eventos: EventoIcs[] = [];
	let atual: Partial<EventoIcs> & { excecoes?: Set<string> } | null = null;
	// VEVENT também aparece aninhado dentro de VTIMEZONE? Não — mas DAYLIGHT/STANDARD sim, e eles
	// carregam DTSTART/RRULE próprios. Ignoramos tudo dentro de VTIMEZONE pra não confundi-los com eventos.
	let dentroDeTimezone = false;

	for (const linha of desdobrarLinhas(texto)) {
		const lida = lerLinha(linha);
		if (!lida) continue;

		if (lida.nome === "BEGIN") {
			if (lida.valor === "VTIMEZONE") dentroDeTimezone = true;
			else if (lida.valor === "VEVENT" && !dentroDeTimezone) {
				atual = { excecoes: new Set<string>(), substituiData: null };
			}
			continue;
		}

		if (lida.nome === "END") {
			if (lida.valor === "VTIMEZONE") dentroDeTimezone = false;
			else if (lida.valor === "VEVENT" && atual) {
				if (atual.inicio && atual.titulo !== undefined) {
					eventos.push({
						uid: atual.uid ?? `${atual.titulo}-${chaveData(atual.inicio)}`,
						titulo: atual.titulo || "(sem título)",
						descricao: atual.descricao ?? null,
						local: atual.local ?? null,
						inicio: atual.inicio,
						fim: atual.fim ?? null,
						recorrencia: atual.recorrencia ?? null,
						excecoes: atual.excecoes ?? new Set<string>(),
						substituiData: atual.substituiData ?? null,
					});
				}
				atual = null;
			}
			continue;
		}

		if (!atual || dentroDeTimezone) continue;

		switch (lida.nome) {
			case "UID":
				atual.uid = lida.valor;
				break;
			case "SUMMARY":
				atual.titulo = desescaparTexto(lida.valor);
				break;
			case "DESCRIPTION": {
				const texto = desescaparTexto(lida.valor).trim();
				atual.descricao = texto.length > 0 ? texto : null;
				break;
			}
			case "LOCATION": {
				const texto = desescaparTexto(lida.valor).trim();
				atual.local = texto.length > 0 ? texto : null;
				break;
			}
			case "DTSTART": {
				const momento = lerMomento(lida.valor, lida.parametros);
				if (momento) atual.inicio = momento;
				break;
			}
			case "DTEND": {
				const momento = lerMomento(lida.valor, lida.parametros);
				if (momento) atual.fim = momento;
				break;
			}
			case "RRULE":
				atual.recorrencia = lerRegraRecorrencia(lida.valor);
				break;
			case "EXDATE": {
				// EXDATE pode listar várias datas separadas por vírgula na mesma linha.
				for (const parte of lida.valor.split(",")) {
					const momento = lerMomento(parte, lida.parametros);
					if (momento) atual.excecoes?.add(chaveData(momento));
				}
				break;
			}
			case "RECURRENCE-ID": {
				const momento = lerMomento(lida.valor, lida.parametros);
				if (momento) atual.substituiData = chaveData(momento);
				break;
			}
		}
	}

	return eventos;
}

// ---------- Expansão para a janela visível ----------

export interface OcorrenciaEvento {
	uid: string;
	titulo: string;
	descricao: string | null;
	local: string | null;
	data: string;
	horario: string | null;
	horarioFim: string | null;
	diaInteiro: boolean;
}

// Expande todos os eventos de um .ics para as ocorrências que caem em [inicio, fim].
//
// A ordem importa: primeiro separamos os VEVENTs que são REMARCAÇÕES (têm RECURRENCE-ID) dos que
// definem séries. Ao gerar a série, uma ocorrência é suprimida se estiver em EXDATE (cancelada) ou
// se existir uma remarcação para aquela data — nesse caso a remarcação entra no lugar, na data/hora
// nova dela.
export function expandirEventos(eventos: EventoIcs[], inicioBruto: Date, fimBruto: Date): OcorrenciaEvento[] {
	// A janela é pedida em DIAS ("de 1 a 31 de julho"), mas chega como Date — e um Date de dia sem
	// hora é meia-noite, o que deixaria de fora todo evento com horário no último dia. Esticamos a
	// janela para cobrir os dois dias inteiros.
	const inicio = new Date(inicioBruto.getFullYear(), inicioBruto.getMonth(), inicioBruto.getDate(), 0, 0, 0, 0);
	const fim = new Date(fimBruto.getFullYear(), fimBruto.getMonth(), fimBruto.getDate(), 23, 59, 59, 999);

	const remarcacoesPorUid = new Map<string, Map<string, EventoIcs>>();
	for (const evento of eventos) {
		if (!evento.substituiData) continue;
		let porData = remarcacoesPorUid.get(evento.uid);
		if (!porData) {
			porData = new Map();
			remarcacoesPorUid.set(evento.uid, porData);
		}
		porData.set(evento.substituiData, evento);
	}

	const resultado: OcorrenciaEvento[] = [];

	const duracaoMinutos = (evento: EventoIcs): number | null => {
		if (!evento.fim || evento.inicio.diaInteiro) return null;
		const ms = paraDate(evento.fim).getTime() - paraDate(evento.inicio).getTime();
		return ms > 0 ? Math.round(ms / 60000) : null;
	};

	const montar = (evento: EventoIcs, momento: MomentoLocal): OcorrenciaEvento => {
		const minutos = duracaoMinutos(evento);
		let horarioFim: string | null = null;
		if (minutos !== null && !momento.diaInteiro) {
			const fimDate = new Date(paraDate(momento).getTime() + minutos * 60000);
			horarioFim = `${String(fimDate.getHours()).padStart(2, "0")}:${String(fimDate.getMinutes()).padStart(2, "0")}`;
		}
		return {
			uid: evento.uid,
			titulo: evento.titulo,
			descricao: evento.descricao,
			local: evento.local,
			data: chaveData(momento),
			horario: chaveHorario(momento),
			horarioFim,
			diaInteiro: momento.diaInteiro,
		};
	};

	for (const evento of eventos) {
		// Remarcações são desenhadas ao processar a série de mesmo UID, não sozinhas — senão o evento
		// remarcado apareceria duas vezes quando a série também estivesse no arquivo.
		if (evento.substituiData) {
			const temSerie = eventos.some((e) => e.uid === evento.uid && !e.substituiData);
			if (temSerie) continue;
			// Remarcação órfã (série fora do arquivo): desenha sozinha, senão sumiria.
			const d = paraDate(evento.inicio);
			if (d >= inicio && d <= fim) resultado.push(montar(evento, evento.inicio));
			continue;
		}

		const remarcacoes = remarcacoesPorUid.get(evento.uid);

		for (const momento of gerarOcorrencias(evento, inicio, fim)) {
			const chave = chaveData(momento);
			if (evento.excecoes.has(chave)) continue;

			const remarcacao = remarcacoes?.get(chave);
			if (remarcacao) continue; // entra abaixo, na data/hora nova

			resultado.push(montar(evento, momento));
		}

		// Remarcações desta série cujo NOVO horário cai na janela (a data original podia estar fora).
		if (remarcacoes) {
			for (const remarcacao of remarcacoes.values()) {
				const d = paraDate(remarcacao.inicio);
				if (d >= inicio && d <= fim) resultado.push(montar(remarcacao, remarcacao.inicio));
			}
		}
	}

	return resultado;
}
