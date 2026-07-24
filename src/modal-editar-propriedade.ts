import { App, Modal, Notice, Setting } from "obsidian";
import { OpcaoSelecao, PropriedadeDefinida, TipoPropriedade } from "./tipos";
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
					});
					this.close();
				})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
