import { App, setIcon } from "obsidian";
import {
	CondicaoFiltro,
	ConfiguracoesGestorTarefas,
	ID_STATUS,
	Tarefa,
	TipoAgrupamento,
	emPeriodoDeAviso,
	estaNoInbox,
	obterFiltroSalvo,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ModalNovaTarefa } from "./modal-nova-tarefa";
import { ID_DATA, ID_DATA_ENTRADA, desenharCartaoTarefa } from "./render-tarefa";
import { agruparTarefas } from "./motor-agrupamento";
import { compilarFiltro } from "./motor-filtro";
import { SeletorFiltroSalvo } from "./seletor-filtro-salvo";
import { SeletorAgrupamento } from "./seletor-agrupamento";

export interface OpcoesMotorLista {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfiguracoesGestorTarefas;
	filtro?: (tarefa: Tarefa) => boolean;
	agrupamentoInicial?: TipoAgrupamento;
	// Filtro salvo pré-selecionado ao abrir (ex: filtro padrão configurado em Configurações, ou o filtro
	// móvel padrão de uma Visualização salva — nesse caso deve ser um dos IDs presentes em filtrosExtrasIds).
	filtroInicialId?: string | null;
	arrastavel?: boolean;
	permitirTrocaAgrupamento?: boolean;
	permitirEdicaoFiltro?: boolean;
	permitirCriarTarefa?: boolean;
	mostrarToggleInbox?: boolean;
	// Empurra os controles do cabeçalho (Filtro + Nova tarefa) para a direita — usado nos embeds em nota,
	// que não têm toggle Inbox nem título à esquerda, então sem isso os controles ficariam colados à esquerda.
	alinharControlesADireita?: boolean;
	// Restringe o SeletorFiltroSalvo do cabeçalho a só estes IDs (usado no embed, "filtro móvel" da visualização).
	// Sem isso, o seletor mostra todos os Filtros salvos (comportamento da Lista/Kanban geral).
	filtrosExtrasIds?: string[];
}

export class MotorLista {
	private agrupamento: TipoAgrupamento;
	private condicoesFiltro: CondicaoFiltro[] = [];
	private filtroSalvoId: string | null = null;
	private areaCorpo: HTMLElement | null = null;
	private modo: "tarefas" | "inbox" = "tarefas";

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesMotorLista) {
		this.agrupamento = opcoes.agrupamentoInicial ?? "nenhum";

		const filtroInicial = opcoes.filtroInicialId ? obterFiltroSalvo(opcoes.configuracoes, opcoes.filtroInicialId) : undefined;
		if (filtroInicial) {
			this.filtroSalvoId = filtroInicial.id;
			this.condicoesFiltro = filtroInicial.condicoes.map((c) => ({ ...c, valores: [...c.valores] }));
		}
	}

	renderizar(): void {
		this.containerEl.empty();
		this.containerEl.addClass("mytasks-container");

		this.desenharCabecalho();
		this.areaCorpo = this.containerEl.createDiv({ cls: "mytasks-lista-corpo" });
		this.renderizarCorpo();
	}

	destruir(): void {}

	private tarefasFiltradas(): Tarefa[] {
		const todas = this.opcoes.repositorio.listarTarefas();
		const base = todas.filter((t) => (this.opcoes.filtro ? this.opcoes.filtro(t) : true));

		if (!this.opcoes.mostrarToggleInbox) {
			const filtroInterativo = compilarFiltro(this.condicoesFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
			return base.filter(filtroInterativo);
		}

		const porModo = base.filter((t) =>
			this.modo === "inbox" ? estaNoInbox(t, this.opcoes.configuracoes) : !estaNoInbox(t, this.opcoes.configuracoes)
		);

		// O Inbox não tem UI de filtro (é uma caixa de entrada simples) — o filtro interativo/padrão só
		// se aplica ao modo Tarefas, senão qualquer Filtro padrão configurado vazaria pro Inbox por baixo
		// dos panos e poderia esconder tarefas recém-criadas sem nenhum aviso na tela.
		if (this.modo === "inbox") return porModo;

		const filtroInterativo = compilarFiltro(this.condicoesFiltro, this.opcoes.app, null, this.opcoes.configuracoes);
		return porModo.filter(filtroInterativo);
	}

	private propriedadesVisiveisAtuais(): string[] | null {
		const { listaPropriedadesVisiveis, listaInboxPropriedadesVisiveis } = this.opcoes.configuracoes;
		return this.modo === "inbox" ? listaInboxPropriedadesVisiveis : listaPropriedadesVisiveis;
	}

	private propriedadesMeta() {
		const propriedadesVisiveis = this.propriedadesVisiveisAtuais();
		const { propriedades } = this.opcoes.configuracoes;
		return propriedadesVisiveis ? propriedades.filter((p) => propriedadesVisiveis.includes(p.id)) : propriedades;
	}

	private agrupamentoEfetivo(): TipoAgrupamento {
		return this.modo === "inbox" ? "nenhum" : this.agrupamento;
	}

	private ocultarNaMeta(): string[] {
		const propriedadesVisiveis = this.propriedadesVisiveisAtuais();
		const ocultarDataEntrada = propriedadesVisiveis !== null && !propriedadesVisiveis.includes(ID_DATA_ENTRADA);
		const ocultarStatus = propriedadesVisiveis !== null && !propriedadesVisiveis.includes(ID_STATUS);
		const agrupamento = this.agrupamentoEfetivo();
		const base = agrupamento !== "nenhum" ? [agrupamento] : [];
		if (agrupamento === "dia") base.push(ID_DATA);
		if (ocultarDataEntrada) base.push(ID_DATA_ENTRADA);
		if (ocultarStatus) base.push(ID_STATUS);
		return base;
	}

	private ordenar(tarefas: Tarefa[]): Tarefa[] {
		const hoje = new Date();
		return [...tarefas].sort((a, b) => {
			const avisoA = emPeriodoDeAviso(a, hoje) ? 0 : 1;
			const avisoB = emPeriodoDeAviso(b, hoje) ? 0 : 1;
			if (avisoA !== avisoB) return avisoA - avisoB;
			if (!a.data && !b.data) return 0;
			if (!a.data) return 1;
			if (!b.data) return -1;
			return a.data.localeCompare(b.data);
		});
	}

	private renderizarCorpo(): void {
		if (!this.areaCorpo) return;
		this.areaCorpo.empty();

		const tarefas = this.tarefasFiltradas();
		if (tarefas.length === 0) {
			this.areaCorpo.createEl("p", {
				text: "Nenhuma tarefa encontrada.",
				cls: "mytasks-vazio",
			});
			return;
		}

		const agrupamentoEfetivo = this.agrupamentoEfetivo();
		const grupos = agruparTarefas(tarefas, agrupamentoEfetivo, this.opcoes.configuracoes);
		const areaLista = this.areaCorpo.createDiv({ cls: "mytasks-lista-area" });

		for (const grupo of grupos) {
			if (grupo.tarefas.length === 0) continue;
			if (agrupamentoEfetivo !== "nenhum") {
				const cabecalhoGrupo = areaLista.createDiv({ cls: "mytasks-lista-cabecalho-grupo" });
				cabecalhoGrupo.createEl("span", { text: grupo.rotulo });
				if (grupo.cor) cabecalhoGrupo.style.setProperty("--mytasks-cor-grupo", grupo.cor);
			}
			const lista = areaLista.createDiv({ cls: "mytasks-lista" });
			for (const tarefa of this.ordenar(grupo.tarefas)) {
				desenharCartaoTarefa(lista, this.opcoes.app, this.opcoes.repositorio, this.opcoes.configuracoes, tarefa, {
					arrastavel: this.modo === "inbox" ? true : this.opcoes.arrastavel ?? false,
					propriedadesMeta: this.propriedadesMeta(),
					ocultarNaMeta: this.ocultarNaMeta(),
					aoAtualizar: () => this.renderizar(),
				});
			}
		}
	}

	private desenharCabecalho(): void {
		const cabecalho = this.containerEl.createDiv({ cls: "mytasks-cabecalho" });
		if (this.opcoes.alinharControlesADireita) cabecalho.addClass("mytasks-cabecalho-a-direita");

		if (this.opcoes.mostrarToggleInbox) {
			const toggle = cabecalho.createDiv({ cls: "mytasks-toggle-inbox" });
			const botaoInbox = toggle.createEl("button", { attr: { "aria-label": "Inbox" } });
			setIcon(botaoInbox, "inbox");
			const botaoTarefas = toggle.createEl("button", { text: "Tarefas" });
			botaoInbox.toggleClass("mytasks-toggle-ativo", this.modo === "inbox");
			botaoTarefas.toggleClass("mytasks-toggle-ativo", this.modo === "tarefas");
			botaoInbox.addEventListener("click", () => {
				this.modo = "inbox";
				this.renderizar();
			});
			botaoTarefas.addEventListener("click", () => {
				this.modo = "tarefas";
				this.renderizar();
			});
		}

		if (this.modo === "inbox") {
			if (this.opcoes.permitirCriarTarefa !== false) {
				const linhaCaptura = this.containerEl.createDiv({ cls: "mytasks-cabecalho" });
				this.desenharCapturaRapida(linhaCaptura);
			}
			return;
		}

		if (this.opcoes.permitirTrocaAgrupamento !== false) {
			new SeletorAgrupamento(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				agrupamentoAtual: this.agrupamento,
				permitirNenhum: true,
				permitirDia: true,
				elementoAlinhamento: cabecalho,
				aoEscolher: (agrupamento) => {
					this.agrupamento = agrupamento;
					this.renderizarCorpo();
				},
			});
		}

		const filtroMovelVazio = this.opcoes.filtrosExtrasIds && this.opcoes.filtrosExtrasIds.length === 0;
		if (this.opcoes.permitirEdicaoFiltro !== false && !filtroMovelVazio) {
			new SeletorFiltroSalvo(cabecalho, {
				configuracoes: this.opcoes.configuracoes,
				filtroAtualId: this.filtroSalvoId,
				restringirAIds: this.opcoes.filtrosExtrasIds,
				elementoAlinhamento: cabecalho,
				aoEscolher: (filtroId, condicoes) => {
					this.filtroSalvoId = filtroId;
					this.condicoesFiltro = condicoes;
					this.renderizarCorpo();
				},
			});
		}

		if (this.opcoes.permitirCriarTarefa !== false) {
			const botaoNova = cabecalho.createEl("button", {
				cls: "mytasks-botao-nova-tarefa mytasks-seletor-discreto mytasks-seletor-so-icone",
				attr: { "aria-label": "Nova tarefa" },
			});
			const iconeNova = botaoNova.createSpan({ cls: "mytasks-seletor-discreto-icone" });
			setIcon(iconeNova, "square-plus");
			botaoNova.addEventListener("click", () => {
				new ModalNovaTarefa(this.opcoes.app, this.opcoes.configuracoes, this.opcoes.repositorio, async (titulo, dados) => {
					await this.opcoes.repositorio.criarTarefa(titulo, dados);
					this.renderizar();
				}).open();
			});
		}
	}

	private desenharCapturaRapida(container: HTMLElement): void {
		const input = container.createEl("input", {
			type: "text",
			placeholder: "Adicionar ao Inbox...",
			cls: "mytasks-captura-rapida",
		});
		input.addEventListener("keydown", async (evento) => {
			if (evento.key !== "Enter") return;
			const titulo = input.value.trim();
			if (!titulo) return;
			await this.opcoes.repositorio.criarTarefaRapida(titulo);
			input.value = "";
			this.renderizarCorpo();
		});
	}
}
