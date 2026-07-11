import { App, DropdownComponent, Modal, Setting, TFile } from "obsidian";
import {
	ConfiguracoesGestorTarefas,
	PropriedadeDefinida,
	PropriedadeValor,
	Recorrencia,
	RECORRENCIA_LABELS,
	Tarefa,
	opcaoStatusComData,
	primeiraOpcaoStatus,
	ultimaOpcaoStatus,
} from "./tipos";
import { DadosTarefaEscrita } from "./frontmatter-tarefas";
import { SugestorArquivos } from "./sugestor-arquivos";
import { CampoTags } from "./campo-tags";
import { RepositorioTarefas } from "./repositorio-tarefas";

export interface ValoresIniciaisTarefa {
	data?: string;
	horario?: string;
}

export class ModalNovaTarefa extends Modal {
	private titulo: string;
	private status: string;
	private statusEditadoManualmente = false;
	private dropdownStatus?: DropdownComponent;
	private data: string | null;
	private temHorario: boolean;
	private horario: string | null;
	private recorrencia: Recorrencia = "nenhuma";
	private manterHistorico = true;
	private recorrenciaDataFim: string | null = null;
	private diasAntecedenciaAviso: number | null = null;
	private valores: Record<string, PropriedadeValor> = {};
	private divCamposComData!: HTMLElement;

	constructor(
		app: App,
		private configuracoes: ConfiguracoesGestorTarefas,
		private repositorio: RepositorioTarefas,
		private aoConfirmar: (titulo: string, dados: DadosTarefaEscrita) => void,
		valoresIniciais?: ValoresIniciaisTarefa,
		private tarefaExistente?: Tarefa,
		private aoAtualizar?: () => void
	) {
		super(app);

		if (tarefaExistente) {
			this.titulo = tarefaExistente.titulo;
			this.status = tarefaExistente.status;
			this.data = valoresIniciais?.data ?? tarefaExistente.data;
			this.horario = valoresIniciais?.horario ?? tarefaExistente.horario;
			this.temHorario = !!this.horario;
			this.recorrencia = tarefaExistente.recorrencia;
			this.manterHistorico = tarefaExistente.manterHistorico;
			this.recorrenciaDataFim = tarefaExistente.recorrenciaDataFim;
			this.diasAntecedenciaAviso = tarefaExistente.diasAntecedenciaAviso;
			this.valores = { ...tarefaExistente.propriedades };
		} else {
			this.titulo = "";
			const hoje = new Date();
			const hojeFormatado = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
				hoje.getDate()
			).padStart(2, "0")}`;
			this.data = valoresIniciais?.data ?? hojeFormatado;
			this.horario = valoresIniciais?.horario ?? null;
			this.temHorario = !!valoresIniciais?.horario;
			this.status = this.statusAutomaticoPelaData();
		}
	}

	// Sem data = Inbox (1ª opção); com data = a opção seguinte, já que Inbox é reservado para tarefas sem data.
	private statusAutomaticoPelaData(): string {
		if (!this.data) return primeiraOpcaoStatus(this.configuracoes.status) ?? "";
		return opcaoStatusComData(this.configuracoes.status) ?? "";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.tarefaExistente ? "Editar tarefa" : "Nova tarefa" });

		new Setting(contentEl).setName("Título").addText((text) =>
			text.setValue(this.titulo).onChange((valor) => (this.titulo = valor))
		);

		new Setting(contentEl).setName(this.configuracoes.status.rotulo).addDropdown((dropdown) => {
			this.dropdownStatus = dropdown;
			for (const opcao of this.configuracoes.status.opcoes) {
				dropdown.addOption(opcao.valor, opcao.valor);
			}
			dropdown.setValue(this.status).onChange((valor) => {
				this.status = valor;
				this.statusEditadoManualmente = true;
			});
		});

		new Setting(contentEl).setName(this.configuracoes.dataTarefa.rotulo).addText((text) => {
			text.inputEl.type = "date";
			if (this.data) text.setValue(this.data);
			text.onChange((valor) => {
				this.data = valor || null;
				this.divCamposComData.toggle(!!this.data);
				if (!this.tarefaExistente && !this.statusEditadoManualmente) {
					this.status = this.statusAutomaticoPelaData();
					this.dropdownStatus?.setValue(this.status);
				}
			});
		});

		new Setting(contentEl).setName("Definir horário").addToggle((toggle) =>
			toggle.setValue(this.temHorario).onChange((valor) => {
				this.temHorario = valor;
				divHorario.toggle(valor);
			})
		);

		const divHorario = contentEl.createDiv();
		divHorario.toggle(this.temHorario);
		new Setting(divHorario).setName("Horário").addText((text) => {
			text.inputEl.type = "time";
			if (this.horario) text.setValue(this.horario);
			text.onChange((valor) => (this.horario = valor || null));
		});

		for (const def of [...this.configuracoes.propriedades].sort((a, b) => a.ordem - b.ordem)) {
			this.renderizarCampo(contentEl, def);
		}

		// Aparece sempre (qualquer tarefa, recorrente ou não): se desligado, concluir apaga o arquivo
		// em vez de deixar registro. Em tarefas recorrentes, isso também vale ao gerar a próxima ocorrência.
		new Setting(contentEl)
			.setName("Manter registro ao concluir")
			.setDesc("Se desligado, o arquivo da tarefa é apagado ao concluí-la (não fica no histórico).")
			.addToggle((toggle) =>
				toggle.setValue(this.manterHistorico).onChange((valor) => (this.manterHistorico = valor))
			);

		this.divCamposComData = contentEl.createDiv();
		this.divCamposComData.toggle(!!this.data);

		new Setting(this.divCamposComData).setName("Recorrência").addDropdown((dropdown) => {
			for (const chave of Object.keys(RECORRENCIA_LABELS) as Recorrencia[]) {
				dropdown.addOption(chave, RECORRENCIA_LABELS[chave]);
			}
			dropdown.setValue(this.recorrencia).onChange((valor) => {
				this.recorrencia = valor as Recorrencia;
				divRecorrencia.toggle(this.recorrencia !== "nenhuma");
			});
		});

		const divRecorrencia = this.divCamposComData.createDiv();
		divRecorrencia.toggle(this.recorrencia !== "nenhuma");

		new Setting(divRecorrencia)
			.setName("Repetir até")
			.setDesc("Deixe em branco para repetir sem data final.")
			.addText((text) => {
				text.inputEl.type = "date";
				if (this.recorrenciaDataFim) text.setValue(this.recorrenciaDataFim);
				text.onChange((valor) => (this.recorrenciaDataFim = valor || null));
			});

		new Setting(this.divCamposComData)
			.setName("Avisar com antecedência")
			.setDesc("Quantos dias antes da data a tarefa deve aparecer destacada na lista. Deixe em branco para não avisar.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				if (this.diasAntecedenciaAviso) text.setValue(String(this.diasAntecedenciaAviso));
				text.onChange((valor) => {
					const numero = parseInt(valor, 10);
					this.diasAntecedenciaAviso = Number.isFinite(numero) && numero > 0 ? numero : null;
				});
			});

		const areaAcoes = contentEl.createDiv();
		this.desenharAcaoPrincipal(areaAcoes);
	}

	private desenharAcaoPrincipal(areaAcoes: HTMLElement): void {
		areaAcoes.empty();
		const setting = new Setting(areaAcoes).addButton((btn) =>
			btn
				.setButtonText(this.tarefaExistente ? "Salvar" : "Criar tarefa")
				.setCta()
				.onClick(() => this.confirmar())
		);

		if (this.tarefaExistente) {
			setting.addButton((btn) =>
				btn.setButtonText("Abrir nota").onClick(() => {
					this.app.workspace.openLinkText(this.tarefaExistente!.caminho, "", false);
					this.close();
				})
			);
			setting.addButton((btn) =>
				btn
					.setButtonText("Excluir")
					.setWarning()
					.onClick(() => this.desenharConfirmacaoExclusao(areaAcoes))
			);
		}
	}

	private desenharConfirmacaoExclusao(areaAcoes: HTMLElement): void {
		areaAcoes.empty();
		new Setting(areaAcoes)
			.setName("Excluir esta tarefa?")
			.setDesc("O arquivo da nota será apagado. Essa ação não pode ser desfeita.")
			.addButton((btn) => btn.setButtonText("Cancelar").onClick(() => this.desenharAcaoPrincipal(areaAcoes)))
			.addButton((btn) =>
				btn
					.setButtonText("Sim, excluir")
					.setWarning()
					.onClick(async () => {
						await this.repositorio.excluirTarefa(this.tarefaExistente!);
						this.aoAtualizar?.();
						this.close();
					})
			);
	}

	private async confirmar(): Promise<void> {
		if (!this.titulo.trim()) return;

		const dados: DadosTarefaEscrita = {
			status: this.status,
			data: this.data,
			horario: this.temHorario ? this.horario : null,
			recorrencia: this.data ? this.recorrencia : "nenhuma",
			manterHistorico: this.manterHistorico,
			recorrenciaDataFim: this.data && this.recorrencia !== "nenhuma" ? this.recorrenciaDataFim : null,
			diasAntecedenciaAviso: this.data ? this.diasAntecedenciaAviso : null,
			propriedades: this.valores,
		};

		if (!this.tarefaExistente) {
			this.aoConfirmar(this.titulo, dados);
			this.close();
			return;
		}

		const concluido = ultimaOpcaoStatus(this.configuracoes.status);
		const estavaConcluida = this.tarefaExistente.status === concluido;
		const continuaConcluida = dados.status === concluido;

		if (estavaConcluida && !continuaConcluida) {
			// Desfazer a conclusão pode mover o arquivo de volta para a pasta de ativas — grava o
			// resto dos campos editados no modal só depois, contra o caminho atualizado.
			const arquivoAtualizado = await this.repositorio.desfazerConclusao(this.tarefaExistente, dados.status);
			await this.repositorio.atualizarTarefaCompleta(
				{ ...this.tarefaExistente, caminho: arquivoAtualizado?.path ?? this.tarefaExistente.caminho },
				dados
			);
		} else {
			await this.repositorio.atualizarTarefaCompleta(this.tarefaExistente, dados);
		}

		this.aoAtualizar?.();
		this.close();
	}

	private renderizarCampo(container: HTMLElement, def: PropriedadeDefinida) {
		const setting = new Setting(container).setName(def.rotulo);
		const valorAtual = this.valores[def.id];
		switch (def.tipo) {
			case "texto":
				setting.addText((text) => {
					if (typeof valorAtual === "string") text.setValue(valorAtual);
					text.onChange((valor) => (this.valores[def.id] = valor || null));
				});
				break;
			case "selecao":
				setting.addDropdown((dropdown) => {
					dropdown.addOption("", "—");
					for (const opcao of def.opcoes ?? []) dropdown.addOption(opcao.valor, opcao.valor);
					if (typeof valorAtual === "string") dropdown.setValue(valorAtual);
					dropdown.onChange((valor) => (this.valores[def.id] = valor || null));
				});
				break;
			case "data":
				setting.addText((text) => {
					text.inputEl.type = "date";
					if (typeof valorAtual === "string") text.setValue(valorAtual);
					text.onChange((valor) => (this.valores[def.id] = valor || null));
				});
				break;
			case "link_arquivo":
				setting.addSearch((search) => {
					if (typeof valorAtual === "string") {
						const arquivoAtual = this.app.vault.getAbstractFileByPath(valorAtual);
						if (arquivoAtual) search.setValue(arquivoAtual.name.replace(/\.md$/, ""));
					}
					new SugestorArquivos(this.app, search.inputEl, (arquivo: TFile) => {
						this.valores[def.id] = arquivo.path;
					});
					search.inputEl.addEventListener("input", () => {
						if (!search.inputEl.value) this.valores[def.id] = null;
					});
				});
				break;
			case "lista": {
				const valoresIniciais = Array.isArray(valorAtual) ? valorAtual : [];
				this.valores[def.id] = valoresIniciais;
				new CampoTags(setting.controlEl, valoresIniciais, this.repositorio.valoresUsados(def.id), (valores) => {
					this.valores[def.id] = valores;
				});
				break;
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
