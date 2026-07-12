import { App, setIcon } from "obsidian";
import {
	ID_STATUS,
	ConfigEfetivaGrupo,
	PIXELS_ESPESSURA,
	PropriedadeDefinida,
	Tarefa,
	corDeDestaquePorEstilo,
	emPeriodoDeAviso,
	ultimaOpcaoStatus,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";
import { ModalNovaTarefa } from "./modal-nova-tarefa";

export function corComOpacidade(hex: string, alpha: number): string {
	const valor = hex.replace("#", "");
	const r = parseInt(valor.substring(0, 2), 16);
	const g = parseInt(valor.substring(2, 4), 16);
	const b = parseInt(valor.substring(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rotuloArquivo(app: App, caminho: string): string {
	const arquivo = app.vault.getAbstractFileByPath(caminho);
	if (!arquivo) return caminho;
	const frontmatter = app.metadataCache.getCache(arquivo.path)?.frontmatter;
	const aliases = frontmatter?.aliases;
	const primeiroAlias = Array.isArray(aliases) ? aliases[0] : typeof aliases === "string" ? aliases : null;
	if (primeiroAlias) return String(primeiroAlias);
	return arquivo.name.replace(/\.md$/, "");
}

export function rotuloValorPropriedade(app: App, valor: string | string[]): string {
	if (Array.isArray(valor)) return valor.map((v) => rotuloArquivo(app, v)).join(", ");
	return rotuloArquivo(app, valor);
}

export const FORMATO_DRAG_TAREFA = "application/x-mytasks-caminho";

export const ID_DATA = "data";
export const ID_DATA_ENTRADA = "dataEntrada";

export function formatarDataExibicao(dataIso: string): string {
	const [ano, mes, dia] = dataIso.split("-");
	if (!ano || !mes || !dia) return dataIso;
	return `${dia}/${mes}/${ano}`;
}

export interface OpcoesCartaoTarefa {
	mostrarCheckbox?: boolean;
	mostrarMeta?: boolean;
	propriedadesMeta?: PropriedadeDefinida[];
	ocultarNaMeta?: string[];
	arrastavel?: boolean;
	aoAtualizar?: () => void;
}

export function desenharCartaoTarefa(
	container: HTMLElement,
	app: App,
	repositorio: RepositorioTarefas,
	configuracoes: ConfigEfetivaGrupo,
	tarefa: Tarefa,
	opcoes: OpcoesCartaoTarefa = {}
): HTMLElement {
	const {
		mostrarCheckbox = true,
		mostrarMeta = true,
		propriedadesMeta = configuracoes.propriedades,
		ocultarNaMeta = [],
		arrastavel = true,
		aoAtualizar,
	} = opcoes;

	const concluido = ultimaOpcaoStatus(configuracoes.status);
	const estaConcluida = tarefa.status === concluido;
	const emAviso = !estaConcluida && emPeriodoDeAviso(tarefa, new Date());

	const item = container.createDiv({ cls: "mytasks-item" });
	if (estaConcluida) item.addClass("mytasks-item-feito");

	if (arrastavel) {
		item.setAttribute("draggable", "true");
		item.addEventListener("dragstart", (evento) => {
			evento.dataTransfer?.setData(FORMATO_DRAG_TAREFA, tarefa.caminho);
			if (evento.dataTransfer) evento.dataTransfer.effectAllowed = "move";
			item.addClass("mytasks-item-arrastando");
		});
		item.addEventListener("dragend", () => item.removeClass("mytasks-item-arrastando"));
	}
	if (emAviso) {
		item.addClass("mytasks-item-aviso");
		item.addClass("mytasks-item-borda-reta");
		item.style.backgroundColor = corComOpacidade(configuracoes.corAviso, 0.18);
		item.style.borderLeft = `3px solid ${configuracoes.corAviso}`;
	}

	// "borda" agora é uma bolinha colorida no fim do título (desenhada mais abaixo, junto ao título) —
	// não colore mais a lateral, pra não colidir com o aviso de prazo.
	const corBolinha = corDeDestaquePorEstilo(tarefa, configuracoes, "borda");
	const corCheckbox = corDeDestaquePorEstilo(tarefa, configuracoes, "checkbox");

	if (mostrarCheckbox) {
		const checkbox = item.createEl("input", { type: "checkbox" });
		if (corCheckbox) {
			checkbox.addClass("mytasks-checkbox-colorido");
			checkbox.style.setProperty("--mytasks-cor", corCheckbox);
			checkbox.style.setProperty(
				"--mytasks-espessura",
				PIXELS_ESPESSURA[configuracoes.destaques.checkbox?.espessuraCheckbox ?? "media"]
			);
		}
		checkbox.checked = estaConcluida;
		checkbox.addEventListener("change", async (evento) => {
			evento.stopPropagation();
			const primeiro = configuracoes.status.opcoes[0]?.valor ?? tarefa.status;
			const novoStatus = checkbox.checked ? concluido ?? tarefa.status : primeiro;
			await repositorio.atualizarStatus(tarefa, novoStatus);
			aoAtualizar?.();
		});
	}

	const info = item.createDiv({ cls: "mytasks-info" });
	const linhaTitulo = info.createDiv({ cls: "mytasks-titulo-linha" });
	const titulo = linhaTitulo.createEl("span", { text: tarefa.titulo, cls: "mytasks-titulo" });
	// Destaque "bolinha": um pontinho colorido logo após o título, com a cor da propriedade escolhida.
	if (corBolinha) {
		const bolinha = linhaTitulo.createSpan({ cls: "mytasks-bolinha-destaque" });
		bolinha.style.backgroundColor = corBolinha;
	}
	titulo.addEventListener("click", (evento) => {
		evento.stopPropagation();
		new ModalNovaTarefa(
			app,
			configuracoes,
			repositorio,
			() => {},
			undefined,
			tarefa,
			() => aoAtualizar?.()
		).open();
	});

	if (mostrarMeta) {
		const meta: string[] = [];
		if (!ocultarNaMeta.includes(ID_STATUS)) meta.push(tarefa.status);
		if (!ocultarNaMeta.includes(ID_DATA) && tarefa.data) meta.push(formatarDataExibicao(tarefa.data));
		if (tarefa.horario) meta.push(tarefa.horario);
		if (!ocultarNaMeta.includes(ID_DATA_ENTRADA)) {
			meta.push(formatarDataExibicao(tarefa.dataEntrada));
		}
		for (const def of propriedadesMeta) {
			if (ocultarNaMeta.includes(def.id)) continue;
			const valor = tarefa.propriedades[def.id];
			const vazio = valor === null || (Array.isArray(valor) && valor.length === 0);
			if (vazio) continue;
			const valorExibido =
				def.tipo === "data" && typeof valor === "string"
					? formatarDataExibicao(valor)
					: rotuloValorPropriedade(app, valor as string | string[]);
			meta.push(valorExibido);
		}
		info.createEl("span", { text: meta.join(" | "), cls: "mytasks-meta" });
	} else if (tarefa.horario) {
		info.createEl("span", { text: tarefa.horario, cls: "mytasks-meta" });
	}

	if (tarefa.recorrencia !== "nenhuma") {
		const iconeRecorrencia = item.createSpan({ cls: "mytasks-icone-recorrencia" });
		setIcon(iconeRecorrencia, "refresh-cw");
	}

	return item;
}
