import { requestUrl } from "obsidian";
import {
	CacheCalendarioExterno,
	CalendarioExterno,
	ConfiguracoesGestorTarefas,
	EventoExterno,
} from "./tipos";
import { expandirEventos, lerIcs } from "./ics";

// Busca, cacheia e expande as agendas externas (.ics do Google). Só leitura — nada aqui escreve na
// agenda da usuária; o plugin apenas desenha o que baixou.
//
// As AGENDAS são cadastradas por grupo de tarefas (cada grupo é um contexto de trabalho próprio),
// mas o CACHE do conteúdo baixado é global e indexado por id de agenda: é dado derivado, e mantê-lo
// num lugar só evita baixar duas vezes a mesma URL se dois grupos assinarem a mesma agenda.
//
// O cache vive no data.json para o calendário continuar mostrando os compromissos offline. O
// conteúdo BRUTO do .ics é o que fica guardado, não as ocorrências já expandidas: assim uma correção
// no parser passa a valer para o que já estava em cache, e a janela visível (que muda a cada
// navegação de mês) pode ser recalculada sem nova busca.

export interface DependenciasCalendariosExternos {
	configuracoes: () => ConfiguracoesGestorTarefas;
	salvar: () => Promise<void>;
	// Chamado depois de uma atualização que mudou algo, para as views se redesenharem.
	aoAtualizar: () => void;
}

export class ServicoCalendariosExternos {
	// Evita buscas simultâneas do mesmo calendário (ex: duas views abrindo ao mesmo tempo).
	private buscasEmAndamento = new Set<string>();

	constructor(private deps: DependenciasCalendariosExternos) {}

	private cacheDe(calendarioId: string): CacheCalendarioExterno | undefined {
		return this.deps.configuracoes().cacheCalendariosExternos.find((c) => c.calendarioId === calendarioId);
	}

	// O endereço secreto do Google costuma ser colado como `webcal://` (protocolo que abre o app de
	// calendário do sistema). Para buscar por HTTP é o mesmo endereço em `https://`.
	private normalizarUrl(url: string): string {
		const limpa = url.trim();
		if (limpa.startsWith("webcal://")) return `https://${limpa.slice("webcal://".length)}`;
		return limpa;
	}

	private async gravarCache(calendarioId: string, campos: Partial<CacheCalendarioExterno>): Promise<void> {
		const config = this.deps.configuracoes();
		const existente = config.cacheCalendariosExternos.find((c) => c.calendarioId === calendarioId);
		if (existente) {
			Object.assign(existente, campos);
		} else {
			config.cacheCalendariosExternos.push({
				calendarioId,
				buscadoEm: 0,
				conteudo: "",
				erro: null,
				...campos,
			});
		}
		await this.deps.salvar();
	}

	// Busca UM calendário. Em caso de erro, registra a mensagem no cache mas PRESERVA o conteúdo
	// baixado antes — uma falha de rede não deve esvaziar o calendário da usuária.
	async atualizarCalendario(calendario: CalendarioExterno): Promise<boolean> {
		if (this.buscasEmAndamento.has(calendario.id)) return false;
		this.buscasEmAndamento.add(calendario.id);
		try {
			// requestUrl (e não fetch) porque só ele escapa do CORS do Electron — o Google não manda
			// cabeçalho de CORS no .ics, então um fetch direto seria bloqueado.
			const resposta = await requestUrl({ url: this.normalizarUrl(calendario.url), method: "GET" });
			const texto = resposta.text ?? "";
			if (!texto.includes("BEGIN:VCALENDAR")) {
				await this.gravarCache(calendario.id, {
					erro: "A resposta não parece um arquivo de calendário (.ics). Confira se a URL é o endereço secreto em formato iCal.",
				});
				return false;
			}
			await this.gravarCache(calendario.id, {
				conteudo: texto,
				buscadoEm: Date.now(),
				erro: null,
			});
			return true;
		} catch (erro) {
			const mensagem = erro instanceof Error ? erro.message : String(erro);
			await this.gravarCache(calendario.id, { erro: mensagem });
			return false;
		} finally {
			this.buscasEmAndamento.delete(calendario.id);
		}
	}

	// Todas as agendas cadastradas, de todos os grupos, deduplicadas por id. Usada pela atualização
	// periódica, que busca uma vez só e serve a todos os grupos que assinam aquela agenda.
	private todasAsAgendas(): CalendarioExterno[] {
		const porId = new Map<string, CalendarioExterno>();
		for (const grupo of this.deps.configuracoes().grupos) {
			for (const calendario of grupo.calendariosExternos ?? []) {
				if (!porId.has(calendario.id)) porId.set(calendario.id, calendario);
			}
		}
		return [...porId.values()];
	}

	// Atualiza os calendários ativos cujo cache está mais velho que o intervalo configurado.
	// `forcar` ignora a idade do cache (é o botão "atualizar agora").
	async atualizarTodos(forcar = false): Promise<void> {
		const config = this.deps.configuracoes();
		const intervaloMs = Math.max(1, config.intervaloAtualizacaoMin) * 60 * 1000;
		const agora = Date.now();

		const aBuscar = this.todasAsAgendas().filter((cal) => {
			if (!cal.ativo || !cal.url.trim()) return false;
			if (forcar) return true;
			const cache = this.cacheDe(cal.id);
			return !cache || agora - cache.buscadoEm >= intervaloMs;
		});
		if (aBuscar.length === 0) return;

		const resultados = await Promise.all(aBuscar.map((cal) => this.atualizarCalendario(cal)));
		if (resultados.some(Boolean)) this.deps.aoAtualizar();
	}


	// Eventos das agendas DESTE grupo que caem na janela [inicio, fim], já normalizados.
	// Puramente síncrono: lê do cache. Quem desenha nunca espera rede.
	eventosNaJanela(grupoId: string, inicio: Date, fim: Date): EventoExterno[] {
		const grupo = this.deps.configuracoes().grupos.find((g) => g.id === grupoId);
		if (!grupo || !grupo.mostrarEventosExternos) return [];

		const resultado: EventoExterno[] = [];
		for (const calendario of grupo.calendariosExternos ?? []) {
			if (!calendario.ativo) continue;
			const cache = this.cacheDe(calendario.id);
			if (!cache || !cache.conteudo) continue;

			let ocorrencias;
			try {
				ocorrencias = expandirEventos(lerIcs(cache.conteudo), inicio, fim);
			} catch {
				// Um .ics malformado não pode derrubar o calendário inteiro: essa agenda simplesmente
				// não rende eventos, e as outras seguem normalmente.
				continue;
			}

			for (const ocorrencia of ocorrencias) {
				resultado.push({
					id: `${calendario.id}:${ocorrencia.uid}:${ocorrencia.data}:${ocorrencia.horario ?? "dia"}`,
					calendarioId: calendario.id,
					calendarioNome: calendario.nome,
					cor: calendario.cor,
					titulo: ocorrencia.titulo,
					descricao: ocorrencia.descricao,
					local: ocorrencia.local,
					data: ocorrencia.data,
					horario: ocorrencia.horario,
					horarioFim: ocorrencia.horarioFim,
					diaInteiro: ocorrencia.diaInteiro,
				});
			}
		}
		return resultado;
	}

	// Descarta o cache de um calendário removido, para o data.json não acumular lixo. Não apaga se
	// outro grupo ainda assina a mesma agenda — o cache é compartilhado por id.
	async removerCache(calendarioId: string): Promise<void> {
		const config = this.deps.configuracoes();
		const aindaEmUso = config.grupos.some((g) => (g.calendariosExternos ?? []).some((c) => c.id === calendarioId));
		if (aindaEmUso) return;

		const i = config.cacheCalendariosExternos.findIndex((c) => c.calendarioId === calendarioId);
		if (i === -1) return;
		config.cacheCalendariosExternos.splice(i, 1);
		await this.deps.salvar();
	}

	statusDe(calendarioId: string): { buscadoEm: number; erro: string | null } | null {
		const cache = this.cacheDe(calendarioId);
		return cache ? { buscadoEm: cache.buscadoEm, erro: cache.erro } : null;
	}
}

// Ordena eventos e tarefas de um mesmo dia por horário, com quem não tem horário no fim. É o que faz
// a célula do mês parecer uma agenda (11:00, 13:00, 13:00) em vez de uma pilha sem ordem.
export function compararPorHorario(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return a.localeCompare(b);
}
