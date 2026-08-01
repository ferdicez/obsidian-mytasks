import { App, Menu, Modal, Notice, Setting } from "obsidian";
import {
	AcaoBotao,
	BotaoAcao,
	ConfigEfetivaGrupo,
	ICONES_ACOES_FIXAS,
	ID_DATA_ACAO,
	ID_STATUS,
	IdAcaoFixa,
	ORDEM_ACOES_FIXAS,
	PropriedadeValor,
	Tarefa,
} from "./tipos";
import { RepositorioTarefas, formatarData } from "./repositorio-tarefas";

// Resolve o valor de UMA ação no momento do clique. Devolve `null` quando a ação apaga o campo
// ("limpar"), que é diferente de string vazia — quem grava trata os dois casos igual, mas manter a
// distinção deixa o modo "fixo" com valor vazio funcionar como "grave string vazia".
function valorDaAcao(acao: AcaoBotao): PropriedadeValor {
	if (acao.modo === "limpar") return null;
	if (acao.modo === "hoje") return formatarData(new Date());
	if (acao.modo === "dias") {
		const data = new Date();
		data.setDate(data.getDate() + (acao.dias ?? 0));
		return formatarData(data);
	}
	return acao.valor ?? null;
}

// Executa as ações de um botão em sequência.
//
// A ORDEM IMPORTA e não é a da lista: o status vai por último. Concluir uma tarefa pode MOVER o
// arquivo (pasta de Concluídas), APAGÁ-LO (sem manter registro) ou reescrevê-lo pra próxima
// ocorrência — se o status fosse gravado antes, a gravação seguinte tentaria escrever num caminho
// que já não existe e se perderia calada. Mesmo cuidado que o Kanban já toma ao soltar um cartão.
export async function executarBotaoAcao(
	repositorio: RepositorioTarefas,
	configuracoes: ConfigEfetivaGrupo,
	tarefa: Tarefa,
	botao: BotaoAcao
): Promise<void> {
	const acoesStatus = botao.acoes.filter((a) => a.campo === ID_STATUS);
	const demais = botao.acoes.filter((a) => a.campo !== ID_STATUS);

	for (const acao of demais) {
		const valor = valorDaAcao(acao);
		if (acao.campo === ID_DATA_ACAO) {
			await repositorio.atualizarData(tarefa, typeof valor === "string" ? valor : null);
			continue;
		}
		// Propriedade do tipo "lista": o valor é digitado como texto separado por vírgula na
		// configuração do botão, e vira array aqui. atualizarPropriedade também sabe embrulhar uma
		// string solta em array, mas aí "a, b" viraria UM item com vírgula no meio.
		const def = configuracoes.propriedades.find((p) => p.id === acao.campo);
		if (def?.tipo === "lista" && typeof valor === "string") {
			const itens = valor
				.split(",")
				.map((v) => v.trim())
				.filter((v) => v.length > 0);
			await repositorio.atualizarPropriedade(tarefa, acao.campo, itens.length > 0 ? itens : null);
			continue;
		}
		await repositorio.atualizarPropriedade(tarefa, acao.campo, valor);
	}

	for (const acao of acoesStatus) {
		const valor = valorDaAcao(acao);
		if (typeof valor === "string" && valor) await repositorio.atualizarStatus(tarefa, valor);
	}
}

class ModalRenomearTarefa extends Modal {
	private nome: string;

	constructor(app: App, tituloAtual: string, private aoConfirmar: (nome: string) => void) {
		super(app);
		this.nome = tituloAtual;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("mytasks-modal-cards");
		contentEl.createEl("h2", { text: "Renomear tarefa" });

		new Setting(contentEl).setName("Nome").addText((text) => {
			text.setValue(this.nome).onChange((valor) => (this.nome = valor));
			// Enter salva — renomear é uma ação de um campo só, tirar a mão do teclado pra clicar
			// "Salvar" atrapalha mais do que ajuda.
			text.inputEl.addEventListener("keydown", (evento) => {
				if (evento.key === "Enter") {
					evento.preventDefault();
					this.confirmar();
				}
			});
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
		});

		new Setting(contentEl).setClass("mytasks-modal-acao").addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(() => this.confirmar())
		);
	}

	private confirmar(): void {
		if (!this.nome.trim()) return;
		this.aoConfirmar(this.nome.trim());
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

async function executarAcaoFixa(
	id: IdAcaoFixa,
	app: App,
	repositorio: RepositorioTarefas,
	tarefa: Tarefa,
	aoAtualizar?: () => void
): Promise<void> {
	if (id === "abrir") {
		app.workspace.openLinkText(tarefa.caminho, "", false);
		return;
	}

	if (id === "renomear") {
		new ModalRenomearTarefa(app, tarefa.titulo, async (nome) => {
			await repositorio.renomearTarefa(tarefa, nome);
			aoAtualizar?.();
		}).open();
		return;
	}

	// Excluir: confirmação obrigatória. É a única ação do menu que perde dados, e ela fica ao lado de
	// botões inofensivos que agem no primeiro clique — um deslize aqui apaga a nota inteira.
	if (!confirm(`Excluir a tarefa "${tarefa.titulo}"?`)) return;
	await repositorio.excluirTarefa(tarefa);
	aoAtualizar?.();
}

// Monta e abre o menu de clique direito de um cartão de tarefa. Chamado por desenharCartaoTarefa, o
// que dá o menu de graça a TODAS as views (Kanban, Calendário, Lista, sidebar e embeds).
export function abrirMenuAcoesTarefa(
	evento: MouseEvent,
	app: App,
	repositorio: RepositorioTarefas,
	configuracoes: ConfigEfetivaGrupo,
	tarefa: Tarefa,
	aoAtualizar?: () => void
): void {
	const botoes = (configuracoes.botoesAcao ?? []).filter((b) => b.visivel && b.acoes.length > 0);
	const fixasVisiveis = ORDEM_ACOES_FIXAS.filter((id) => configuracoes.acoesFixas?.[id]?.visivel);

	// Com tudo desligado nas Configurações, não abre menu nenhum — e, importante, NÃO chama
	// preventDefault, pra que o clique direito volte a fazer o que fazia antes (no Calendário, o
	// menu "Nova tarefa nesta data" da célula lá atrás).
	if (botoes.length === 0 && fixasVisiveis.length === 0) return;

	evento.preventDefault();
	// Sem o stopPropagation o menu da CÉLULA do calendário (registrado no contêiner em volta dos
	// cartões) abriria por cima deste — o clique direito no cartão viraria "Nova tarefa nesta data".
	evento.stopPropagation();

	const menu = new Menu();
	// setUseNativeMenu(false) força o menu do Obsidian em vez do menu nativo do sistema: é o que
	// permite ícone por item e mantém a aparência igual à dos outros seletores do plugin.
	menu.setUseNativeMenu(false);

	for (const botao of botoes) {
		menu.addItem((item) => {
			item.setTitle(botao.nome);
			if (botao.icone) item.setIcon(botao.icone);
			item.onClick(async () => {
				try {
					await executarBotaoAcao(repositorio, configuracoes, tarefa, botao);
				} catch (erro) {
					console.error("[my-tasks] falha ao executar botão de ação", erro);
					new Notice(`Não deu para executar "${botao.nome}".`);
				}
				aoAtualizar?.();
			});
		});
	}

	if (botoes.length > 0 && fixasVisiveis.length > 0) menu.addSeparator();

	for (const id of fixasVisiveis) {
		menu.addItem((item) => {
			item
				.setTitle(configuracoes.acoesFixas[id].nome)
				.setIcon(ICONES_ACOES_FIXAS[id])
				.onClick(() => executarAcaoFixa(id, app, repositorio, tarefa, aoAtualizar));
			if (id === "excluir") item.setWarning(true);
		});
	}

	menu.showAtMouseEvent(evento);
}
