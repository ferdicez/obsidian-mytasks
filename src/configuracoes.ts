import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type MyTasksPlugin from "./main";
import {
	ConfigEfetivaGrupo,
	EspessuraCheckbox,
	EstiloDestaque,
	FiltroSalvo,
	GRUPO_PADRAO,
	GrupoTarefas,
	ID_STATUS,
	ModoCalendario,
	OpcaoSelecao,
	PropriedadeDefinida,
	ROTULOS_ESPESSURA,
	ROTULOS_ESTILO_DESTAQUE,
	ROTULOS_MODO,
	TipoAgrupamento,
	VisualizacaoSalva,
	configDoGrupo,
	grupoAtivoOuPrimeiro,
	normalizarChave,
} from "./tipos";
import { ModalEditarGrupo } from "./modal-editar-grupo";
import { ModalEditarPropriedade } from "./modal-editar-propriedade";
import { ListaOpcoesGerenciada } from "./lista-opcoes-gerenciada";
import { ModalEditarVisualizacaoSalva } from "./modal-editar-visualizacao-salva";
import { ModalEditarFiltroSalvo } from "./modal-editar-filtro-salvo";
import { opcoesDeAgrupamento, rotuloAgrupamento } from "./seletor-agrupamento";
import { contarReferenciasView } from "./localizador-referencias";
import { ID_DATA_ENTRADA } from "./render-tarefa";

type PaginaConfig = "geral" | "calendario" | "kanban" | "tarefas" | "filtros";

const PAGINAS: { id: PaginaConfig; rotulo: string }[] = [
	{ id: "geral", rotulo: "Geral" },
	{ id: "calendario", rotulo: "Calendário" },
	{ id: "kanban", rotulo: "Kanban" },
	{ id: "tarefas", rotulo: "Tarefas" },
	{ id: "filtros", rotulo: "Filtros" },
];

const MODOS_CALENDARIO: ModoCalendario[] = ["mes", "semana-horarios", "semana-kanban", "ano"];

export class AbaConfiguracoes extends PluginSettingTab {
	private paginaAtual: PaginaConfig = "geral";
	// Grupo cuja configuração está sendo editada. Nesta fase é sempre o primeiro grupo; a Fase 5 adiciona a
	// tela de seleção de grupo na frente. As 5 páginas de config leem/gravam sempre em `this.grupo.*`.
	private grupoSelecionadoId: string | null = null;

	constructor(app: App, private plugin: MyTasksPlugin) {
		super(app, plugin);
	}

	private get grupo(): GrupoTarefas {
		return grupoAtivoOuPrimeiro(this.plugin.configuracoes, this.grupoSelecionadoId);
	}

	private get configEfetiva(): ConfigEfetivaGrupo {
		return configDoGrupo(this.plugin.configuracoes, this.grupo);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "My Tasks — Configurações" });

		// Sem grupo selecionado para edição: mostra a tela de grupos (discriminador global + lista de grupos).
		// Ao entrar num grupo, mostra as 5 páginas de sempre, escopadas a ele.
		if (this.grupoSelecionadoId === null) {
			this.renderizarTelaGrupos(containerEl);
			return;
		}

		// Breadcrumb de volta para a lista de grupos + nome do grupo em edição.
		const cabecalhoGrupo = containerEl.createDiv({ cls: "mytasks-config-cabecalho-grupo" });
		const voltar = cabecalhoGrupo.createEl("button", { cls: "mytasks-config-voltar-grupos" });
		setIcon(voltar.createSpan(), "chevron-left");
		voltar.createSpan({ text: "Grupos" });
		voltar.addEventListener("click", () => {
			this.grupoSelecionadoId = null;
			this.display();
		});
		cabecalhoGrupo.createEl("span", { text: this.grupo.nome, cls: "mytasks-config-nome-grupo" });

		this.renderizarAbasPagina(containerEl);

		const corpo = containerEl.createDiv();
		if (this.paginaAtual === "geral") this.renderizarPaginaGeral(corpo);
		else if (this.paginaAtual === "calendario") this.renderizarPaginaCalendario(corpo);
		else if (this.paginaAtual === "kanban") this.renderizarPaginaKanban(corpo);
		else if (this.paginaAtual === "tarefas") this.renderizarPaginaTarefas(corpo);
		else this.renderizarPaginaFiltros(corpo);
	}

	// Tela inicial: define a propriedade discriminadora global e lista/gerencia os grupos de tarefas.
	private renderizarTelaGrupos(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Grupos de tarefas" });
		containerEl.createEl("p", {
			text: "Cada grupo é uma configuração independente (pasta, status, propriedades, visualizações). Uma tarefa pertence ao grupo cujo valor bate com a propriedade abaixo.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Propriedade que define o grupo")
			.setDesc(
				"Chave de frontmatter usada para separar os grupos (ex: grupo). Deixe em branco para usar um só grupo. Trocar depois exige repreencher essa propriedade nas notas."
			)
			.addText((text) =>
				text
					.setPlaceholder("grupo")
					.setValue(this.plugin.configuracoes.propriedadeGrupo ?? "")
					.onChange(async (valor) => {
						const limpo = valor.trim();
						this.plugin.configuracoes.propriedadeGrupo = limpo ? normalizarChave(limpo) : null;
						await this.plugin.salvarConfiguracoes();
					})
			);

		containerEl.createEl("hr", { cls: "mytasks-config-divisoria" });

		for (const grupo of this.plugin.configuracoes.grupos) {
			const linha = new Setting(containerEl).setName(grupo.nome);
			const desc = grupo.valorDiscriminador
				? `valor: ${grupo.valorDiscriminador}`
				: "sem valor (grupo padrão)";
			linha.setDesc(desc);

			// Preview do ícone.
			const preview = linha.nameEl.createSpan({ cls: "mytasks-config-grupo-icone" });
			setIcon(preview, grupo.icone);

			linha.addButton((btn) =>
				btn
					.setIcon("settings")
					.setTooltip("Configurar este grupo")
					.onClick(() => {
						this.grupoSelecionadoId = grupo.id;
						this.paginaAtual = "geral";
						this.display();
					})
			);
			linha.addButton((btn) =>
				btn
					.setIcon("copy")
					.setTooltip("Duplicar")
					.onClick(async () => {
						const copia: GrupoTarefas = JSON.parse(JSON.stringify(grupo));
						copia.id = `grupo_${Date.now()}`;
						copia.nome = `${grupo.nome} (cópia)`;
						this.plugin.configuracoes.grupos.push(copia);
						await this.plugin.salvarConfiguracoes();
						this.plugin.registrarRibbonsDeGrupos();
						this.display();
					})
			);
			// Não deixa excluir o último grupo (sempre precisa de pelo menos um).
			if (this.plugin.configuracoes.grupos.length > 1) {
				linha.addButton((btn) =>
					btn
						.setIcon("trash-2")
						.setTooltip("Excluir")
						.onClick(async () => {
							this.plugin.configuracoes.grupos = this.plugin.configuracoes.grupos.filter(
								(g) => g.id !== grupo.id
							);
							// Corrige grupos ativos órfãos.
							const primeiro = this.plugin.configuracoes.grupos[0];
							if (!this.plugin.configuracoes.grupos.some((g) => g.id === this.plugin.configuracoes.grupoAtivoKanbanId)) {
								this.plugin.configuracoes.grupoAtivoKanbanId = primeiro.id;
							}
							if (!this.plugin.configuracoes.grupos.some((g) => g.id === this.plugin.configuracoes.grupoAtivoCalendarioId)) {
								this.plugin.configuracoes.grupoAtivoCalendarioId = primeiro.id;
							}
							await this.plugin.salvarConfiguracoes();
							this.plugin.registrarRibbonsDeGrupos();
							this.display();
						})
				);
			}
		}

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Criar novo grupo de tarefas")
				.setCta()
				.onClick(() => {
					new ModalEditarGrupo(this.app, null, async (dados) => {
						const novo: GrupoTarefas = {
							...JSON.parse(JSON.stringify(GRUPO_PADRAO)),
							id: `grupo_${Date.now()}`,
							nome: dados.nome,
							valorDiscriminador: dados.valorDiscriminador,
							icone: dados.icone,
						};
						this.plugin.configuracoes.grupos.push(novo);
						await this.plugin.salvarConfiguracoes();
						this.plugin.registrarRibbonsDeGrupos();
						this.display();
					}).open();
				})
		);
	}

	private renderizarAbasPagina(container: HTMLElement): void {
		const barra = container.createDiv({ cls: "mytasks-config-abas" });
		for (const pagina of PAGINAS) {
			const botao = barra.createEl("button", { text: pagina.rotulo, cls: "mytasks-config-aba" });
			botao.toggleClass("mytasks-config-aba-ativa", this.paginaAtual === pagina.id);
			botao.addEventListener("click", () => {
				if (this.paginaAtual === pagina.id) return;
				this.paginaAtual = pagina.id;
				this.display();
			});
		}
	}

	private renderizarPaginaGeral(containerEl: HTMLElement): void {
		// Identidade do grupo (nome/valor do discriminador/ícone) — editável no mesmo modal de criação.
		new Setting(containerEl)
			.setName("Identidade do grupo")
			.setDesc("Nome, valor da propriedade que define o grupo e ícone da barra lateral.")
			.addButton((btn) =>
				btn
					.setButtonText("Editar")
					.onClick(() => {
						new ModalEditarGrupo(
							this.app,
							{ nome: this.grupo.nome, valorDiscriminador: this.grupo.valorDiscriminador, icone: this.grupo.icone },
							async (dados) => {
								this.grupo.nome = dados.nome;
								this.grupo.valorDiscriminador = dados.valorDiscriminador;
								this.grupo.icone = dados.icone;
								await this.plugin.salvarConfiguracoes();
								this.plugin.registrarRibbonsDeGrupos();
								this.display();
							}
						).open();
					})
			);

		containerEl.createEl("hr", { cls: "mytasks-config-divisoria" });

		new Setting(containerEl)
			.setName("Pasta das tarefas")
			.setDesc("Pasta do vault onde as notas-tarefa serão salvas.")
			.addText((text) =>
				text
					.setPlaceholder("Tarefas")
					.setValue(this.grupo.pastaTarefas)
					.onChange(async (valor) => {
						this.grupo.pastaTarefas = valor.trim() || "Tarefas";
						await this.plugin.salvarConfiguracoes();
					})
			);

		new Setting(containerEl)
			.setName("Mover tarefas concluídas para outra pasta")
			.setDesc("Ao marcar como concluída, o arquivo é movido para a pasta escolhida, em subpastas por mês (AAAA-MM).")
			.addToggle((toggle) =>
				toggle.setValue(this.grupo.moverConcluidas).onChange(async (valor) => {
					this.grupo.moverConcluidas = valor;
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
			);

		if (this.grupo.moverConcluidas) {
			new Setting(containerEl)
				.setName("Pasta das concluídas")
				.setDesc("Dentro dela, o plugin cria automaticamente subpastas como 2026-07.")
				.addText((text) =>
					text
						.setPlaceholder("Tarefas concluídas")
						.setValue(this.grupo.pastaConcluidas)
						.onChange(async (valor) => {
							this.grupo.pastaConcluidas = valor.trim();
							await this.plugin.salvarConfiguracoes();
						})
				);
		}

		new Setting(containerEl)
			.setName("Cor do aviso de prazo")
			.setDesc("Cor de fundo/borda usada quando a tarefa entra no período de 'avisar com antecedência'.")
			.addColorPicker((picker) =>
				picker.setValue(this.grupo.corAviso).onChange(async (valor) => {
					this.grupo.corAviso = valor;
					await this.plugin.salvarConfiguracoes();
				})
			);

		containerEl.createEl("hr", { cls: "mytasks-config-divisoria" });
		containerEl.createEl("h3", { text: "Status" });
		new Setting(containerEl)
			.setName("Nome do campo")
			.addText((text) =>
				text.setValue(this.grupo.status.rotulo).onChange(async (valor) => {
					this.grupo.status.rotulo = valor.trim() || "Status";
					await this.plugin.salvarConfiguracoes();
				})
			);

		new Setting(containerEl)
			.setName("Opções")
			.setDesc(
				"A primeira é o Inbox (tarefas sem data) e a última é tratada como 'concluído' (dispara recorrência) — essas duas posições são fixas, mas você pode renomear e trocar a cor de ambas. As opções do meio são livres: adicione, remova e reordene como quiser. Renomear uma opção (mantendo a posição) atualiza automaticamente as tarefas existentes."
			);

		const containerOpcoesStatus = containerEl.createDiv();
		new ListaOpcoesGerenciada(containerOpcoesStatus, this.grupo.status.opcoes, {
			estaEmUso: (valor) => this.plugin.repositorioDoGrupo(this.grupo.id).valoresDeStatusEmUso().includes(valor),
			aoRenomear: async (valorAntigo, valorNovo) => {
				await this.plugin.repositorioDoGrupo(this.grupo.id).migrarValoresStatus(new Map([[valorAntigo, valorNovo]]));
			},
			aoMudar: async (opcoes) => {
				this.grupo.status.opcoes = opcoes;
				await this.plugin.salvarConfiguracoes();
			},
			extremosFixos: true,
			descricaoPrimeira: "Inbox: reservado para tarefas sem data.",
			descricaoUltima: "Concluído: dispara a recorrência, se houver.",
		});

		this.renderizarDestaque(containerEl, ID_STATUS, () => this.grupo.status.opcoes);

		containerEl.createEl("hr", { cls: "mytasks-config-divisoria" });
		containerEl.createEl("h3", { text: "Data de conclusão" });
		new Setting(containerEl)
			.setName("Nome do campo")
			.setDesc(
				"É a data de vencimento (prazo) da tarefa — a mesma usada no calendário. Renomear aqui também renomeia a propriedade nas notas já criadas, automaticamente."
			)
			.addText((text) =>
				text.setValue(this.grupo.dataTarefa.rotulo).onChange(async (valor) => {
					const novoRotulo = valor.trim() || "Data";
					const chaveAntiga = this.grupo.dataTarefa.chave ?? "data";
					const chaveNova = normalizarChave(novoRotulo);

					this.grupo.dataTarefa.rotulo = novoRotulo;
					this.grupo.dataTarefa.chave = chaveNova;
					await this.plugin.salvarConfiguracoes();

					if (chaveNova !== chaveAntiga) {
						await this.plugin.repositorioDoGrupo(this.grupo.id).migrarChaveData(chaveAntiga, chaveNova);
					}
				})
			);

		containerEl.createEl("hr", { cls: "mytasks-config-divisoria" });
		containerEl.createEl("h3", { text: "Propriedades customizadas" });
		containerEl.createEl("p", {
			text: "Crie os campos que fizerem sentido para o seu fluxo (ex: Cliente, Projeto, Prioridade).",
			cls: "setting-item-description",
		});

		const listaPropriedades = containerEl.createDiv();
		this.renderizarListaPropriedades(listaPropriedades);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Nova propriedade")
				.setCta()
				.onClick(() => {
					new ModalEditarPropriedade(
						this.app,
						null,
						this.grupo.propriedades.length,
						async (propriedade) => {
							this.grupo.propriedades.push(propriedade);
							await this.plugin.salvarConfiguracoes();
							this.display();
						},
						this.plugin.repositorioDoGrupo(this.grupo.id)
					).open();
				})
		);

		containerEl.createEl("hr", { cls: "mytasks-config-divisoria" });
		containerEl.createEl("h3", { text: "Visualizações salvas" });
		containerEl.createEl("p", {
			text: "Crie visualizações reutilizáveis (filtro + agrupamento) para usar em abas ou embutir em notas.",
			cls: "setting-item-description",
		});

		const listaVisualizacoes = containerEl.createDiv();
		this.renderizarListaVisualizacoes(listaVisualizacoes);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Nova visualização")
				.setCta()
				.onClick(() => {
					new ModalEditarVisualizacaoSalva(
						this.app,
						null,
						this.configEfetiva,
						this.plugin.repositorioDoGrupo(this.grupo.id),
						async (visualizacao) => {
							this.grupo.visualizacoesSalvas.push(visualizacao);
							await this.plugin.salvarConfiguracoes();
							this.display();
						}
					).open();
				})
		);
	}

	private renderizarPaginaCalendario(containerEl: HTMLElement): void {
		this.renderizarFiltroPadrao(
			containerEl,
			"Filtro padrão",
			() => this.grupo.filtroPadraoCalendarioId,
			(id) => (this.grupo.filtroPadraoCalendarioId = id)
		);

		new Setting(containerEl)
			.setName("Mostrar detalhes nas tarefas do calendário")
			.setDesc("Exibe status e propriedades abaixo do título de cada tarefa nas visões de calendário.")
			.addToggle((toggle) =>
				toggle.setValue(this.grupo.calendarioMostrarDetalhes).onChange(async (valor) => {
					this.grupo.calendarioMostrarDetalhes = valor;
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
			);

		if (!this.grupo.calendarioMostrarDetalhes) return;

		for (const modo of MODOS_CALENDARIO) {
			containerEl.createEl("h3", { text: ROTULOS_MODO[modo] });
			this.renderizarPropriedadesVisiveis(
				containerEl,
				`Propriedades visíveis — ${ROTULOS_MODO[modo]}`,
				() => this.grupo.calendarioPropriedadesVisiveisPorModo[modo],
				(lista) => (this.grupo.calendarioPropriedadesVisiveisPorModo[modo] = lista),
				[ID_DATA_ENTRADA]
			);
		}
	}

	private renderizarPaginaKanban(containerEl: HTMLElement): void {
		this.renderizarAgrupamentoPadrao(
			containerEl,
			"Agrupamento padrão",
			false,
			false,
			() => this.grupo.agrupamentoPadraoKanban,
			(agrupamento) => (this.grupo.agrupamentoPadraoKanban = agrupamento)
		);
		this.renderizarFiltroPadrao(
			containerEl,
			"Filtro padrão",
			() => this.grupo.filtroPadraoKanbanId,
			(id) => (this.grupo.filtroPadraoKanbanId = id)
		);
		this.renderizarPropriedadesVisiveis(
			containerEl,
			"Propriedades visíveis no kanban",
			() => this.grupo.kanbanPropriedadesVisiveis,
			(lista) => (this.grupo.kanbanPropriedadesVisiveis = lista)
		);
	}

	private renderizarPaginaTarefas(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Lista de tarefas" });
		this.renderizarAgrupamentoPadrao(
			containerEl,
			"Agrupamento padrão",
			true,
			true,
			() => this.grupo.agrupamentoPadraoLista,
			(agrupamento) => (this.grupo.agrupamentoPadraoLista = agrupamento)
		);
		this.renderizarFiltroPadrao(
			containerEl,
			"Filtro padrão",
			() => this.grupo.filtroPadraoListaId,
			(id) => (this.grupo.filtroPadraoListaId = id)
		);
		this.renderizarPropriedadesVisiveis(
			containerEl,
			"Propriedades visíveis na lista",
			() => this.grupo.listaPropriedadesVisiveis,
			(lista) => (this.grupo.listaPropriedadesVisiveis = lista)
		);

		containerEl.createEl("h3", { text: "Inbox" });
		this.renderizarPropriedadesVisiveis(
			containerEl,
			"Propriedades visíveis no Inbox",
			() => this.grupo.listaInboxPropriedadesVisiveis,
			(lista) => (this.grupo.listaInboxPropriedadesVisiveis = lista)
		);
	}

	private renderizarAgrupamentoPadrao(
		container: HTMLElement,
		titulo: string,
		permitirNenhum: boolean,
		permitirDia: boolean,
		obterAtual: () => TipoAgrupamento,
		definir: (agrupamento: TipoAgrupamento) => void
	) {
		const opcoes = opcoesDeAgrupamento(this.configEfetiva, permitirNenhum, permitirDia);
		new Setting(container)
			.setName(titulo)
			.setDesc("Agrupamento com que esta tela abre sempre que você a acessa.")
			.addDropdown((dropdown) => {
				for (const opcao of opcoes) {
					dropdown.addOption(opcao, rotuloAgrupamento(opcao, this.configEfetiva));
				}
				dropdown.setValue(obterAtual()).onChange(async (valor) => {
					definir(valor);
					await this.plugin.salvarConfiguracoes();
				});
			});
	}

	private renderizarFiltroPadrao(
		container: HTMLElement,
		titulo: string,
		obterAtual: () => string | null,
		definir: (id: string | null) => void
	) {
		const { filtrosSalvos } = this.grupo;
		new Setting(container)
			.setName(titulo)
			.setDesc("Filtro salvo aplicado sempre que esta tela abre. Escolha entre os Filtros salvos (aba Filtros).")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "nenhum");
				for (const filtro of filtrosSalvos) {
					dropdown.addOption(filtro.id, filtro.nome);
				}
				dropdown.setValue(obterAtual() ?? "").onChange(async (valor) => {
					definir(valor || null);
					await this.plugin.salvarConfiguracoes();
				});
			});
	}

	private renderizarPaginaFiltros(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Filtros pré-configurados, escolhíveis direto na barrinha de Filtro da Lista e do Kanban (sidebar e aba de tela cheia). Diferente das Visualizações salvas, que servem para embutir em notas.",
			cls: "setting-item-description",
		});

		const listaFiltros = containerEl.createDiv();
		this.renderizarListaFiltros(listaFiltros);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Novo filtro")
				.setCta()
				.onClick(() => {
					new ModalEditarFiltroSalvo(
						this.app,
						null,
						this.configEfetiva,
						this.plugin.repositorioDoGrupo(this.grupo.id),
						async (filtro) => {
							this.grupo.filtrosSalvos.push(filtro);
							await this.plugin.salvarConfiguracoes();
							this.display();
						}
					).open();
				})
		);
	}

	private renderizarListaFiltros(container: HTMLElement) {
		container.empty();
		for (const filtro of this.grupo.filtrosSalvos) {
			this.renderizarItemFiltro(container, filtro);
		}
	}

	private renderizarItemFiltro(container: HTMLElement, filtro: FiltroSalvo) {
		const quantidade = filtro.condicoes.length;
		const setting = new Setting(container)
			.setName(filtro.nome)
			.setDesc(quantidade > 0 ? `${quantidade} condição(ões)` : "Sem condições");

		setting.addExtraButton((btn) =>
			btn
				.setIcon("pencil")
				.setTooltip("Editar")
				.onClick(() => {
					new ModalEditarFiltroSalvo(
						this.app,
						filtro,
						this.configEfetiva,
						this.plugin.repositorioDoGrupo(this.grupo.id),
						async (atualizado) => {
							const indice = this.grupo.filtrosSalvos.findIndex((f) => f.id === filtro.id);
							if (indice >= 0) this.grupo.filtrosSalvos[indice] = atualizado;
							await this.plugin.salvarConfiguracoes();
							this.display();
						}
					).open();
				})
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Excluir")
				.onClick(async () => {
					if (!confirm(`Excluir filtro "${filtro.nome}"?`)) return;
					this.grupo.filtrosSalvos = this.grupo.filtrosSalvos.filter(
						(f) => f.id !== filtro.id
					);
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
		);
	}

	private renderizarPropriedadesVisiveis(
		container: HTMLElement,
		titulo: string,
		obterLista: () => string[] | null,
		definirLista: (lista: string[] | null) => void,
		itensOcultosPorPadrao: string[] = []
	) {
		const propriedades = this.grupo.propriedades;
		const itens: { id: string; rotulo: string }[] = [
			{ id: ID_STATUS, rotulo: "status" },
			{ id: ID_DATA_ENTRADA, rotulo: "entrada" },
			...[...propriedades].sort((a, b) => a.ordem - b.ordem).map((def) => ({ id: def.id, rotulo: def.rotulo })),
		];
		const todosOsIds = itens.map((i) => i.id);
		const baseSemCustomizacao = todosOsIds.filter((id) => !itensOcultosPorPadrao.includes(id));

		const visiveisAtuais = obterLista();

		new Setting(container)
			.setName(titulo)
			.setDesc("Escolha quais propriedades aparecem nas tarefas.");

		const caixa = container.createDiv({ cls: "mytasks-cores-caixa" });
		for (const item of itens) {
			const marcado = visiveisAtuais === null ? baseSemCustomizacao.includes(item.id) : visiveisAtuais.includes(item.id);
			new Setting(caixa).setName(item.rotulo).addToggle((toggle) =>
				toggle.setValue(marcado).onChange(async (valor) => {
					const baseAtual = obterLista() ?? baseSemCustomizacao;
					const novaLista = valor ? [...new Set([...baseAtual, item.id])] : baseAtual.filter((id) => id !== item.id);
					definirLista(novaLista.length === todosOsIds.length ? null : novaLista);
					await this.plugin.salvarConfiguracoes();
				})
			);
		}
	}

	private renderizarListaPropriedades(container: HTMLElement) {
		container.empty();
		const propriedades = [...this.grupo.propriedades].sort((a, b) => a.ordem - b.ordem);

		propriedades.forEach((propriedade, indice) => {
			this.renderizarItemPropriedade(container, propriedade, indice, propriedades.length);
		});
	}

	// Move a propriedade uma posição pra cima/baixo na lista. Essa ordem é a mesma usada
	// pra decidir a ordem das propriedades no frontmatter da nota e nas visões (Kanban/Lista/Calendário).
	private async moverPropriedade(propriedade: PropriedadeDefinida, direcao: -1 | 1): Promise<void> {
		const ordenadas = [...this.grupo.propriedades].sort((a, b) => a.ordem - b.ordem);
		const indice = ordenadas.findIndex((p) => p.id === propriedade.id);
		const novoIndice = indice + direcao;
		if (indice < 0 || novoIndice < 0 || novoIndice >= ordenadas.length) return;

		[ordenadas[indice], ordenadas[novoIndice]] = [ordenadas[novoIndice], ordenadas[indice]];
		ordenadas.forEach((p, i) => (p.ordem = i));
		this.grupo.propriedades = ordenadas;
		await this.plugin.salvarConfiguracoes();
		this.display();
	}

	private renderizarItemPropriedade(
		container: HTMLElement,
		propriedade: PropriedadeDefinida,
		indice: number,
		total: number
	) {
		const setting = new Setting(container)
			.setName(propriedade.rotulo)
			.setDesc(this.descricaoTipo(propriedade));

		setting.addExtraButton((btn) =>
			btn
				.setIcon("arrow-up")
				.setTooltip("Mover para cima")
				.setDisabled(indice === 0)
				.onClick(() => this.moverPropriedade(propriedade, -1))
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("arrow-down")
				.setTooltip("Mover para baixo")
				.setDisabled(indice === total - 1)
				.onClick(() => this.moverPropriedade(propriedade, 1))
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("pencil")
				.setTooltip("Editar")
				.onClick(() => {
					new ModalEditarPropriedade(
						this.app,
						propriedade,
						propriedade.ordem,
						async (atualizada) => {
							const indice = this.grupo.propriedades.findIndex(
								(p) => p.id === propriedade.id
							);
							if (indice >= 0) this.grupo.propriedades[indice] = atualizada;
							await this.plugin.salvarConfiguracoes();
							this.display();
						},
						this.plugin.repositorioDoGrupo(this.grupo.id)
					).open();
				})
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remover")
				.onClick(async () => {
					this.grupo.propriedades = this.grupo.propriedades.filter(
						(p) => p.id !== propriedade.id
					);
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
		);

		if (propriedade.tipo === "selecao") {
			const containerOpcoes = container.createDiv();
			new ListaOpcoesGerenciada(containerOpcoes, propriedade.opcoes ?? [], {
				estaEmUso: (valor) => this.plugin.repositorioDoGrupo(this.grupo.id).valoresUsados(propriedade.id).includes(valor),
				aoMudar: async (opcoes) => {
					propriedade.opcoes = opcoes;
					await this.plugin.salvarConfiguracoes();
				},
			});
			this.renderizarDestaque(container, propriedade.id, () => propriedade.opcoes ?? []);
		}
	}

	private renderizarDestaque(container: HTMLElement, propriedadeId: string, obterOpcoes: () => OpcaoSelecao[]) {
		const caixa = container.createDiv({ cls: "mytasks-cores-caixa" });

		if (obterOpcoes().length === 0) {
			caixa.createEl("p", {
				text: "Cadastre ao menos uma opção com cor acima para poder usá-la como destaque visual da tarefa.",
				cls: "setting-item-description",
			});
			return;
		}

		caixa.createEl("h4", { text: "Destaque colorido", cls: "mytasks-destaque-titulo" });

		const destaques = this.grupo.destaques;

		for (const estilo of Object.keys(ROTULOS_ESTILO_DESTAQUE) as EstiloDestaque[]) {
			const donoDoEstilo = destaques[estilo]?.propriedadeId;
			const ehDonoAqui = donoDoEstilo === propriedadeId;
			const ocupadoPorOutra = !!donoDoEstilo && !ehDonoAqui;

			const setting = new Setting(caixa).setName(ROTULOS_ESTILO_DESTAQUE[estilo]);
			if (ocupadoPorOutra) {
				setting.setDesc("Em uso por outra propriedade.");
			}
			setting.addToggle((toggle) => {
				toggle
					.setValue(ehDonoAqui)
					.setDisabled(ocupadoPorOutra)
					.onChange(async (valor) => {
						if (valor) {
							destaques[estilo] = {
								propriedadeId,
								estilo,
								espessuraCheckbox: destaques[estilo]?.espessuraCheckbox ?? "media",
							};
						} else if (ehDonoAqui) {
							delete destaques[estilo];
						}
						await this.plugin.salvarConfiguracoes();
						this.display();
					});
			});

			if (estilo === "checkbox" && ehDonoAqui) {
				new Setting(caixa).setName("Espessura da borda do checkbox").addDropdown((dropdown) => {
					for (const chave of Object.keys(ROTULOS_ESPESSURA) as EspessuraCheckbox[]) {
						dropdown.addOption(chave, ROTULOS_ESPESSURA[chave]);
					}
					dropdown.setValue(destaques.checkbox?.espessuraCheckbox ?? "media").onChange(async (valor) => {
						if (destaques.checkbox) {
							destaques.checkbox.espessuraCheckbox = valor as EspessuraCheckbox;
							await this.plugin.salvarConfiguracoes();
						}
					});
				});
			}
		}
	}

	private renderizarListaVisualizacoes(container: HTMLElement) {
		container.empty();
		for (const visualizacao of this.grupo.visualizacoesSalvas) {
			this.renderizarItemVisualizacao(container, visualizacao);
		}
	}

	private renderizarItemVisualizacao(container: HTMLElement, visualizacao: VisualizacaoSalva) {
		const setting = new Setting(container)
			.setName(visualizacao.nome)
			.setDesc(this.descricaoVisualizacao(visualizacao));

		setting.addExtraButton((btn) =>
			btn
				.setIcon("pencil")
				.setTooltip("Editar")
				.onClick(() => {
					new ModalEditarVisualizacaoSalva(
						this.app,
						visualizacao,
						this.configEfetiva,
						this.plugin.repositorioDoGrupo(this.grupo.id),
						async (atualizada) => {
							const indice = this.grupo.visualizacoesSalvas.findIndex(
								(v) => v.id === visualizacao.id
							);
							if (indice >= 0) this.grupo.visualizacoesSalvas[indice] = atualizada;
							await this.plugin.salvarConfiguracoes();
							this.display();
						}
					).open();
				})
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("copy")
				.setTooltip("Duplicar")
				.onClick(async () => {
					const copia: VisualizacaoSalva = {
						...visualizacao,
						id: `${visualizacao.id}_copia_${Date.now()}`,
						nome: `${visualizacao.nome} (cópia)`,
						condicoes: visualizacao.condicoes.map((c) => ({ ...c, valores: [...c.valores] })),
					};
					this.grupo.visualizacoesSalvas.push(copia);
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Excluir")
				.onClick(async () => {
					const referencias = await contarReferenciasView(this.app, visualizacao.id);
					const mensagem =
						referencias > 0
							? `Esta visualização é usada em ${referencias} nota(s). Embeds que a referenciam vão parar de funcionar corretamente. Excluir mesmo assim?`
							: `Excluir visualização "${visualizacao.nome}"?`;
					if (!confirm(mensagem)) return;
					this.grupo.visualizacoesSalvas = this.grupo.visualizacoesSalvas.filter(
						(v) => v.id !== visualizacao.id
					);
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
		);
	}

	private descricaoVisualizacao(visualizacao: VisualizacaoSalva): string {
		const nomes: Record<string, string> = { lista: "Lista", calendario: "Calendário", kanban: "Kanban" };
		const partes = [nomes[visualizacao.tipoView] ?? visualizacao.tipoView];

		if (visualizacao.tipoView === "calendario" && visualizacao.modoCalendario) {
			partes.push(ROTULOS_MODO[visualizacao.modoCalendario as ModoCalendario]);
		} else if (visualizacao.agrupamento) {
			partes.push(`agrupado por ${rotuloAgrupamento(visualizacao.agrupamento, this.configEfetiva)}`);
		}

		const quantidade = visualizacao.condicoes.length;
		if (quantidade > 0) partes.push(`${quantidade} filtro(s)`);

		return partes.join(" · ");
	}

	private descricaoTipo(propriedade: PropriedadeDefinida): string {
		const nomes: Record<string, string> = {
			texto: "Texto",
			selecao: "Seleção",
			data: "Data",
			link_arquivo: "Link para arquivo",
			lista: "Lista de tags",
		};
		let texto = nomes[propriedade.tipo] ?? propriedade.tipo;
		if (propriedade.tipo === "selecao" && propriedade.opcoes?.length) {
			texto += `: ${propriedade.opcoes.map((o) => o.valor).join(", ")}`;
		}
		return texto;
	}
}
