import { App, Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type MyTasksPlugin from "./main";
import {
	ACOES_FIXAS_PADRAO,
	AcaoBotao,
	CAMPOS_TEMPLATE_NOTA_FIXOS,
	ConfigEfetivaGrupo,
	DESCRICOES_ACOES_FIXAS,
	EspessuraCheckbox,
	EstiloDestaque,
	FiltroSalvo,
	GRUPO_PADRAO,
	GrupoTarefas,
	ICONES_ACOES_FIXAS,
	ID_DATA_ACAO,
	ID_STATUS,
	ORDEM_ACOES_FIXAS,
	ModoCalendario,
	OpcaoSelecao,
	PropriedadeDefinida,
	RECORRENCIA_LABELS,
	ROTULOS_ESPESSURA,
	ROTULOS_ESTILO_DESTAQUE,
	ROTULOS_MODO,
	Recorrencia,
	TipoAgrupamento,
	VisualizacaoSalva,
	botoesAcaoPadrao,
	presetsCapturaPadrao,
	camposCapturaPadrao,
	camposDaCaptura,
	CampoCaptura,
	ID_ANTECEDENCIA_ACAO,
	ID_MANTER_HISTORICO_ACAO,
	ID_RECORRENCIA_ACAO,
	IDS_CAMPOS_COMPORTAMENTO,
	rotuloFixo,
	campoEhOpcional,
	campoPodeSerOpcional,
	campoVisivelNaNota,
	clonarGrupoFiltro,
	GrupoFiltro,
	grupoFiltroVazio,
	configDoGrupo,
	contarCondicoes,
	grupoAtivoOuPrimeiro,
	idsTemplateNotaVisiveisPorPadrao,
	migrarReferenciasPropriedade,
	normalizarChave,
} from "./tipos";
import { ModalEditarGrupo } from "./modal-editar-grupo";
import { ModalEditarPropriedade } from "./modal-editar-propriedade";
import { ListaOpcoesGerenciada } from "./lista-opcoes-gerenciada";
import { ModalEditarVisualizacaoSalva } from "./modal-editar-visualizacao-salva";
import { opcoesDeAgrupamento, rotuloAgrupamento } from "./seletor-agrupamento";
import { contarReferenciasView } from "./localizador-referencias";
import { ID_DATA_ENTRADA } from "./render-tarefa";
import { SugestorArquivos } from "./sugestor-arquivos";
import { ModalEditarCalendarioExterno } from "./modal-editar-calendario-externo";
import { ModalEditarBotaoAcao } from "./modal-editar-botao-acao";
import { ModalEditarPresetCaptura } from "./modal-editar-preset-captura";
import { abrirAcordeao, criarAcordeao, limparEstadoAcordeoes } from "./acordeao";
import { ConstrutorFiltro } from "./construtor-filtro";

// Id de um filtro salvo criado direto na página (sem modal).
function gerarIdFiltro(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `filtro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// "avancado" saiu: as chaves técnicas viraram um acordeão dentro de Geral → Nomenclatura.
// "captura" entrou, reunindo nota da tarefa + captura rápida + campos + presets.
type PaginaConfig = "geral" | "captura" | "calendario" | "kanban" | "tarefas" | "filtros";

// Cores atribuídas às agendas externas por ordem de cadastro, pra duas não nascerem iguais.
// A usuária pode trocar qualquer uma pelo seletor de cor na lista.
const CORES_CALENDARIO_EXTERNO = ["#4285f4", "#e8710a", "#3f9142", "#a142f4", "#d93025", "#00838f"];

const PAGINAS: { id: PaginaConfig; rotulo: string }[] = [
	{ id: "geral", rotulo: "Geral" },
	{ id: "captura", rotulo: "Captura" },
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
	// Estado de cada filtro salvo quando o acordeão dele foi aberto — base do "Desfazer alterações".
	// Sem o modal, editar grava na hora; este retrato é o que permite voltar atrás.
	private retratosDeFiltro = new Map<string, { nome: string; raiz: GrupoFiltro }>();

	constructor(app: App, private plugin: MyTasksPlugin) {
		super(app, plugin);
	}

	private get grupo(): GrupoTarefas {
		return grupoAtivoOuPrimeiro(this.plugin.configuracoes, this.grupoSelecionadoId);
	}

	private get configEfetiva(): ConfigEfetivaGrupo {
		return configDoGrupo(this.plugin.configuracoes, this.grupo);
	}

	// Fechar as Configurações encerra a "sessão de edição": os retratos dos filtros são descartados,
	// então reabrir a tela parte do estado atual como base do "Desfazer alterações" — e não de algo
	// que ela editou e conferiu meia hora atrás.
	hide(): void {
		this.retratosDeFiltro.clear();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		// Escopo do CSS que tira as molduras dos blocos (ver .mytasks-config no styles.css) — sem a
		// classe, as regras atingiriam as Configurações de outros plugins também.
		containerEl.addClass("mytasks-config");

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
		else if (this.paginaAtual === "captura") this.renderizarPaginaCaptura(corpo);
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
				"Chave de frontmatter usada para separar os grupos (ex: grupo). Deixe em branco para usar um só grupo. Renomear um valor já configurado reescreve automaticamente as tarefas existentes."
			)
			.addText((text) => {
				text.setPlaceholder("grupo").setValue(this.plugin.configuracoes.propriedadeGrupo ?? "");
				text.inputEl.addEventListener("blur", async () => {
					const chaveAntiga = this.plugin.configuracoes.propriedadeGrupo;
					const valorDigitado = text.inputEl.value.trim();
					const chaveNova = valorDigitado ? normalizarChave(valorDigitado) : null;
					if (chaveNova === chaveAntiga) {
						text.setValue(chaveAntiga ?? "");
						return;
					}

					// Só existe algo pra migrar quando estava configurada e continua configurada (renomear de
					// verdade) — nascer/zerar a propriedade não mexe em frontmatter nenhum, não pede confirmação.
					if (chaveAntiga && chaveNova) {
						const confirmado = confirm(
							`Renomear a chave "${chaveAntiga}" para "${chaveNova}"? Isso reescreve o frontmatter de todas as tarefas existentes que usam essa chave.`
						);
						if (!confirmado) {
							text.setValue(chaveAntiga);
							return;
						}
						const migrados = await this.plugin.renomearChavePropriedadeGrupo(chaveAntiga, chaveNova);
						new Notice(`Chave renomeada em ${migrados} tarefa(s).`);
					}

					this.plugin.configuracoes.propriedadeGrupo = chaveNova;
					await this.plugin.salvarConfiguracoes();
				});
			});

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
						// As chaves dos acordeões são por PÁGINA, não por grupo: sem limpar, entrar noutro
						// grupo herdaria o que estava aberto no anterior, que descreve outra configuração.
						limparEstadoAcordeoes();
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
						// GRUPO_PADRAO tem `botoesAcao: []` de propósito — os botões de exemplo dependem
						// dos status do grupo, que só existem aqui. Sem esta linha, um grupo novo nasceria
						// com o menu do clique direito vazio enquanto os antigos vêm semeados na migração.
						novo.botoesAcao = botoesAcaoPadrao(novo.status);
							// Mesma história para os presets de captura (ver presetsCapturaPadrao).
							novo.captura = {
								...novo.captura,
								campos: camposCapturaPadrao(novo.propriedades),
								camposVisiveis: [],
								presets: presetsCapturaPadrao(novo.status),
								camposSemeados: true,
							};
						this.plugin.configuracoes.grupos.push(novo);
						await this.plugin.salvarConfiguracoes();
						this.plugin.registrarRibbonsDeGrupos();
						this.display();
					}).open();
				})
		);
	}

	// Agendas externas (Google via .ics) DESTE grupo — os compromissos aparecem no calendário do grupo,
	// junto das tarefas dele. Fica na página "Calendário" do grupo, não na tela global: cada grupo é um
	// contexto de trabalho próprio, e a agenda de um não deve poluir o calendário do outro.
	private renderizarCalendariosExternos(containerEl: HTMLElement): void {
		const grupo = this.grupo;
		if (!grupo.calendariosExternos) grupo.calendariosExternos = [];

		// Sem hr/h3 próprios: o título vem do acordeão que envolve esta seção (ver renderizarPaginaCalendario).
		containerEl.createEl("p", {
			text: `Mostra os compromissos do Google Agenda no calendário de "${grupo.nome}", junto das tarefas deste grupo. Só leitura: nada é criado, editado ou apagado na sua agenda.`,
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Mostrar compromissos no calendário")
			.setDesc("Desligue para esconder os compromissos deste grupo sem apagar as agendas cadastradas.")
			.addToggle((toggle) =>
				toggle.setValue(grupo.mostrarEventosExternos ?? true).onChange(async (valor) => {
					grupo.mostrarEventosExternos = valor;
					await this.plugin.salvarConfiguracoes();
					this.plugin.redesenharCalendarios();
				})
			);

		new Setting(containerEl)
			.setName("Buscar novidades a cada")
			.setDesc(
				"Em minutos, válido para todas as agendas de todos os grupos. O Google leva um tempo próprio para republicar a agenda (de alguns minutos a algumas horas), então um compromisso recém-criado pode demorar a aparecer aqui — isso não depende deste intervalo."
			)
			.addText((text) =>
				text.setValue(String(this.plugin.configuracoes.intervaloAtualizacaoMin)).onChange(async (valor) => {
					const minutos = parseInt(valor, 10);
					if (Number.isNaN(minutos) || minutos < 1) return;
					this.plugin.configuracoes.intervaloAtualizacaoMin = minutos;
					await this.plugin.salvarConfiguracoes();
				})
			);

		for (const calendario of grupo.calendariosExternos) {
			const linha = new Setting(containerEl);

			const preview = linha.nameEl.createSpan({ cls: "mytasks-config-grupo-icone" });
			preview.createDiv({ cls: "mytasks-evento-cor" }).style.backgroundColor = calendario.cor;
			linha.nameEl.createSpan({ text: calendario.nome || "(sem nome)" });

			linha.addToggle((toggle) =>
				toggle
					.setTooltip("Mostrar esta agenda")
					.setValue(calendario.ativo)
					.onChange(async (valor) => {
						calendario.ativo = valor;
						await this.plugin.salvarConfiguracoes();
						this.plugin.redesenharCalendarios();
					})
			);

			linha.addColorPicker((picker) =>
				picker.setValue(calendario.cor).onChange(async (valor) => {
					calendario.cor = valor;
					await this.plugin.salvarConfiguracoes();
					this.plugin.redesenharCalendarios();
					this.display();
				})
			);

			linha.addButton((btn) =>
				btn
					.setIcon("pencil")
					.setTooltip("Editar")
					.onClick(() => this.abrirEdicaoCalendarioExterno(calendario.id))
			);

			linha.addButton((btn) =>
				btn
					.setIcon("refresh-cw")
					.setTooltip("Atualizar agora")
					.onClick(async () => {
						new Notice(`Buscando "${calendario.nome}"…`);
						const ok = await this.plugin.calendariosExternos.atualizarCalendario(calendario);
						new Notice(ok ? "Agenda atualizada." : "Não consegui atualizar — veja o erro abaixo do nome.");
						this.plugin.redesenharCalendarios();
						this.display();
					})
			);

			linha.addButton((btn) =>
				btn
					.setIcon("trash-2")
					.setTooltip("Remover")
					.onClick(async () => {
						if (!confirm(`Remover a agenda "${calendario.nome}" deste grupo? Isso não apaga nada no Google.`)) return;
						grupo.calendariosExternos = grupo.calendariosExternos.filter((c) => c.id !== calendario.id);
						await this.plugin.salvarConfiguracoes();
						// Depois de salvar: removerCache só descarta se nenhum outro grupo ainda assinar.
						await this.plugin.calendariosExternos.removerCache(calendario.id);
						this.plugin.redesenharCalendarios();
						this.display();
					})
			);

			// Linha de status abaixo do item: última busca bem-sucedida ou o erro da última tentativa.
			const status = this.plugin.calendariosExternos.statusDe(calendario.id);
			const statusEl = containerEl.createDiv({ cls: "mytasks-calendario-externo-status" });
			if (status?.erro) {
				statusEl.addClass("mytasks-calendario-externo-erro");
				statusEl.setText(`Erro na última busca: ${status.erro}`);
			} else if (status?.buscadoEm) {
				statusEl.setText(`Atualizada em ${new Date(status.buscadoEm).toLocaleString()}`);
			} else {
				statusEl.setText("Ainda não buscada.");
			}
		}

		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText("+ Adicionar agenda do Google").onClick(() => this.abrirEdicaoCalendarioExterno(null))
		);

		const ajuda = containerEl.createEl("p", { cls: "setting-item-description" });
		ajuda.createEl("strong", { text: "Onde achar a URL: " });
		ajuda.appendText(
			"no Google Agenda, abra as configurações da agenda desejada → \"Integrar agenda\" → copie o \"Endereço secreto em formato iCal\". Esse endereço dá acesso de leitura à sua agenda para quem o tiver, então não compartilhe. Ele fica salvo apenas neste computador."
		);
	}

	// Modal simples (nome + URL) para criar/editar uma agenda. Reaproveita o padrão de prompt do
	// Obsidian em vez de uma classe Modal própria: são só dois campos.
	private abrirEdicaoCalendarioExterno(calendarioId: string | null): void {
		const grupo = this.grupo;
		if (!grupo.calendariosExternos) grupo.calendariosExternos = [];
		const existente = calendarioId ? grupo.calendariosExternos.find((c) => c.id === calendarioId) : null;

		new ModalEditarCalendarioExterno(
			this.app,
			existente ? { nome: existente.nome, url: existente.url } : null,
			async (dados) => {
				if (existente) {
					const urlMudou = existente.url !== dados.url;
					existente.nome = dados.nome;
					existente.url = dados.url;
					await this.plugin.salvarConfiguracoes();
					// URL nova invalida o cache: o conteúdo guardado é de outra agenda.
					if (urlMudou) {
						await this.plugin.calendariosExternos.removerCache(existente.id);
						await this.plugin.calendariosExternos.atualizarCalendario(existente);
					}
				} else {
					const novo = {
						id: `cal_${Date.now()}`,
						nome: dados.nome,
						url: dados.url,
						// Paleta fixa por posição, pra duas agendas não nascerem da mesma cor.
						cor: CORES_CALENDARIO_EXTERNO[grupo.calendariosExternos.length % CORES_CALENDARIO_EXTERNO.length],
						ativo: true,
					};
					grupo.calendariosExternos.push(novo);
					await this.plugin.salvarConfiguracoes();
					new Notice(`Buscando "${novo.nome}"…`);
					const ok = await this.plugin.calendariosExternos.atualizarCalendario(novo);
					new Notice(ok ? "Agenda adicionada." : "Agenda adicionada, mas a busca falhou — veja o erro na lista.");
				}
				this.plugin.redesenharCalendarios();
				this.display();
			}
		).open();
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

	// A página Geral é uma pilha de acordeões, na ordem que ela pediu:
	// identidade → configurações gerais → status → propriedades customizadas → nomenclatura.
	// "Menu do clique direito" e "Visualizações salvas" continuam aqui (não estavam na lista dela,
	// mas também não foram mandados pra outro lugar), agora como acordeões próprios.
	private renderizarPaginaGeral(containerEl: HTMLElement): void {
		criarAcordeao(containerEl, {
			chave: "geral/identidade",
			titulo: "Identidade do grupo",
			descricao: "Nome, valor da propriedade que define o grupo e ícone da barra lateral.",
		}).sePreenchido((corpo) => this.renderizarIdentidadeDoGrupo(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/configuracoes-gerais",
			titulo: "Configurações gerais",
			descricao: "Pastas, lembrete, antecipação de pendências e recorrência.",
		}).sePreenchido((corpo) => this.renderizarConfiguracoesGerais(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/status",
			titulo: "Status",
		}).sePreenchido((corpo) => this.renderizarSecaoStatus(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/propriedades",
			titulo: "Propriedades customizadas",
			descricao: "Crie os campos que fizerem sentido para o seu fluxo (ex: Cliente, Projeto, Prioridade).",
		}).sePreenchido((corpo) => this.renderizarSecaoPropriedades(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/nomenclatura",
			titulo: "Nomenclatura das propriedades",
			descricao: "Nome do campo de prazo e as chaves técnicas gravadas no frontmatter das notas.",
		}).sePreenchido((corpo) => this.renderizarSecaoNomenclatura(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/menu-clique-direito",
			titulo: "Menu do clique direito",
			descricao: "Botões que aparecem ao clicar com o botão direito em cima de uma tarefa.",
		}).sePreenchido((corpo) => this.renderizarSecaoBotoesAcao(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/visualizacoes",
			titulo: "Visualizações salvas",
			descricao: "Visualizações reutilizáveis (filtro + agrupamento) para usar em abas ou embutir em notas.",
		}).sePreenchido((corpo) => this.renderizarSecaoVisualizacoes(corpo));
	}

	private renderizarIdentidadeDoGrupo(containerEl: HTMLElement): void {
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
	}

	private renderizarConfiguracoesGerais(containerEl: HTMLElement): void {
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
			.setName("Cor do lembrete")
			.setDesc(
				"Cor do fundo clarinho da tarefa nos dias em que ela aparece como lembrete, antes do prazo ('avisar com antecedência'). No dia do prazo o cartão fica normal, como qualquer outra tarefa."
			)
			.addColorPicker((picker) =>
				picker.setValue(this.grupo.corAviso).onChange(async (valor) => {
					this.grupo.corAviso = valor;
					await this.plugin.salvarConfiguracoes();
				})
			);

		new Setting(containerEl)
			.setName("Antecipar pendências")
			.setDesc(
				"Faz a tarefa APARECER nos dias de antecedência, não só ficar colorida no dia do prazo. Prazo dia 10 com 3 dias de antecedência: ela já aparece nas listas e no calendário a partir do dia 7, esmaecida e com um sino indicando quantos dias faltam, e sai sozinha dos dias que passam. Nada é gravado nas notas."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.grupo.anteciparPendencias).onChange(async (valor) => {
					this.grupo.anteciparPendencias = valor;
					await this.plugin.salvarConfiguracoes();
				})
			);

		new Setting(containerEl)
			.setName("Recorrência")
			.setDesc(
				"Desligar remove o campo Recorrência (e Repetir até) do modal de editar tarefa, da nota criada por \"Nova tarefa\" e o ícone de recorrência no card — este grupo passa a se comportar como se recorrência não existisse."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.grupo.recorrenciaAtiva).onChange(async (valor) => {
					this.grupo.recorrenciaAtiva = valor;
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
			);

	}

	// Status vira DOIS acordeões aninhados (pedido dela): opções e destaque colorido. O "nome do
	// campo" fica solto acima dos dois — é uma linha só e pertence aos dois.
	private renderizarSecaoStatus(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Nome do campo")
			.addText((text) =>
				text.setValue(this.grupo.status.rotulo).onChange(async (valor) => {
					this.grupo.status.rotulo = valor.trim() || "Status";
					await this.plugin.salvarConfiguracoes();
				})
			);

		criarAcordeao(containerEl, {
			chave: "geral/status/opcoes",
			titulo: "Opções",
			aninhado: true,
		}).sePreenchido((corpo) => this.renderizarOpcoesDeStatus(corpo));

		criarAcordeao(containerEl, {
			chave: "geral/status/destaque",
			titulo: "Destaque colorido",
			aninhado: true,
		}).sePreenchido((corpo) => this.renderizarDestaque(corpo, ID_STATUS, () => this.grupo.status.opcoes));
	}

	private renderizarOpcoesDeStatus(containerEl: HTMLElement): void {
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

	}

	// "Nomenclatura das propriedades": o nome do campo de prazo (que era a seção "Data de conclusão"
	// solta na Geral, movida pra cá a pedido dela) + as chaves técnicas que estavam em "Avançado".
	private renderizarSecaoNomenclatura(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Nome do campo de prazo")
			.setDesc(
				"É a data de vencimento (prazo) da tarefa — a mesma usada no calendário. Renomear aqui também renomeia a propriedade nas notas já criadas, automaticamente."
			)
			.addText((text) => {
				const rotuloOriginal = this.grupo.dataTarefa.rotulo;
				text.setValue(rotuloOriginal);
				// Dispara no BLUR (não a cada tecla) e pede confirmação antes de migrar — mesmo padrão dos
				// demais campos fixos (ver renderizarCampoChaveFixa), já que aqui a chave deriva do rótulo.
				text.inputEl.addEventListener("blur", async () => {
					const novoRotulo = text.inputEl.value.trim() || "Data";
					const chaveAntiga = this.grupo.dataTarefa.chave ?? "data";
					const chaveNova = normalizarChave(novoRotulo);

					if (chaveNova === chaveAntiga) {
						this.grupo.dataTarefa.rotulo = novoRotulo;
						text.setValue(novoRotulo);
						await this.plugin.salvarConfiguracoes();
						return;
					}

					const confirmado = confirm(
						`Renomear a chave "${chaveAntiga}" para "${chaveNova}"? Isso reescreve o frontmatter de todas as tarefas existentes que usam essa chave.`
					);
					if (!confirmado) {
						text.setValue(rotuloOriginal);
						return;
					}

					this.grupo.dataTarefa.rotulo = novoRotulo;
					this.grupo.dataTarefa.chave = chaveNova;
					await this.plugin.salvarConfiguracoes();
					const migrados = await this.plugin.repositorioDoGrupo(this.grupo.id).migrarChaveData(chaveAntiga, chaveNova);
					new Notice(`Chave renomeada em ${migrados} tarefa(s).`);
				});
			});

		// As chaves técnicas do frontmatter, que antes eram a página "Avançado".
		this.renderizarChavesFixas(containerEl);
	}

	private renderizarSecaoPropriedades(containerEl: HTMLElement): void {
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
						this.plugin.repositorioDoGrupo(this.grupo.id),
						this.grupo.propriedades
					).open();
				})
		);

	}

	private renderizarSecaoVisualizacoes(containerEl: HTMLElement): void {
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
		criarAcordeao(containerEl, {
			chave: "calendario/abertura",
			titulo: "Como o calendário abre",
			descricao: "Filtro aplicado toda vez que a tela é aberta.",
			abertoPorPadrao: true,
		}).sePreenchido((corpo) =>
			this.renderizarFiltroPadrao(
				corpo,
				"Filtro padrão",
				() => this.grupo.filtroPadraoCalendarioId,
				(id) => (this.grupo.filtroPadraoCalendarioId = id)
			)
		);

		criarAcordeao(containerEl, {
			chave: "calendario/lista",
			titulo: "Visualização “Lista”",
			descricao: "As duas colunas da primeira aba do calendário.",
		}).sePreenchido((corpo) => this.renderizarColunasDaLista(corpo));

		criarAcordeao(containerEl, {
			chave: "calendario/detalhes",
			titulo: "Detalhes nas tarefas",
			descricao: "O que aparece embaixo do título de cada tarefa, em cada modo do calendário.",
		}).sePreenchido((corpo) => this.renderizarDetalhesDoCalendario(corpo));

		criarAcordeao(containerEl, {
			chave: "calendario/externos",
			titulo: "Agendas externas",
			descricao: "Calendários do Google (ou outros) exibidos junto das tarefas deste grupo.",
		}).sePreenchido((corpo) => this.renderizarCalendariosExternos(corpo));
	}

	// O interruptor de detalhes e, quando ligado, as propriedades visíveis modo a modo. Separado da
	// página porque o toggle chama display() — que reconstrói tudo — e o acordeão precisa redesenhar
	// só o próprio corpo pra não perder o estado das outras seções.
	private renderizarDetalhesDoCalendario(containerEl: HTMLElement): void {
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

		// Um acordeão aninhado por modo: são quatro listas longas de propriedades, e todas abertas de
		// uma vez enterram o interruptor acima.
		for (const modo of MODOS_CALENDARIO) {
			criarAcordeao(containerEl, {
				chave: `calendario/detalhes/${modo}`,
				titulo: ROTULOS_MODO[modo],
				aninhado: true,
			}).sePreenchido((corpo) =>
				this.renderizarPropriedadesVisiveis(
					corpo,
					`Propriedades visíveis — ${ROTULOS_MODO[modo]}`,
					() => this.grupo.calendarioPropriedadesVisiveisPorModo[modo],
					(lista) => (this.grupo.calendarioPropriedadesVisiveisPorModo[modo] = lista),
					[ID_DATA_ENTRADA]
				)
			);
		}
	}

	// A visualização "Lista" do calendário: duas colunas, cada uma mostrando uma Visualização salva.
	// Fica na página do Calendário porque é uma das visões dele (a primeira aba, antes de "Dia").
	private renderizarColunasDaLista(containerEl: HTMLElement): void {
		// Sem h3 próprio: o título vem do acordeão que envolve esta seção (ver renderizarPaginaCalendario).
		containerEl.createEl("p", {
			text: "A primeira aba do calendário mostra duas colunas lado a lado. Escolha abaixo qual Visualização salva aparece em cada uma.",
			cls: "setting-item-description",
		});

		const visualizacoes = this.grupo.visualizacoesSalvas;
		if (visualizacoes.length === 0) {
			containerEl.createEl("p", {
				text: 'Nenhuma Visualização salva ainda. Crie uma em Geral → "Visualizações salvas" para poder usá-la aqui.',
				cls: "setting-item-description",
			});
			return;
		}

		const escolherColuna = (
			nome: string,
			obter: () => string | null,
			definir: (id: string | null) => void
		) => {
			new Setting(containerEl).setName(nome).addDropdown((dropdown) => {
				dropdown.addOption("", "— vazia —");
				for (const visualizacao of visualizacoes) dropdown.addOption(visualizacao.id, visualizacao.nome);
				// Uma visualização apagada depois de escolhida não existe mais na lista de opções: o
				// dropdown cairia sozinho na primeira opção e mentiria sobre o que está salvo. Mostrar
				// vazio deixa claro que a coluna precisa ser reconfigurada (é o que a coluna diz na tela).
				const atual = obter();
				dropdown.setValue(atual && visualizacoes.some((v) => v.id === atual) ? atual : "");
				dropdown.onChange(async (valor) => {
					definir(valor || null);
					await this.plugin.salvarConfiguracoes();
				});
			});
		};

		escolherColuna(
			"Coluna da esquerda",
			() => this.grupo.calendarioListaColunaEsquerdaId,
			(id) => (this.grupo.calendarioListaColunaEsquerdaId = id)
		);
		escolherColuna(
			"Coluna da direita",
			() => this.grupo.calendarioListaColunaDireitaId,
			(id) => (this.grupo.calendarioListaColunaDireitaId = id)
		);
	}

	private renderizarPaginaKanban(containerEl: HTMLElement): void {
		criarAcordeao(containerEl, {
			chave: "kanban/abertura",
			titulo: "Como o Kanban abre",
			descricao: "Agrupamento, subagrupamento e filtro aplicados toda vez que a tela é aberta.",
			abertoPorPadrao: true,
		}).sePreenchido((corpo) => {
			this.renderizarAgrupamentoPadrao(
				corpo,
				"Agrupamento padrão",
				false,
				false,
				() => this.grupo.agrupamentoPadraoKanban,
				(agrupamento) => (this.grupo.agrupamentoPadraoKanban = agrupamento)
			);
			// Subagrupamento aceita "nenhum" (é o padrão: coluna corrida) e não aceita "Dia", que só faz
			// sentido como agrupamento principal. Escolher aqui o mesmo valor do agrupamento não quebra: o
			// motor já anula o subagrupamento quando os dois coincidem (ver subagrupamentoEfetivo).
			this.renderizarAgrupamentoPadrao(
				corpo,
				"Subagrupamento padrão",
				true,
				false,
				() => this.grupo.subagrupamentoPadraoKanban,
				(agrupamento) => (this.grupo.subagrupamentoPadraoKanban = agrupamento),
				'Divide cada coluna em seções ao abrir. "nenhum" deixa a coluna corrida, como sempre.'
			);
			this.renderizarFiltroPadrao(
				corpo,
				"Filtro padrão",
				() => this.grupo.filtroPadraoKanbanId,
				(id) => (this.grupo.filtroPadraoKanbanId = id)
			);
		});

		criarAcordeao(containerEl, {
			chave: "kanban/cartao",
			titulo: "Cartão do Kanban",
			descricao: "O que aparece embaixo do título de cada tarefa.",
		}).sePreenchido((corpo) =>
			this.renderizarPropriedadesVisiveis(
				corpo,
				"Propriedades visíveis no kanban",
				() => this.grupo.kanbanPropriedadesVisiveis,
				(lista) => (this.grupo.kanbanPropriedadesVisiveis = lista)
			)
		);
	}

	private renderizarPaginaTarefas(containerEl: HTMLElement): void {
		criarAcordeao(containerEl, {
			chave: "tarefas/lista",
			titulo: "Lista de tarefas",
			descricao: "Como a lista abre e o que aparece em cada tarefa.",
			abertoPorPadrao: true,
		}).sePreenchido((corpo) => {
			this.renderizarAgrupamentoPadrao(
				corpo,
				"Agrupamento padrão",
				true,
				true,
				() => this.grupo.agrupamentoPadraoLista,
				(agrupamento) => (this.grupo.agrupamentoPadraoLista = agrupamento)
			);
			this.renderizarFiltroPadrao(
				corpo,
				"Filtro padrão",
				() => this.grupo.filtroPadraoListaId,
				(id) => (this.grupo.filtroPadraoListaId = id)
			);
			this.renderizarPropriedadesVisiveis(
				corpo,
				"Propriedades visíveis na lista",
				() => this.grupo.listaPropriedadesVisiveis,
				(lista) => (this.grupo.listaPropriedadesVisiveis = lista)
			);
		});

		criarAcordeao(containerEl, {
			chave: "tarefas/inbox",
			titulo: "Inbox",
			descricao: "A caixa de entrada da barra lateral.",
		}).sePreenchido((corpo) =>
			this.renderizarPropriedadesVisiveis(
				corpo,
				"Propriedades visíveis no Inbox",
				() => this.grupo.listaInboxPropriedadesVisiveis,
				(lista) => (this.grupo.listaInboxPropriedadesVisiveis = lista)
			)
		);
	}

	// ---------------------------------------------------------------------
	// Área de captura da barra lateral
	// ---------------------------------------------------------------------

	// Só os interruptores da captura. "Campos da captura" e "Presets" são acordeões IRMÃOS na página
	// (ver renderizarPaginaCaptura), não filhos deste — foi a estrutura que ela pediu.
	private renderizarSecaoCaptura(containerEl: HTMLElement): void {
		const captura = this.grupo.captura;

		new Setting(containerEl)
			.setName("Mostrar os campos e presets na captura")
			.setDesc("Desligado, o bloco de demandas fica só com o campo de digitar, igual ao do Inbox.")
			.addToggle((toggle) =>
				toggle.setValue(captura.ativa).onChange(async (valor) => {
					captura.ativa = valor;
					await this.plugin.salvarConfiguracoes();
					this.display();
				})
			);

		if (!captura.ativa) return;

		new Setting(containerEl)
			.setName("Limpar os campos depois de capturar")
			.setDesc(
				"Ligado, cada captura começa do zero. Desligado, os valores escolhidos ficam marcados — bom para cadastrar várias tarefas parecidas em sequência."
			)
			.addToggle((toggle) =>
				toggle.setValue(captura.limparAposCapturar).onChange(async (valor) => {
					captura.limparAposCapturar = valor;
					await this.plugin.salvarConfiguracoes();
				})
			);

		// Só vale quando NADA foi escolhido na captura — campo marcado e preset continuam vencendo.
		new Setting(containerEl)
			.setName("Status inicial das capturas")
			.setDesc(
				'Com que status a tarefa nasce quando você só digita e dá Enter. "Automático" mantém a regra de sempre: com prazo vai para a segunda opção da lista, sem prazo fica no Inbox. Marcar o status na captura ou usar um preset continua vencendo isto.'
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Automático (pelo prazo)");
				for (const opcao of this.grupo.status.opcoes) dropdown.addOption(opcao.valor, opcao.valor);
				dropdown.setValue(captura.statusPadrao ?? "");
				dropdown.onChange(async (valor) => {
					captura.statusPadrao = valor || null;
					await this.plugin.salvarConfiguracoes();
				});
			});
	}

	private renderizarSecaoPresets(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "O preset vence o que estiver marcado nas pastilhas dos campos.",
			cls: "setting-item-description",
		});

		const listaPresets = containerEl.createDiv();
		this.renderizarListaPresetsCaptura(listaPresets);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Novo preset")
				.setCta()
				.onClick(() => {
					new ModalEditarPresetCaptura(this.app, null, this.configEfetiva, async (preset) => {
						this.grupo.captura.presets.push(preset);
						await this.plugin.salvarConfiguracoes();
						this.display();
					}).open();
				})
		);
	}

	// Lista de campos da captura: ligar/desligar, ordenar e escolher a apresentação de cada um.
	// A ordem da lista `campos` é a ordem na tela da captura — por isso as setas.
	private renderizarCamposDaCaptura(container: HTMLElement): void {
		container.empty();

		const captura = this.grupo.captura;
		// A migração normaliza pro formato novo, mas a tela pode abrir antes disso numa config recém
		// carregada — camposDaCaptura cobre os dois formatos.
		const campos = camposDaCaptura(captura);

		// Todos os campos que a captura pode mostrar: os dois fixos, os três de comportamento e as
		// propriedades do grupo. Recorrência só entra com o recurso ligado no grupo — a mesma regra que
		// já a esconde do modal de tarefa e da nota.
		const oferecidos: { id: string; rotulo: string; tipo?: string }[] = [
			{ id: ID_DATA_ACAO, rotulo: this.grupo.dataTarefa.rotulo || "Prazo" },
			{ id: ID_STATUS, rotulo: this.grupo.status.rotulo || "Status" },
			...(this.grupo.recorrenciaAtiva
				? [{ id: ID_RECORRENCIA_ACAO, rotulo: rotuloFixo(this.configEfetiva, "recorrencia") }]
				: []),
			{ id: ID_ANTECEDENCIA_ACAO, rotulo: rotuloFixo(this.configEfetiva, "antecedencia") },
			{ id: ID_MANTER_HISTORICO_ACAO, rotulo: rotuloFixo(this.configEfetiva, "manterHistorico") },
			...this.grupo.propriedades.map((p) => ({ id: p.id, rotulo: p.rotulo, tipo: p.tipo as string })),
		];

		const gravar = async (novos: CampoCaptura[]) => {
			captura.campos = novos;
			// Zera o formato antigo junto: deixar os dois preenchidos criaria duas fontes de verdade.
			captura.camposVisiveis = [];
			captura.camposSemeados = true;
			await this.plugin.salvarConfiguracoes();
			this.renderizarCamposDaCaptura(container);
		};

		// Primeiro os campos ATIVOS, na ordem em que aparecem na captura (com as setas pra reordenar).
		campos.forEach((campo, indice) => {
			const oferecido = oferecidos.find((o) => o.id === campo.id);
			// Campo de uma propriedade que foi apagada depois: não desenha linha (a captura também o
			// ignora), pra não oferecer configuração de algo que não existe mais.
			if (!oferecido) return;

			const setting = new Setting(container).setName(oferecido.rotulo);

			// "Botões" só faz sentido com lista fechada de opções. Texto/lista não têm, e link de
			// arquivo só tem quando ela cadastrou "Arquivos fixos" na propriedade.
			if (this.campoAceitaBotoes(oferecido)) {
				setting.addDropdown((dropdown) => {
					dropdown.addOption("menu", "Lista suspensa");
					dropdown.addOption("botoes", "Botões");
					dropdown.setValue(campo.apresentacao);
					dropdown.onChange(async (valor) => {
						const novos = [...campos];
						novos[indice] = { ...campo, apresentacao: valor as CampoCaptura["apresentacao"] };
						await gravar(novos);
					});
				});
			} else if (oferecido.id === ID_ANTECEDENCIA_ACAO) {
				setting.setDesc("Número de dias digitado na captura. Em branco = sem aviso antecipado.");
			} else {
				setting.setDesc(
					oferecido.tipo === "link_arquivo"
						? 'Sem "Arquivos fixos" cadastrados nesta propriedade — a captura abre a busca no vault.'
						: "Campo de digitação: aparece sempre como lista suspensa."
				);
			}

			setting.addExtraButton((btn) =>
				btn
					.setIcon("arrow-up")
					.setTooltip("Subir")
					.setDisabled(indice === 0)
					.onClick(async () => {
						const novos = [...campos];
						[novos[indice - 1], novos[indice]] = [novos[indice], novos[indice - 1]];
						await gravar(novos);
					})
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("arrow-down")
					.setTooltip("Descer")
					.setDisabled(indice === campos.length - 1)
					.onClick(async () => {
						const novos = [...campos];
						[novos[indice], novos[indice + 1]] = [novos[indice + 1], novos[indice]];
						await gravar(novos);
					})
			);
			setting.addToggle((toggle) =>
				toggle.setValue(true).onChange(async () => {
					await gravar(campos.filter((c) => c.id !== campo.id));
				})
			);
		});

		// Depois os campos DESLIGADOS, pra ela poder ligar. Entram no fim da ordem.
		for (const oferecido of oferecidos) {
			if (campos.some((c) => c.id === oferecido.id)) continue;
			new Setting(container)
				.setName(oferecido.rotulo)
				.setDesc("Não aparece na captura.")
				.addToggle((toggle) =>
					toggle.setValue(false).onChange(async () => {
						await gravar([...campos, { id: oferecido.id, apresentacao: "menu" }]);
					})
				);
		}
	}

	// Um campo pode virar "botões"? Só com lista fechada de opções conhecida de antemão.
	private campoAceitaBotoes(campo: { id: string; tipo?: string }): boolean {
		if (campo.id === ID_STATUS || campo.id === ID_DATA_ACAO) return true;
		// Antecedência é número de dias digitado, não lista de opções — não há o que apresentar em
		// botões, então nem oferece a escolha (ver desenharCampoNumerico em area-captura.ts).
		if (campo.id === ID_ANTECEDENCIA_ACAO) return false;
		// Os dois outros de comportamento têm lista fixa própria (ver opcoesDoCampo em area-captura.ts).
		if (IDS_CAMPOS_COMPORTAMENTO.includes(campo.id)) return true;
		const def = this.grupo.propriedades.find((p) => p.id === campo.id);
		if (!def) return false;
		if (def.tipo === "selecao") return (def.opcoes?.length ?? 0) > 0;
		if (def.tipo === "link_arquivo") return (def.arquivosFixos?.length ?? 0) > 0;
		return false;
	}

	private renderizarListaPresetsCaptura(container: HTMLElement): void {
		container.empty();

		const presets = this.grupo.captura.presets;
		if (presets.length === 0) {
			container.createEl("p", {
				text: "Nenhum preset. A captura continua funcionando pelo Enter, usando as pastilhas acima.",
				cls: "setting-item-description",
			});
			return;
		}

		presets.forEach((preset, indice) => {
			// resumoDoBotao só olha `acoes`, que PresetCaptura e BotaoAcao têm igual — o resumo textual
			// ("Status: Fazer · Prazo: hoje") serve pros dois sem adaptação.
			const setting = new Setting(container).setName(preset.nome).setDesc(this.resumoDoBotao(preset));

			if (preset.icone) {
				setting.settingEl.createDiv({ cls: "mytasks-icone-previa" }, (el) => setIcon(el, preset.icone as string));
			}

			setting.addExtraButton((btn) =>
				btn
					.setIcon("arrow-up")
					.setTooltip("Subir")
					.setDisabled(indice === 0)
					.onClick(() => this.moverPresetCaptura(indice, -1))
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("arrow-down")
					.setTooltip("Descer")
					.setDisabled(indice === presets.length - 1)
					.onClick(() => this.moverPresetCaptura(indice, 1))
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("pencil")
					.setTooltip("Editar")
					.onClick(() => {
						new ModalEditarPresetCaptura(this.app, preset, this.configEfetiva, async (atualizado) => {
							const i = this.grupo.captura.presets.findIndex((p) => p.id === preset.id);
							if (i >= 0) this.grupo.captura.presets[i] = atualizado;
							await this.plugin.salvarConfiguracoes();
							this.display();
						}).open();
					})
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("trash")
					.setTooltip("Excluir")
					.onClick(async () => {
						if (!confirm(`Excluir o preset "${preset.nome}"?`)) return;
						this.grupo.captura.presets = this.grupo.captura.presets.filter((p) => p.id !== preset.id);
						await this.plugin.salvarConfiguracoes();
						this.display();
					})
			);
			setting.addToggle((toggle) =>
				toggle.setValue(preset.visivel).onChange(async (valor) => {
					preset.visivel = valor;
					await this.plugin.salvarConfiguracoes();
				})
			);
		});
	}

	private async moverPresetCaptura(indice: number, direcao: -1 | 1): Promise<void> {
		const destino = indice + direcao;
		const lista = this.grupo.captura.presets;
		if (destino < 0 || destino >= lista.length) return;
		[lista[indice], lista[destino]] = [lista[destino], lista[indice]];
		await this.plugin.salvarConfiguracoes();
		this.display();
	}

	// Página "Captura": tudo que tem a ver com CRIAR uma tarefa — a nota que ela ganha e a área de
	// captura da barra lateral. Ordem pedida por ela.
	private renderizarPaginaCaptura(containerEl: HTMLElement): void {
		criarAcordeao(containerEl, {
			chave: "captura/nota",
			titulo: "Nota da tarefa",
			descricao: 'O que aparece na nota criada ao clicar em "Nova tarefa" (Kanban, Lista e Calendário).',
		}).sePreenchido((corpo) => this.renderizarSecaoNotaDaTarefa(corpo));

		criarAcordeao(containerEl, {
			chave: "captura/rapida",
			titulo: "Captura rápida",
			descricao: "A área no topo da barra lateral onde você digita uma tarefa e dá Enter.",
		}).sePreenchido((corpo) => this.renderizarSecaoCaptura(corpo));

		criarAcordeao(containerEl, {
			chave: "captura/campos",
			titulo: "Campos da captura",
			descricao:
				'Aparecem embaixo do campo de texto, na ordem definida aqui. "Lista suspensa" mostra uma pastilha só; "Botões" mostra todas as opções na tela.',
		}).sePreenchido((corpo) => this.renderizarCamposDaCaptura(corpo.createDiv()));

		criarAcordeao(containerEl, {
			chave: "captura/presets",
			titulo: "Presets",
			descricao: "Botões de um clique: digite o título e clique no preset para criar a tarefa já com os valores dele.",
		}).sePreenchido((corpo) => this.renderizarSecaoPresets(corpo));
	}

	// Controla o que aparece na nota criada por "Nova tarefa" (Kanban/Lista/Calendário deixaram de abrir o
	// modal de formulário). Sem nota modelo configurada, o corpo é gerado automaticamente com os campos
	// visíveis abaixo; com nota modelo, o corpo dessa nota é copiado como está.
	private renderizarSecaoNotaDaTarefa(containerEl: HTMLElement): void {
		this.renderizarNotaModelo(
			containerEl,
			"Nota modelo",
			'Escolha uma nota do vault pra servir de modelo: "Nova tarefa" copia o corpo dela pra dentro da tarefa nova (o frontmatter da nota modelo é ignorado). Deixe em branco pra usar a geração automática com os campos abaixo.',
			() => this.grupo.templateNota.notaModeloCaminho ?? null,
			(caminho) => (this.grupo.templateNota.notaModeloCaminho = caminho)
		);
		this.renderizarNotaModelo(
			containerEl,
			"Nota modelo (Inbox)",
			'Opcional: nota modelo exclusiva pra tarefas que nascem no Inbox (criadas sem data). Quando preenchida, tem prioridade sobre a "Nota modelo" acima só pro Inbox. Em branco = o Inbox usa a "Nota modelo" acima (ou a geração automática).',
			() => this.grupo.templateNota.notaModeloInboxCaminho ?? null,
			(caminho) => (this.grupo.templateNota.notaModeloInboxCaminho = caminho)
		);

		// Um acordeão aninhado por bloco de opções, como ela pediu ("os acordeaos com cada opção de
		// configuração").
		criarAcordeao(containerEl, {
			chave: "captura/nota/campos",
			titulo: "Campos",
			descricao: this.grupo.templateNota.notaModeloCaminho
				? "Sem efeito na nota modelo em si, que é copiada como está."
				: "Quais campos entram no corpo gerado automaticamente.",
			aninhado: true,
		}).sePreenchido((corpo) => this.renderizarCamposTemplateNota(corpo));

		criarAcordeao(containerEl, {
			chave: "captura/nota/status",
			titulo: this.grupo.status.rotulo,
			aninhado: true,
		}).sePreenchido((corpo) =>
			this.renderizarOpcoesTemplateNota(
				corpo,
				`Opções visíveis de ${this.grupo.status.rotulo}`,
				this.grupo.status.opcoes.map((o) => ({ valor: o.valor, rotulo: o.valor })),
				() => this.grupo.templateNota.opcoesStatusVisiveis,
				(lista) => (this.grupo.templateNota.opcoesStatusVisiveis = lista)
			)
		);

		if (this.grupo.recorrenciaAtiva) {
			criarAcordeao(containerEl, {
				chave: "captura/nota/recorrencia",
				titulo: "Recorrência",
				aninhado: true,
			}).sePreenchido((corpo) =>
				this.renderizarOpcoesTemplateNota(
					corpo,
					"Opções visíveis de Recorrência",
					(Object.keys(RECORRENCIA_LABELS) as Recorrencia[]).map((chave) => ({ valor: chave, rotulo: RECORRENCIA_LABELS[chave] })),
					() => this.grupo.templateNota.opcoesRecorrenciaVisiveis,
					(lista) => (this.grupo.templateNota.opcoesRecorrenciaVisiveis = lista as Recorrencia[] | undefined)
				)
			);
		}

		const propriedadesSelecao = [...this.grupo.propriedades]
			.filter((p) => p.tipo === "selecao")
			.sort((a, b) => a.ordem - b.ordem);
		for (const def of propriedadesSelecao) {
			criarAcordeao(containerEl, {
				// Chaveado pelo ID da propriedade (não pelo índice): renomear ou reordenar não embaralha
				// qual seção estava aberta.
				chave: `captura/nota/prop/${def.id}`,
				titulo: def.rotulo,
				aninhado: true,
			}).sePreenchido((corpo) =>
				this.renderizarOpcoesTemplateNota(
					corpo,
					`Opções visíveis de ${def.rotulo}`,
					(def.opcoes ?? []).map((o) => ({ valor: o.valor, rotulo: o.valor })),
					() => this.grupo.templateNota.opcoesPropriedadeVisiveis?.[def.id],
					(lista) => {
						const atual = this.grupo.templateNota.opcoesPropriedadeVisiveis ?? {};
						if (lista === undefined) delete atual[def.id];
						else atual[def.id] = lista;
						this.grupo.templateNota.opcoesPropriedadeVisiveis = atual;
					}
				)
			);
		}
	}

	// Campo de busca (mesmo autocomplete usado pra "link de arquivo" livre no modal de tarefa) pra escolher
	// uma nota qualquer do vault como modelo — "Nova tarefa" passa a copiar o CORPO dela, ao invés de gerar
	// o corpo automaticamente. Parametrizado pra servir tanto à modelo geral quanto à exclusiva do Inbox.
	private renderizarNotaModelo(
		container: HTMLElement,
		nome: string,
		descricao: string,
		obter: () => string | null,
		definir: (caminho: string | null) => void
	): void {
		const setting = new Setting(container).setClass("mytasks-nota-modelo-busca").setName(nome).setDesc(descricao);

		setting.addSearch((search) => {
			const caminhoAtual = obter();
			if (caminhoAtual) {
				const arquivoAtual = this.app.vault.getAbstractFileByPath(caminhoAtual);
				search.setValue(arquivoAtual?.name.replace(/\.md$/, "") ?? caminhoAtual);
			}
			new SugestorArquivos(this.app, search.inputEl, async (arquivo) => {
				definir(arquivo.path);
				await this.plugin.salvarConfiguracoes();
				this.display();
			});
			search.inputEl.addEventListener("input", async () => {
				if (search.inputEl.value) return;
				definir(null);
				await this.plugin.salvarConfiguracoes();
				this.display();
			});
		});
	}

	// Chaves técnicas (frontmatter) dos campos fixos do plugin — renomear aqui reescreve automaticamente
	// as tarefas já existentes que usam a chave antiga (RepositorioTarefas.renomearChaveFrontmatter).
	// Era a página "Avançado"; virou um acordeão aninhado dentro de "Nomenclatura das propriedades".
	private renderizarChavesFixas(containerEl: HTMLElement): void {
		const acordeao = criarAcordeao(containerEl, {
			chave: "geral/nomenclatura/chaves",
			titulo: "Chaves técnicas do frontmatter",
			descricao:
				"Nome técnico de cada campo fixo. Renomear reescreve automaticamente as tarefas já criadas que usam a chave antiga — pede confirmação antes.",
			aninhado: true,
		});
		acordeao.sePreenchido((corpo) => this.renderizarCamposDeChavesFixas(corpo));
	}

	private renderizarCamposDeChavesFixas(containerEl: HTMLElement): void {
		this.renderizarCampoChaveFixa(
			containerEl,
			`Chave de "${this.grupo.status.rotulo || "Status"}"`,
			() => this.grupo.status.chave || "status",
			(chave) => (this.grupo.status.chave = chave)
		);

		const camposChavesFixas: { titulo: string; chave: keyof GrupoTarefas["chavesFixas"] }[] = [
			{ titulo: "Horário", chave: "horario" },
			{ titulo: "Recorrência", chave: "recorrencia" },
			{ titulo: "Repetir até", chave: "recorrenciaDataFim" },
			{ titulo: "Avisar com antecedência", chave: "antecedencia" },
			{ titulo: "Manter registro ao concluir", chave: "manterHistorico" },
			{ titulo: "Data de entrada", chave: "entrada" },
			{ titulo: "Status anterior (uso interno — recorrência)", chave: "statusAnterior" },
			{ titulo: "Ocorrência anterior (uso interno — recorrência)", chave: "ocorrenciaAnterior" },
			{ titulo: "Próxima ocorrência (uso interno — recorrência)", chave: "proximaOcorrencia" },
		];
		for (const campo of camposChavesFixas) {
			this.renderizarCampoChaveFixa(
				containerEl,
				`Chave de "${campo.titulo}"`,
				() => this.grupo.chavesFixas[campo.chave],
				(chave) => (this.grupo.chavesFixas[campo.chave] = chave)
			);
		}
	}

	// Campo de texto de uma chave técnica renomeável, com migração automática no vault. Dispara no BLUR
	// (não a cada tecla, diferente do campo antigo de "Nome do campo" da Data) — evita reescrever o vault
	// dezenas de vezes durante a digitação — e pede confirmação antes, mesmo padrão já usado no rename de
	// propriedade customizada (ModalEditarPropriedade). `migrar` é opcional: por padrão usa o repositório
	// do grupo atual; o discriminador de grupo passa uma versão que cobre todos os grupos.
	private renderizarCampoChaveFixa(
		container: HTMLElement,
		titulo: string,
		obterAtual: () => string,
		definir: (chave: string) => void,
		migrar?: (chaveAntiga: string, chaveNova: string) => Promise<number>
	): void {
		new Setting(container).setName(titulo).addText((text) => {
			text.setValue(obterAtual());
			text.inputEl.addEventListener("blur", async () => {
				const chaveAntiga = obterAtual();
				const chaveNova = normalizarChave(text.inputEl.value);
				if (!chaveNova || chaveNova === chaveAntiga) {
					text.setValue(chaveAntiga);
					return;
				}
				const confirmado = confirm(
					`Renomear a chave "${chaveAntiga}" para "${chaveNova}"? Isso reescreve o frontmatter de todas as tarefas existentes que usam essa chave.`
				);
				if (!confirmado) {
					text.setValue(chaveAntiga);
					return;
				}
				const migrarFn =
					migrar ?? ((antiga: string, nova: string) => this.plugin.repositorioDoGrupo(this.grupo.id).renomearChaveFrontmatter(antiga, nova));
				const migrados = await migrarFn(chaveAntiga, chaveNova);
				definir(chaveNova);
				await this.plugin.salvarConfiguracoes();
				new Notice(`Chave renomeada em ${migrados} tarefa(s).`);
			});
		});
	}

	// Liga/desliga campos inteiros (Status, Prazo, Horário... + cada propriedade customizada) na nota nova.
	// Mesmo padrão de "null = valores padrão" já usado em renderizarPropriedadesVisiveis, com outra fonte de
	// itens — aqui o padrão exclui "Repetir até" (ver idsTemplateNotaVisiveisPorPadrao), não é "tudo".
	private renderizarCamposTemplateNota(container: HTMLElement): void {
		const camposFixos = this.grupo.recorrenciaAtiva
			? CAMPOS_TEMPLATE_NOTA_FIXOS
			: CAMPOS_TEMPLATE_NOTA_FIXOS.filter((c) => c.id !== "recorrencia" && c.id !== "repetir_ate");
		const itens: { id: string; rotulo: string }[] = [
			...camposFixos,
			...[...this.grupo.propriedades].sort((a, b) => a.ordem - b.ordem).map((def) => ({ id: def.id, rotulo: def.rotulo })),
		];
		const padrao = idsTemplateNotaVisiveisPorPadrao(this.configEfetiva);

		new Setting(container)
			.setName("Campos na nota nova")
			.setDesc(
				'Como cada campo aparece quando você clica em "Nova tarefa". "Sempre" = nasce gravado no frontmatter. ' +
					'"Opcional" = não nasce; você adiciona depois clicando no botão "adicionar" que aparece na seção de códigos abaixo. ' +
					'"Oculto" = não aparece. "Repetir até" nasce oculto — só faz sentido depois de definir uma Recorrência.'
			);

		const caixa = container.createDiv({ cls: "mytasks-cores-caixa" });
		for (const item of itens) {
			const visivel = campoVisivelNaNota(this.configEfetiva, item.id);
			const opcional = campoEhOpcional(this.configEfetiva, item.id);
			const setting = new Setting(caixa).setName(item.rotulo);

			if (!campoPodeSerOpcional(item.id)) {
				// Campos essenciais (status/prazo) ou sem chave (botão): só ligam/desligam, não viram opcionais.
				setting.addToggle((toggle) =>
					toggle.setValue(visivel).onChange(async (valor) => {
						this.definirVisibilidadeCampoTemplate(item.id, valor, padrao);
						await this.plugin.salvarConfiguracoes();
					})
				);
				continue;
			}

			const estado: "sempre" | "opcional" | "oculto" = !visivel ? "oculto" : opcional ? "opcional" : "sempre";
			setting.addDropdown((dropdown) => {
				dropdown.addOption("sempre", "Sempre");
				dropdown.addOption("opcional", "Opcional");
				dropdown.addOption("oculto", "Oculto");
				dropdown.setValue(estado).onChange(async (valor) => {
					this.definirVisibilidadeCampoTemplate(item.id, valor !== "oculto", padrao);
					this.definirCampoOpcionalTemplate(item.id, valor === "opcional");
					await this.plugin.salvarConfiguracoes();
				});
			});
		}
	}

	// Liga/desliga um campo na lista camposVisiveis (colapsando de volta pra null quando bate o padrão de
	// fábrica, pra não persistir uma lista redundante). `padrao` é idsTemplateNotaVisiveisPorPadrao.
	private definirVisibilidadeCampoTemplate(id: string, visivel: boolean, padrao: string[]): void {
		const base = this.grupo.templateNota.camposVisiveis ?? padrao;
		const nova = visivel ? [...new Set([...base, id])] : base.filter((x) => x !== id);
		const ehIgualAoPadrao = nova.length === padrao.length && padrao.every((x) => nova.includes(x));
		this.grupo.templateNota.camposVisiveis = ehIgualAoPadrao ? null : nova;
	}

	// Marca/desmarca um campo como opcional (não pré-gravado). Lista vazia é normalizada pra undefined,
	// pra não persistir um array vazio à toa (mesmo princípio null-means-nothing das outras listas).
	private definirCampoOpcionalTemplate(id: string, opcional: boolean): void {
		const base = this.grupo.templateNota.camposOpcionais ?? [];
		const nova = opcional ? [...new Set([...base, id])] : base.filter((x) => x !== id);
		this.grupo.templateNota.camposOpcionais = nova.length > 0 ? nova : undefined;
	}

	// Restringe quais opções aparecem dentro de um campo de opção fixa (Status/Seleção/Recorrência) na
	// nota nova. `undefined` = todas visíveis (mesmo princípio de null-means-all, mas aqui undefined
	// porque essas listas — diferente de camposVisiveis — nascem ausentes, não uma lista vazia).
	private renderizarOpcoesTemplateNota(
		container: HTMLElement,
		titulo: string,
		opcoes: { valor: string; rotulo: string }[],
		obterAtual: () => string[] | undefined,
		definir: (lista: string[] | undefined) => void
	): void {
		const todosOsValores = opcoes.map((o) => o.valor);

		new Setting(container).setName(titulo).setDesc("Escolha quais opções desse campo aparecem na nota nova.");

		const caixa = container.createDiv({ cls: "mytasks-cores-caixa" });
		for (const opcao of opcoes) {
			const atual = obterAtual();
			const marcado = atual === undefined || atual.includes(opcao.valor);
			new Setting(caixa).setName(opcao.rotulo).addToggle((toggle) =>
				toggle.setValue(marcado).onChange(async (valor) => {
					const base = obterAtual() ?? todosOsValores;
					const nova = valor ? [...new Set([...base, opcao.valor])] : base.filter((v) => v !== opcao.valor);
					definir(nova.length === todosOsValores.length ? undefined : nova);
					await this.plugin.salvarConfiguracoes();
				})
			);
		}
	}

	private renderizarAgrupamentoPadrao(
		container: HTMLElement,
		titulo: string,
		permitirNenhum: boolean,
		permitirDia: boolean,
		obterAtual: () => TipoAgrupamento,
		definir: (agrupamento: TipoAgrupamento) => void,
		descricao = "Agrupamento com que esta tela abre sempre que você a acessa."
	) {
		const opcoes = opcoesDeAgrupamento(this.configEfetiva, permitirNenhum, permitirDia);
		new Setting(container)
			.setName(titulo)
			.setDesc(descricao)
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

	// Cada filtro salvo é um acordeão; dentro dele, o nome e outro acordeão com as condições.
	// Sem modal: editar acontece na própria página (pedido dela).
	private renderizarPaginaFiltros(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Filtros pré-configurados, escolhíveis direto na barrinha de Filtro da Lista e do Kanban (sidebar e aba de tela cheia). Diferente das Visualizações salvas, que servem para embutir em notas.",
			cls: "setting-item-description",
		});

		for (const filtro of this.grupo.filtrosSalvos) {
			this.renderizarItemFiltro(containerEl, filtro);
		}

		// Botão solto, sem o `new Setting(...)` em volta: aquele container desenha a moldura de linha
		// de configuração (o retângulo), que aqui não tem rótulo nenhum pra justificá-la.
		const botaoNovo = containerEl.createEl("button", {
			text: "+ Novo filtro",
			cls: "mod-cta mytasks-botao-solto",
		});
		botaoNovo.addEventListener("click", async () => {
			// Nasce já salvo e com o acordeão ABERTO: sem modal, criar e editar são o mesmo
			// gesto — ela nomeia e monta as condições ali mesmo.
			const novo: FiltroSalvo = { id: gerarIdFiltro(), nome: "Novo filtro", raiz: grupoFiltroVazio() };
			this.grupo.filtrosSalvos.push(novo);
			abrirAcordeao(`filtros/${novo.id}`);
			await this.plugin.salvarConfiguracoes();
			this.display();
		});
	}

	private renderizarItemFiltro(container: HTMLElement, filtro: FiltroSalvo) {
		const acordeao = criarAcordeao(container, {
			// Chaveado pelo ID (não pelo índice): renomear ou excluir outro filtro não embaralha
			// qual acordeão estava aberto.
			chave: `filtros/${filtro.id}`,
			titulo: filtro.nome,
		});

		acordeao.sePreenchido((corpo) => {
			// Retrato do filtro no momento em que a seção foi aberta, pro "Desfazer alterações". Como
			// não há mais modal, as mudanças gravam na hora — este é o único jeito de voltar atrás.
			// Fica guardado por ID e só é (re)tirado quando ainda não existe um: `sePreenchido` roda de
			// novo a cada `display()` (ou seja, a cada gravação), e retirar o retrato ali por cima
			// congelaria o estado JÁ alterado, tornando o botão inútil.
			if (!this.retratosDeFiltro.has(filtro.id)) {
				this.retratosDeFiltro.set(filtro.id, { nome: filtro.nome, raiz: clonarGrupoFiltro(filtro.raiz) });
			}

			new Setting(corpo).setName("Nome").addText((text) => {
				text.setValue(filtro.nome);
				// Grava no BLUR, não a cada tecla: o título do acordeão vem do nome, e redesenhar a
				// cada letra faria o campo perder o foco no meio da digitação.
				text.inputEl.addEventListener("blur", async () => {
					const novo = text.inputEl.value.trim();
					if (!novo || novo === filtro.nome) {
						text.setValue(filtro.nome);
						return;
					}
					filtro.nome = novo;
					await this.plugin.salvarConfiguracoes();
					this.display();
				});
			});

			criarAcordeao(corpo, {
				chave: `filtros/${filtro.id}/condicoes`,
				titulo: "Condições",
				aninhado: true,
			}).sePreenchido((corpoCondicoes) => {
				const divFiltro = corpoCondicoes.createDiv({ cls: "mytasks-construtor-filtro-card" });
				new ConstrutorFiltro(divFiltro, {
					app: this.app,
					configuracoes: this.configEfetiva,
					repositorio: this.plugin.repositorioDoGrupo(this.grupo.id),
					raizInicial: filtro.raiz,
					// Grava direto no filtro salvo — sem botão "Salvar", que só existia por causa do
					// modal. O construtor devolve a raiz inteira a cada mudança.
					aoMudar: async (raiz) => {
						filtro.raiz = raiz;
						await this.plugin.salvarConfiguracoes();
					},
				});
			});

			const acoes = new Setting(corpo);

			// Só aparece quando há de fato o que desfazer — um botão permanentemente inerte só ocupa
			// espaço e faz duvidar se ele funciona.
			const retrato = this.retratosDeFiltro.get(filtro.id);
			const mudou =
				retrato !== undefined &&
				(retrato.nome !== filtro.nome || JSON.stringify(retrato.raiz) !== JSON.stringify(filtro.raiz));
			if (mudou) {
				acoes.addButton((btn) =>
					btn.setButtonText("Desfazer alterações").onClick(async () => {
						filtro.nome = retrato.nome;
						filtro.raiz = clonarGrupoFiltro(retrato.raiz);
						await this.plugin.salvarConfiguracoes();
						this.display();
					})
				);
			}

			acoes.addButton((btn) =>
				btn
					.setButtonText("Excluir filtro")
					.setWarning()
					.onClick(async () => {
						if (!confirm(`Excluir filtro "${filtro.nome}"?`)) return;
						this.grupo.filtrosSalvos = this.grupo.filtrosSalvos.filter((f) => f.id !== filtro.id);
						this.retratosDeFiltro.delete(filtro.id);
						await this.plugin.salvarConfiguracoes();
						this.display();
					})
			);
		});
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

	// ---------------------------------------------------------------------
	// Botões de ação (menu do clique direito no cartão da tarefa)
	// ---------------------------------------------------------------------

	private renderizarSecaoBotoesAcao(containerEl: HTMLElement): void {
		// Sem h3 próprio: o título vem do acordeão que envolve esta seção (ver renderizarPaginaGeral).
		containerEl.createEl("p", {
			text: "Botões que aparecem ao clicar com o botão direito em cima de uma tarefa, no Kanban, no Calendário e na Lista. Cada botão pode alterar um ou vários campos de uma vez.",
			cls: "setting-item-description",
		});

		const listaBotoes = containerEl.createDiv();
		this.renderizarListaBotoesAcao(listaBotoes);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Novo botão")
				.setCta()
				.onClick(() => {
					new ModalEditarBotaoAcao(this.app, null, this.configEfetiva, async (botao) => {
						this.grupo.botoesAcao.push(botao);
						await this.plugin.salvarConfiguracoes();
						this.display();
					}).open();
				})
		);

		containerEl.createEl("h4", { text: "Ações prontas" });
		containerEl.createEl("p", {
			text: "Ações que já vêm com o plugin. Você não muda o que elas fazem, mas pode escondê-las ou trocar o nome que aparece no menu.",
			cls: "setting-item-description",
		});

		for (const id of ORDEM_ACOES_FIXAS) {
			const config = this.grupo.acoesFixas[id];
			const setting = new Setting(containerEl);
			setting.settingEl.createDiv({ cls: "mytasks-icone-previa" }, (el) => setIcon(el, ICONES_ACOES_FIXAS[id]));
			setting
				.setName(DESCRICOES_ACOES_FIXAS[id])
				.addText((text) =>
					text
						.setPlaceholder(ACOES_FIXAS_PADRAO[id].nome)
						.setValue(config.nome)
						.onChange(async (valor) => {
							// Nome em branco volta pro padrão em vez de virar um item invisível no menu.
							config.nome = valor.trim() || ACOES_FIXAS_PADRAO[id].nome;
							await this.plugin.salvarConfiguracoes();
						})
				)
				.addToggle((toggle) =>
					toggle.setValue(config.visivel).onChange(async (valor) => {
						config.visivel = valor;
						await this.plugin.salvarConfiguracoes();
					})
				);
		}
	}

	private renderizarListaBotoesAcao(container: HTMLElement): void {
		container.empty();

		if (this.grupo.botoesAcao.length === 0) {
			container.createEl("p", {
				text: "Nenhum botão criado. Sem botões (e sem as ações prontas abaixo), o clique direito não abre menu nenhum.",
				cls: "setting-item-description",
			});
			return;
		}

		this.grupo.botoesAcao.forEach((botao, indice) => {
			const setting = new Setting(container).setName(botao.nome).setDesc(this.resumoDoBotao(botao));

			// Mesmo ícone que vai aparecer no menu, na frente do nome — dá pra conferir a lista inteira
			// sem abrir o editor de cada botão.
			if (botao.icone) {
				setting.settingEl.createDiv({ cls: "mytasks-icone-previa" }, (el) => setIcon(el, botao.icone as string));
			}

			setting.addExtraButton((btn) =>
				btn
					.setIcon("arrow-up")
					.setTooltip("Subir")
					.setDisabled(indice === 0)
					.onClick(() => this.moverBotaoAcao(indice, -1))
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("arrow-down")
					.setTooltip("Descer")
					.setDisabled(indice === this.grupo.botoesAcao.length - 1)
					.onClick(() => this.moverBotaoAcao(indice, 1))
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("pencil")
					.setTooltip("Editar")
					.onClick(() => {
						new ModalEditarBotaoAcao(this.app, botao, this.configEfetiva, async (atualizado) => {
							const i = this.grupo.botoesAcao.findIndex((b) => b.id === botao.id);
							if (i >= 0) this.grupo.botoesAcao[i] = atualizado;
							await this.plugin.salvarConfiguracoes();
							this.display();
						}).open();
					})
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("trash")
					.setTooltip("Excluir")
					.onClick(async () => {
						if (!confirm(`Excluir o botão "${botao.nome}"?`)) return;
						this.grupo.botoesAcao = this.grupo.botoesAcao.filter((b) => b.id !== botao.id);
						await this.plugin.salvarConfiguracoes();
						this.display();
					})
			);
			// O toggle vem por último pra ficar na ponta direita da linha, separado dos ícones.
			setting.addToggle((toggle) =>
				toggle
					.setTooltip("Mostrar no menu")
					.setValue(botao.visivel)
					.onChange(async (valor) => {
						botao.visivel = valor;
						await this.plugin.salvarConfiguracoes();
					})
			);
		});
	}

	// Descreve em texto o que o botão faz, pra ela conferir na lista sem abrir o modal de cada um.
	// Recebe qualquer coisa que tenha `acoes` — serve tanto pros botões do clique direito quanto pros
	// presets de captura, que compartilham o modelo AcaoBotao.
	private resumoDoBotao(botao: { acoes: AcaoBotao[] }): string {
		const config = this.configEfetiva;
		const partes = botao.acoes.map((acao) => {
			const rotulo =
				acao.campo === ID_STATUS
					? config.status.rotulo || "Status"
					: acao.campo === ID_DATA_ACAO
						? config.dataTarefa.rotulo || "Prazo"
						: config.propriedades.find((p) => p.id === acao.campo)?.rotulo ?? acao.campo;

			if (acao.modo === "limpar") return `${rotulo}: limpar`;
			if (acao.modo === "hoje") return `${rotulo}: hoje`;
			if (acao.modo === "dias") {
				const dias = acao.dias ?? 0;
				if (dias === 1) return `${rotulo}: amanhã`;
				if (dias === 0) return `${rotulo}: hoje`;
				if (dias < 0) return `${rotulo}: ${Math.abs(dias)} dia(s) atrás`;
				return `${rotulo}: daqui a ${dias} dia(s)`;
			}
			return `${rotulo}: ${acao.valor || "(vazio)"}`;
		});
		return partes.length > 0 ? partes.join(" · ") : "Sem ações — não faz nada";
	}

	private async moverBotaoAcao(indice: number, direcao: -1 | 1): Promise<void> {
		const destino = indice + direcao;
		if (destino < 0 || destino >= this.grupo.botoesAcao.length) return;
		const lista = this.grupo.botoesAcao;
		[lista[indice], lista[destino]] = [lista[destino], lista[indice]];
		await this.plugin.salvarConfiguracoes();
		this.display();
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
							migrarReferenciasPropriedade(this.grupo, propriedade.id, atualizada.id);
							const indice = this.grupo.propriedades.findIndex(
								(p) => p.id === propriedade.id
							);
							if (indice >= 0) this.grupo.propriedades[indice] = atualizada;
							await this.plugin.salvarConfiguracoes();
							this.display();
						},
						this.plugin.repositorioDoGrupo(this.grupo.id),
						this.grupo.propriedades
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
		if (obterOpcoes().length === 0) {
			const caixaVazia = container.createDiv({ cls: "mytasks-cores-caixa" });
			caixaVazia.createEl("p", {
				text: "Cadastre ao menos uma opção com cor acima para poder usá-la como destaque visual da tarefa.",
				cls: "setting-item-description",
			});
			return;
		}

		// Divisória de seção antes de "Destaque colorido", igual às demais seções da página (Data de conclusão etc.).
		container.createEl("hr", { cls: "mytasks-config-divisoria" });
		const caixa = container.createDiv({ cls: "mytasks-cores-caixa" });
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
						raiz: clonarGrupoFiltro(visualizacao.raiz),
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
		const nomes: Record<string, string> = { lista: "Lista", calendario: "Calendário", kanban: "kanban" };
		const partes = [nomes[visualizacao.tipoView] ?? visualizacao.tipoView];

		if (visualizacao.tipoView === "calendario" && visualizacao.modoCalendario) {
			partes.push(ROTULOS_MODO[visualizacao.modoCalendario as ModoCalendario]);
		} else if (visualizacao.agrupamento) {
			partes.push(`agrupado por ${rotuloAgrupamento(visualizacao.agrupamento, this.configEfetiva)}`);
		}

		const quantidade = contarCondicoes(visualizacao.raiz);
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
