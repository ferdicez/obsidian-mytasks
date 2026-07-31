import { Menu, getIconIds, setIcon } from "obsidian";
import { ConfigEfetivaGrupo, ID_STATUS, TipoAgrupamento } from "./tipos";

// Desenha o primeiro ícone que EXISTE nesta versão do Obsidian. A biblioteca Lucide embutida varia
// com a versão do app: um nome adicionado ao Lucide recentemente (ex: "grid-2x2-plus") simplesmente
// não é registrado em builds mais antigas, e `setIcon` falha em SILÊNCIO — o botão fica vazio, sem
// erro no console. Testar antes e cair pra uma alternativa antiga evita o botão invisível.
function desenharIconeComAlternativas(elemento: HTMLElement, nomes: string[]): void {
	const registrados = new Set(getIconIds());
	// getIconIds() devolve os ids já registrados, que incluem o prefixo "lucide-" nas versões em que
	// os ícones do Lucide são registrados com ele — por isso os dois testes.
	const escolhido = nomes.find((n) => registrados.has(n) || registrados.has(`lucide-${n}`));
	setIcon(elemento, escolhido ?? nomes[nomes.length - 1]);
}

export interface OpcoesSeletorAgrupamento {
	configuracoes: ConfigEfetivaGrupo;
	agrupamentoAtual: TipoAgrupamento;
	permitirNenhum: boolean;
	permitirDia: boolean;
	aoEscolher: (agrupamento: TipoAgrupamento) => void;
	// Elemento cuja borda esquerda define onde o menu abre (ex: o cabeçalho inteiro, pra descer sempre
	// alinhado com o início da coluna, independente de qual botão foi clicado). Sem isso, usa o próprio botão.
	elementoAlinhamento?: HTMLElement;
	// "abas" desenha as opções lado a lado num bloco único (igual às visualizações do Calendário),
	// em vez do botão com menu suspenso. Só vale quando a lista de opções é curta.
	apresentacao?: "menu" | "abas";
	// Ícone do botão na apresentação "menu". Ausente = "layout-grid" (agrupamento principal). Aceita
	// uma LISTA em ordem de preferência: o primeiro que existir na versão do Obsidian é usado (ver
	// desenharIconeComAlternativas). O subagrupamento do Kanban pede "grid-2x2-plus" e cai em
	// alternativas mais antigas quando ele não existe.
	icone?: string | string[];
	// Rótulo de acessibilidade e título do menu. Ausente = "Agrupamento".
	rotulo?: string;
	// Esconde da lista o agrupamento já usado pelas colunas — subdividir uma coluna pela MESMA
	// propriedade que a define renderia uma seção só, então a opção nem deve ser oferecida.
	// É uma FUNÇÃO, não um valor: o agrupamento das colunas muda pelas abas sem o cabeçalho ser
	// redesenhado (o Kanban chama renderizarGrade pra não piscar), então um valor capturado na
	// construção envelheceria e o menu passaria a esconder a opção errada.
	excluir?: () => TipoAgrupamento | undefined;
}

export function rotuloAgrupamento(agrupamento: TipoAgrupamento, configuracoes: ConfigEfetivaGrupo): string {
	if (agrupamento === "nenhum") return "nenhum";
	if (agrupamento === "dia") return "por dia";
	if (agrupamento === ID_STATUS) return configuracoes.status.rotulo || "status";
	return configuracoes.propriedades.find((p) => p.id === agrupamento)?.rotulo ?? agrupamento;
}

export function opcoesDeAgrupamento(
	configuracoes: ConfigEfetivaGrupo,
	permitirNenhum: boolean,
	permitirDia: boolean
): TipoAgrupamento[] {
	const lista: TipoAgrupamento[] = [];
	if (permitirNenhum) lista.push("nenhum");
	if (permitirDia) lista.push("dia");
	lista.push(ID_STATUS);
	for (const def of configuracoes.propriedades) {
		// "lista" (várias tags por tarefa) e "data" ficam de fora — cada tarefa poderia entrar em
		// vários grupos ao mesmo tempo, ou já tem um jeito próprio de agrupar (agrupamento "por dia").
		if (def.tipo === "selecao" || def.tipo === "texto" || def.tipo === "link_arquivo") lista.push(def.id);
	}
	return lista;
}

export class SeletorAgrupamento {
	// Só existe na apresentação "menu"; em "abas" o seletor desenha uma pastilha por opção.
	private botao: HTMLButtonElement | null = null;
	// Só preenchido na apresentação "abas": permite mover a marcação de ativa sem redesenhar tudo.
	private abas = new Map<TipoAgrupamento, HTMLButtonElement>();
	private agrupamentoAtual: TipoAgrupamento;

	constructor(private container: HTMLElement, private opcoes: OpcoesSeletorAgrupamento) {
		this.agrupamentoAtual = opcoes.agrupamentoAtual;

		if (opcoes.apresentacao === "abas") {
			this.desenharAbas();
			return;
		}

		this.botao = container.createEl("button", {
			cls: "mytasks-seletor-discreto mytasks-seletor-so-icone",
			attr: { "aria-label": opcoes.rotulo ?? "Agrupamento" },
		});
		const icone = this.botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		const nomes = opcoes.icone ? (Array.isArray(opcoes.icone) ? opcoes.icone : [opcoes.icone]) : ["layout-grid"];
		desenharIconeComAlternativas(icone, nomes);
		const chevron = this.botao.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
		setIcon(chevron, "chevrons-up-down");

		this.botao.addEventListener("click", () => this.abrirMenu());
	}

	// Mesmo bloco visual das visualizações do Calendário: container cinza único, a opção ativa
	// virando uma pastilha clara. Reusa as classes .mytasks-calendario-abas-modo/-aba-modo.
	private desenharAbas(): void {
		const abas = this.container.createDiv({
			cls: "mytasks-calendario-abas-modo mytasks-abas-agrupamento",
		});

		for (const agrupamento of this.opcoesValidas()) {
			const aba = abas.createEl("button", {
				cls: "mytasks-calendario-aba-modo",
				text: rotuloAgrupamento(agrupamento, this.opcoes.configuracoes),
			});
			this.abas.set(agrupamento, aba);
			if (agrupamento === this.agrupamentoAtual) aba.addClass("mytasks-calendario-aba-modo-ativa");
			aba.addEventListener("click", () => {
				if (agrupamento === this.agrupamentoAtual) return;
				this.agrupamentoAtual = agrupamento;
				// O seletor move a marcação sozinho: quem chama pode redesenhar só o corpo da view
				// (o Kanban redesenha a grade, não o cabeçalho) e a pastilha ativa continua certa.
				this.marcarAbaAtiva();
				this.opcoes.aoEscolher(agrupamento);
			});
		}
	}

	private marcarAbaAtiva(): void {
		for (const [agrupamento, aba] of this.abas) {
			aba.toggleClass("mytasks-calendario-aba-modo-ativa", agrupamento === this.agrupamentoAtual);
		}
	}

	private opcoesValidas(): TipoAgrupamento[] {
		const lista = opcoesDeAgrupamento(this.opcoes.configuracoes, this.opcoes.permitirNenhum, this.opcoes.permitirDia);
		const excluir = this.opcoes.excluir?.();
		return excluir ? lista.filter((a) => a !== excluir) : lista;
	}

	private abrirMenu(): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		menu.addItem((item) => item.setTitle(this.opcoes.rotulo ?? "selecionar agrupamento").setDisabled(true));
		menu.addSeparator();
		for (const agrupamento of this.opcoesValidas()) {
			menu.addItem((item) =>
				item
					.setTitle(rotuloAgrupamento(agrupamento, this.opcoes.configuracoes))
					.setChecked(agrupamento === this.agrupamentoAtual)
					.onClick(() => {
						this.agrupamentoAtual = agrupamento;
						this.opcoes.aoEscolher(agrupamento);
					})
			);
		}
		if (!this.botao) return;
		const retanguloBotao = this.botao.getBoundingClientRect();
		const x = (this.opcoes.elementoAlinhamento ?? this.botao).getBoundingClientRect().left;
		menu.showAtPosition({ x, y: retanguloBotao.bottom + 4 });
	}
}
