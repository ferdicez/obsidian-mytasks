import { App, setIcon } from "obsidian";
import {
	ID_STATUS,
	ConfigEfetivaGrupo,
	PIXELS_ESPESSURA,
	PropriedadeDefinida,
	Tarefa,
	corDeDestaquePorEstilo,
	diasAteOPrazo,
	faseDeAviso,
	ultimaOpcaoStatus,
} from "./tipos";
import { RepositorioTarefas } from "./repositorio-tarefas";

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
	const fase = estaConcluida ? null : faseDeAviso(tarefa, new Date());

	const item = container.createDiv({ cls: "mytasks-item" });
	if (estaConcluida) item.addClass("mytasks-item-feito");

	// Com a antecipação ligada, a tarefa aparece em dias que NÃO são o do prazo — então o cartão precisa
	// dizer que aquilo ainda não é para hoje, senão vira uma tarefa igual às outras num dia que não é o
	// dela. O título fica esmaecido ("ainda não está aqui") e ganha um sino com os dias que faltam.
	const ehLembreteAntecipado = configuracoes.anteciparPendencias && fase === "antecedencia";
	if (ehLembreteAntecipado) item.addClass("mytasks-item-lembrete");

	// Lembrete não é arrastável: o cartão do dia 7 é um eco do prazo do dia 10, e soltá-lo no dia 8
	// gravaria 8 como PRAZO — mudando calado a data real a partir de uma cópia. Arrastar segue valendo
	// no cartão do dia do prazo, que é o único que representa a data de verdade.
	if (arrastavel && !ehLembreteAntecipado) {
		item.setAttribute("draggable", "true");
		item.addEventListener("dragstart", (evento) => {
			evento.dataTransfer?.setData(FORMATO_DRAG_TAREFA, tarefa.caminho);
			if (evento.dataTransfer) evento.dataTransfer.effectAllowed = "move";
			item.addClass("mytasks-item-arrastando");
		});
		item.addEventListener("dragend", () => item.removeClass("mytasks-item-arrastando"));
	}
	if (fase === "prazo") {
		// Dia do prazo: destaque cheio (fundo + borda lateral).
		item.addClass("mytasks-item-aviso");
		item.addClass("mytasks-item-borda-reta");
		item.style.backgroundColor = corComOpacidade(configuracoes.corAviso, 0.18);
		item.style.borderLeft = `3px solid ${configuracoes.corAviso}`;
	} else if (fase === "antecedencia") {
		// Dias de antecedência (antes do prazo): só um tingido bem leve, sem borda —
		// parece uma tarefa normal, mas já sinaliza que o prazo está chegando.
		item.addClass("mytasks-item-aviso");
		item.addClass("mytasks-item-antecedencia");
		item.style.backgroundColor = corComOpacidade(configuracoes.corAviso, 0.07);
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
		app.workspace.openLinkText(tarefa.caminho, "", false);
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
		// Quanto falta pro prazo entra como ÚLTIMA propriedade da meta — some depois das reais, e o
		// separador " | " vem de graça do join. É a distância até o prazo (o que ela perde de vista);
		// a data em si já saiu acima, no item de ID_DATA.
		const faltamMeta = ehLembreteAntecipado ? diasAteOPrazo(tarefa, new Date()) : null;
		if (faltamMeta !== null && faltamMeta > 0) {
			meta.push(faltamMeta === 1 ? "amanhã" : `em ${faltamMeta} dias`);
		}
		info.createEl("span", { text: meta.join(" | "), cls: "mytasks-meta" });
	} else if (tarefa.horario) {
		info.createEl("span", { text: tarefa.horario, cls: "mytasks-meta" });
	}

	// Canto do cartão: UM ícone só. Nos dias de antecedência o sino toma o lugar do de recorrência
	// (a informação que importa ali é "isto é um lembrete"); no dia do prazo o sino sai e a recorrência
	// volta. Mesma classe nos dois, então tamanho e cor são idênticos por construção.
	if (ehLembreteAntecipado) {
		const iconeSino = item.createSpan({ cls: "mytasks-icone-recorrencia" });
		setIcon(iconeSino, "bell");
	} else if (configuracoes.recorrenciaAtiva && tarefa.recorrencia !== "nenhuma") {
		const iconeRecorrencia = item.createSpan({ cls: "mytasks-icone-recorrencia" });
		setIcon(iconeRecorrencia, "refresh-cw");
	}

	return item;
}
