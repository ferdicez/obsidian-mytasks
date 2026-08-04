import { App, Modal, Notice, Setting } from "obsidian";
import {
	ID_ANTECEDENCIA_ACAO,
	ID_DATA_ACAO,
	ID_MANTER_HISTORICO_ACAO,
	ID_RECORRENCIA_ACAO,
	ID_STATUS,
	OpcaoSelecao,
	PropriedadeDefinida,
	TipoPropriedade,
} from "./tipos";
import { ListaOpcoesGerenciada } from "./lista-opcoes-gerenciada";
import { ListaArquivosGerenciada } from "./lista-arquivos-gerenciada";
import { RepositorioTarefas } from "./repositorio-tarefas";

const ROTULOS_TIPO: Record<TipoPropriedade, string> = {
	texto: "Texto",
	selecao: "Seleção (opções fixas)",
	data: "Data",
	link_arquivo: "Link para arquivo",
	lista: "Lista de tags (várias por tarefa)",
};

// Chaves que já pertencem aos campos fixos da tarefa (status, prazo e os três de comportamento). Uma
// propriedade customizada com um destes ids colidiria com o campo fixo de mesmo nome na captura e nos
// botões de ação — ver definicoesDeCampo em area-captura.ts, onde o campo fixo é testado primeiro.
const ROTULOS_RESERVADOS: Record<string, string> = {
	[ID_STATUS]: "status da tarefa",
	[ID_DATA_ACAO]: "prazo",
	[ID_RECORRENCIA_ACAO]: "recorrência",
	[ID_ANTECEDENCIA_ACAO]: "avisar com antecedência",
	[ID_MANTER_HISTORICO_ACAO]: "manter no histórico",
};

const IDS_RESERVADOS = Object.keys(ROTULOS_RESERVADOS);

function gerarId(rotulo: string): string {
	return rotulo
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export class ModalEditarPropriedade extends Modal {
	private rotulo: string;
	private tipo: TipoPropriedade;
	private opcoes: OpcaoSelecao[];
	private arquivosFixos: string[];
	private exibirAliasNaCaptura: boolean;
	private chave: string;

	constructor(
		app: App,
		private propriedadeExistente: PropriedadeDefinida | null,
		private proximaOrdem: number,
		private aoSalvar: (propriedade: PropriedadeDefinida) => void,
		private repositorio?: RepositorioTarefas,
		private propriedadesExistentes: PropriedadeDefinida[] = []
	) {
		super(app);
		this.rotulo = propriedadeExistente?.rotulo ?? "";
		this.tipo = propriedadeExistente?.tipo ?? "texto";
		this.opcoes = (propriedadeExistente?.opcoes ?? []).map((o) => ({ ...o }));
		this.arquivosFixos = [...(propriedadeExistente?.arquivosFixos ?? [])];
		this.exibirAliasNaCaptura = propriedadeExistente?.exibirAliasNaCaptura ?? false;
		this.chave = propriedadeExistente?.id ?? "";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("mytasks-modal-cards");
		contentEl.createEl("h2", { text: this.propriedadeExistente ? "Editar propriedade" : "Nova propriedade" });

		new Setting(contentEl).setName("Nome").addText((text) =>
			text.setValue(this.rotulo).onChange((valor) => (this.rotulo = valor))
		);

		// Só propriedade já existente tem essa chave editável: numa propriedade nova ela nasce
		// derivada do Nome (comportamento de sempre). "Nome" é só o rótulo exibido no plugin — a chave
		// abaixo é o nome real usado no frontmatter (YAML) da nota. Mudar só o Nome NÃO renomeia a
		// chave; pra isso é preciso mexer aqui (e o plugin migra o frontmatter das tarefas existentes).
		if (this.propriedadeExistente) {
			new Setting(contentEl)
				.setName("Chave no frontmatter (avançado)")
				.setDesc(
					"Nome real da propriedade dentro da nota. Mudar aqui renomeia essa chave em todas as tarefas existentes — diferente de só mudar o Nome acima."
				)
				.addText((text) => text.setValue(this.chave).onChange((valor) => (this.chave = valor)));
		}

		new Setting(contentEl).setName("Tipo").addDropdown((dropdown) => {
			for (const chave of Object.keys(ROTULOS_TIPO) as TipoPropriedade[]) {
				dropdown.addOption(chave, ROTULOS_TIPO[chave]);
			}
			dropdown.setValue(this.tipo).onChange((valor) => {
				this.tipo = valor as TipoPropriedade;
				divOpcoes.toggle(this.tipo === "selecao");
				divArquivosFixos.toggle(this.tipo === "link_arquivo");
			});
		});

		const divOpcoes = contentEl.createDiv();
		divOpcoes.createEl("p", { text: "Opções", cls: "setting-item-name" });
		const containerLista = divOpcoes.createDiv();
		const propriedadeId = this.propriedadeExistente?.id;
		new ListaOpcoesGerenciada(containerLista, this.opcoes, {
			estaEmUso: (valor) =>
				propriedadeId ? this.repositorio?.valoresUsados(propriedadeId).includes(valor) ?? false : false,
			aoMudar: (opcoes) => (this.opcoes = opcoes),
		});
		divOpcoes.toggle(this.tipo === "selecao");

		const divArquivosFixos = contentEl.createDiv();
		new Setting(divArquivosFixos)
			.setName("Arquivos fixos (opcional)")
			.setDesc(
				"Se você adicionar arquivos aqui, só eles aparecerão como opção (num dropdown rápido) ao criar ou editar uma tarefa. Deixe vazio para continuar buscando qualquer arquivo do vault."
			);
		const containerArquivos = divArquivosFixos.createDiv();
		new ListaArquivosGerenciada(this.app, containerArquivos, this.arquivosFixos, {
			aoMudar: (caminhos) => (this.arquivosFixos = caminhos),
		});

		// Rótulo dos botões da captura. Nota sem alias continua aparecendo pelo nome do arquivo — o
		// aviso está na descrição pra não parecer bug quando uma das notas destoar das outras.
		new Setting(divArquivosFixos)
			.setName("Mostrar o alias nos botões de captura")
			.setDesc(
				"Nos botões e pastilhas da captura rápida, exibe o primeiro alias da nota em vez do nome do arquivo (ex.: \"pamela\" no lugar de \"cliente - pamela\"). Notas sem alias continuam aparecendo pelo nome. Muda só o que é exibido — o link gravado na tarefa é o mesmo."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.exibirAliasNaCaptura).onChange((valor) => (this.exibirAliasNaCaptura = valor))
			);
		divArquivosFixos.toggle(this.tipo === "link_arquivo");

		new Setting(contentEl).setClass("mytasks-modal-acao").addButton((btn) =>
			btn
				.setButtonText("Salvar")
				.setCta()
				.onClick(async () => {
					if (!this.rotulo.trim()) return;
					const id = this.propriedadeExistente
						? gerarId(this.chave) || this.propriedadeExistente.id
						: gerarId(this.rotulo);
					if (!id) return;

					// Ids que a captura e os botões de ação já usam pros campos fixos da tarefa. Uma
					// propriedade com um deles ficaria invisível na captura (o campo fixo vence a busca
					// por propriedade) e mandaria valor pra chave errada no frontmatter.
					if (IDS_RESERVADOS.includes(id) && id !== this.propriedadeExistente?.id) {
						new Notice(
							`"${id}" é uma chave reservada do plugin (${ROTULOS_RESERVADOS[id]}). Escolha outro nome para a propriedade.`
						);
						return;
					}

					const idAntigo = this.propriedadeExistente?.id;
					if (idAntigo && id !== idAntigo) {
						const colisao = this.propriedadesExistentes.some((p) => p.id !== idAntigo && p.id === id);
						if (colisao) {
							new Notice(`Já existe outra propriedade com a chave "${id}". Escolha outra.`);
							return;
						}
						const confirmado = confirm(
							`Renomear a chave "${idAntigo}" para "${id}"? Isso reescreve o frontmatter de todas as tarefas existentes que usam essa propriedade.`
						);
						if (!confirmado) return;
						const migrados = (await this.repositorio?.renomearChaveFrontmatter(idAntigo, id)) ?? 0;
						new Notice(`Chave renomeada em ${migrados} tarefa(s).`);
					}

					this.aoSalvar({
						id,
						rotulo: this.rotulo.trim(),
						tipo: this.tipo,
						ordem: this.propriedadeExistente?.ordem ?? this.proximaOrdem,
						opcoes: this.tipo === "selecao" ? this.opcoes.filter((o) => o.valor.trim()) : undefined,
						arquivosFixos: this.tipo === "link_arquivo" && this.arquivosFixos.length > 0 ? this.arquivosFixos : undefined,
						exibirAliasNaCaptura:
							this.tipo === "link_arquivo" && this.exibirAliasNaCaptura ? true : undefined,
					});
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
