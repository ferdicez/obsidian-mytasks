import { App, PluginSettingTab, Setting } from "obsidian";
import type MyTasksPlugin from "./main";
import {
	EspessuraCheckbox,
	EstiloDestaque,
	FiltroSalvo,
	ID_STATUS,
	ModoCalendario,
	OpcaoSelecao,
	PropriedadeDefinida,
	ROTULOS_ESPESSURA,
	ROTULOS_ESTILO_DESTAQUE,
	ROTULOS_MODO,
	TipoAgrupamento,
	VisualizacaoSalva,
	normalizarChave,
} from "./tipos";
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

	constructor(app: App, private plugin: MyTasksPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "My Tasks — Configurações" });

		this.renderizarAbasPagina(containerEl);

		const corpo = containerEl.createDiv();
		if (this.paginaAtual === "geral") this.renderizarPaginaGeral(corpo);
		else if (this.paginaAtual === "calendario") this.renderizarPaginaCalendario(corpo);
		else if (this.paginaAtual === "kanban") this.renderizarPaginaKanban(corpo);
		else if (this.paginaAtual === "tarefas") this.renderizarPaginaTarefas(corpo);
		else this.renderizarPaginaFiltros(corpo);
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
		new Setting(containerEl)
			.setName("Pasta das tarefas")
			.setDesc("Pasta do vault onde as notas-tarefa serão salvas.")
			.addText((text) =>
				text
					.setPlaceholder("Tarefas")
					.setValue(this.plugin.configuracoes.pastaTarefas)
					.onChange(async (valor) => {
						this.plugin.configuracoes.pastaTarefas = valor.trim() || "Tarefas";
						await this.plugin.salvarConfiguracoes();
					})
			);

		new Setting(containerEl)
			.setName("Mover tarefas concluídas para outra pasta")
			.setDesc("Ao marcar como concluída, o arquivo é movido para a pasta escolhida, em subpastas por mês (AAAA-MM).")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.configuracoes.moverConcluidas).onChange(async (valor) => {
					this.plugin.configuracoes.moverConcluidas = valor;
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
			);

		if (this.plugin.configuracoes.moverConcluidas) {
			new Setting(containerEl)
				.setName("Pasta das concluídas")
				.setDesc("Dentro dela, o plugin cria automaticamente subpastas como 2026-07.")
				.addText((text) =>
					text
						.setPlaceholder("Tarefas concluídas")
						.setValue(this.plugin.configuracoes.pastaConcluidas)
						.onChange(async (valor) => {
							this.plugin.configuracoes.pastaConcluidas = valor.trim();
							await this.plugin.salvarConfiguracoes();
						})
				);
		}

		new Setting(containerEl)
			.setName("Cor do aviso de prazo")
			.setDesc("Cor de fundo/borda usada quando a tarefa entra no período de 'avisar com antecedência'.")
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.configuracoes.corAviso).onChange(async (valor) => {
					this.plugin.configuracoes.corAviso = valor;
					await this.plugin.salvarConfiguracoes();
				})
			);

		containerEl.createEl("h3", { text: "Status" });
		new Setting(containerEl)
			.setName("Nome do campo")
			.addText((text) =>
				text.setValue(this.plugin.configuracoes.status.rotulo).onChange(async (valor) => {
					this.plugin.configuracoes.status.rotulo = valor.trim() || "Status";
					await this.plugin.salvarConfiguracoes();
				})
			);

		new Setting(containerEl)
			.setName("Opções")
			.setDesc(
				"A primeira é o Inbox (tarefas sem data) e a última é tratada como 'concluído' (dispara recorrência) — essas duas posições são fixas, mas você pode renomear e trocar a cor de ambas. As opções do meio são livres: adicione, remova e reordene como quiser. Renomear uma opção (mantendo a posição) atualiza automaticamente as tarefas existentes."
			);

		const containerOpcoesStatus = containerEl.createDiv();
		new ListaOpcoesGerenciada(containerOpcoesStatus, this.plugin.configuracoes.status.opcoes, {
			estaEmUso: (valor) => this.plugin.repositorio.valoresDeStatusEmUso().includes(valor),
			aoRenomear: async (valorAntigo, valorNovo) => {
				await this.plugin.repositorio.migrarValoresStatus(new Map([[valorAntigo, valorNovo]]));
			},
			aoMudar: async (opcoes) => {
				this.plugin.configuracoes.status.opcoes = opcoes;
				await this.plugin.salvarConfiguracoes();
			},
			extremosFixos: true,
			descricaoPrimeira: "Inbox: reservado para tarefas sem data.",
			descricaoUltima: "Concluído: dispara a recorrência, se houver.",
		});

		this.renderizarDestaque(containerEl, ID_STATUS, () => this.plugin.configuracoes.status.opcoes);

		containerEl.createEl("h3", { text: "Data" });
		new Setting(containerEl)
			.setName("Nome do campo")
			.setDesc(
				"É a data de vencimento (prazo) da tarefa — a mesma usada no calendário. Renomear aqui também renomeia a propriedade nas notas já criadas, automaticamente."
			)
			.addText((text) =>
				text.setValue(this.plugin.configuracoes.dataTarefa.rotulo).onChange(async (valor) => {
					const novoRotulo = valor.trim() || "Data";
					const chaveAntiga = this.plugin.configuracoes.dataTarefa.chave ?? "data";
					const chaveNova = normalizarChave(novoRotulo);

					this.plugin.configuracoes.dataTarefa.rotulo = novoRotulo;
					this.plugin.configuracoes.dataTarefa.chave = chaveNova;
					await this.plugin.salvarConfiguracoes();

					if (chaveNova !== chaveAntiga) {
						await this.plugin.repositorio.migrarChaveData(chaveAntiga, chaveNova);
					}
				})
			);

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
						this.plugin.configuracoes.propriedades.length,
						async (propriedade) => {
							this.plugin.configuracoes.propriedades.push(propriedade);
							await this.plugin.salvarConfiguracoes();
							this.display();
						},
						this.plugin.repositorio
					).open();
				})
		);

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
						this.plugin.configuracoes,
						this.plugin.repositorio,
						async (visualizacao) => {
							this.plugin.configuracoes.visualizacoesSalvas.push(visualizacao);
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
			() => this.plugin.configuracoes.filtroPadraoCalendarioId,
			(id) => (this.plugin.configuracoes.filtroPadraoCalendarioId = id)
		);

		new Setting(containerEl)
			.setName("Mostrar detalhes nas tarefas do calendário")
			.setDesc("Exibe status e propriedades abaixo do título de cada tarefa nas visões de calendário.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.configuracoes.calendarioMostrarDetalhes).onChange(async (valor) => {
					this.plugin.configuracoes.calendarioMostrarDetalhes = valor;
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
			);

		if (!this.plugin.configuracoes.calendarioMostrarDetalhes) return;

		for (const modo of MODOS_CALENDARIO) {
			containerEl.createEl("h3", { text: ROTULOS_MODO[modo] });
			this.renderizarPropriedadesVisiveis(
				containerEl,
				`Propriedades visíveis — ${ROTULOS_MODO[modo]}`,
				() => this.plugin.configuracoes.calendarioPropriedadesVisiveisPorModo[modo],
				(lista) => (this.plugin.configuracoes.calendarioPropriedadesVisiveisPorModo[modo] = lista),
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
			() => this.plugin.configuracoes.agrupamentoPadraoKanban,
			(agrupamento) => (this.plugin.configuracoes.agrupamentoPadraoKanban = agrupamento)
		);
		this.renderizarFiltroPadrao(
			containerEl,
			"Filtro padrão",
			() => this.plugin.configuracoes.filtroPadraoKanbanId,
			(id) => (this.plugin.configuracoes.filtroPadraoKanbanId = id)
		);
		this.renderizarPropriedadesVisiveis(
			containerEl,
			"Propriedades visíveis no kanban",
			() => this.plugin.configuracoes.kanbanPropriedadesVisiveis,
			(lista) => (this.plugin.configuracoes.kanbanPropriedadesVisiveis = lista)
		);
	}

	private renderizarPaginaTarefas(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Lista de tarefas" });
		this.renderizarAgrupamentoPadrao(
			containerEl,
			"Agrupamento padrão",
			true,
			true,
			() => this.plugin.configuracoes.agrupamentoPadraoLista,
			(agrupamento) => (this.plugin.configuracoes.agrupamentoPadraoLista = agrupamento)
		);
		this.renderizarFiltroPadrao(
			containerEl,
			"Filtro padrão",
			() => this.plugin.configuracoes.filtroPadraoListaId,
			(id) => (this.plugin.configuracoes.filtroPadraoListaId = id)
		);
		this.renderizarPropriedadesVisiveis(
			containerEl,
			"Propriedades visíveis na lista",
			() => this.plugin.configuracoes.listaPropriedadesVisiveis,
			(lista) => (this.plugin.configuracoes.listaPropriedadesVisiveis = lista)
		);

		containerEl.createEl("h3", { text: "Inbox" });
		this.renderizarPropriedadesVisiveis(
			containerEl,
			"Propriedades visíveis no Inbox",
			() => this.plugin.configuracoes.listaInboxPropriedadesVisiveis,
			(lista) => (this.plugin.configuracoes.listaInboxPropriedadesVisiveis = lista)
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
		const opcoes = opcoesDeAgrupamento(this.plugin.configuracoes, permitirNenhum, permitirDia);
		new Setting(container)
			.setName(titulo)
			.setDesc("Agrupamento com que esta tela abre sempre que você a acessa.")
			.addDropdown((dropdown) => {
				for (const opcao of opcoes) {
					dropdown.addOption(opcao, rotuloAgrupamento(opcao, this.plugin.configuracoes));
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
		const { filtrosSalvos } = this.plugin.configuracoes;
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
						this.plugin.configuracoes,
						this.plugin.repositorio,
						async (filtro) => {
							this.plugin.configuracoes.filtrosSalvos.push(filtro);
							await this.plugin.salvarConfiguracoes();
							this.display();
						}
					).open();
				})
		);
	}

	private renderizarListaFiltros(container: HTMLElement) {
		container.empty();
		for (const filtro of this.plugin.configuracoes.filtrosSalvos) {
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
						this.plugin.configuracoes,
						this.plugin.repositorio,
						async (atualizado) => {
							const indice = this.plugin.configuracoes.filtrosSalvos.findIndex((f) => f.id === filtro.id);
							if (indice >= 0) this.plugin.configuracoes.filtrosSalvos[indice] = atualizado;
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
					this.plugin.configuracoes.filtrosSalvos = this.plugin.configuracoes.filtrosSalvos.filter(
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
		const propriedades = this.plugin.configuracoes.propriedades;
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
		const propriedades = [...this.plugin.configuracoes.propriedades].sort((a, b) => a.ordem - b.ordem);

		for (const propriedade of propriedades) {
			this.renderizarItemPropriedade(container, propriedade);
		}
	}

	private renderizarItemPropriedade(container: HTMLElement, propriedade: PropriedadeDefinida) {
		const setting = new Setting(container)
			.setName(propriedade.rotulo)
			.setDesc(this.descricaoTipo(propriedade));

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
							const indice = this.plugin.configuracoes.propriedades.findIndex(
								(p) => p.id === propriedade.id
							);
							if (indice >= 0) this.plugin.configuracoes.propriedades[indice] = atualizada;
							await this.plugin.salvarConfiguracoes();
							this.display();
						},
						this.plugin.repositorio
					).open();
				})
		);

		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remover")
				.onClick(async () => {
					this.plugin.configuracoes.propriedades = this.plugin.configuracoes.propriedades.filter(
						(p) => p.id !== propriedade.id
					);
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
		);

		if (propriedade.tipo === "selecao") {
			const containerOpcoes = container.createDiv();
			new ListaOpcoesGerenciada(containerOpcoes, propriedade.opcoes ?? [], {
				estaEmUso: (valor) => this.plugin.repositorio.valoresUsados(propriedade.id).includes(valor),
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

		new Setting(caixa)
			.setName("Usar estas cores para destacar a tarefa")
			.setDesc("Cada estilo abaixo só pode ser usado por uma propriedade por vez, mas os três podem estar ativos ao mesmo tempo (um por propriedade diferente).");

		const destaques = this.plugin.configuracoes.destaques;

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
		for (const visualizacao of this.plugin.configuracoes.visualizacoesSalvas) {
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
						this.plugin.configuracoes,
						this.plugin.repositorio,
						async (atualizada) => {
							const indice = this.plugin.configuracoes.visualizacoesSalvas.findIndex(
								(v) => v.id === visualizacao.id
							);
							if (indice >= 0) this.plugin.configuracoes.visualizacoesSalvas[indice] = atualizada;
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
					this.plugin.configuracoes.visualizacoesSalvas.push(copia);
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
					this.plugin.configuracoes.visualizacoesSalvas = this.plugin.configuracoes.visualizacoesSalvas.filter(
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
			partes.push(`agrupado por ${rotuloAgrupamento(visualizacao.agrupamento, this.plugin.configuracoes)}`);
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
