import { setIcon } from "obsidian";
import { EventoExterno } from "./tipos";

// Desenho do compromisso vindo de uma agenda externa (Google). Deliberadamente DIFERENTE do cartão
// de tarefa: sem checkbox (não há o que concluir), sem arrastar (não há para onde gravar) e sem
// abrir nota. Bater o olho e saber o que é nota do vault e o que é compromisso do Google importa
// mais do que a uniformidade visual.

export interface OpcoesEventoExterno {
	// No modo Mês o espaço é apertado: só bolinha + horário + título numa linha.
	compacto?: boolean;
}

// Popover com os detalhes. Fecha ao clicar fora ou apertar Esc — sem overlay que bloqueie a tela,
// porque o gesto esperado é uma espiada rápida, não um modal.
function abrirPopover(evento: EventoExterno, ancora: HTMLElement): void {
	const existente = document.querySelector(".mytasks-evento-popover");
	if (existente) existente.remove();

	const popover = document.body.createDiv({ cls: "mytasks-evento-popover" });

	const cabecalho = popover.createDiv({ cls: "mytasks-evento-popover-cabecalho" });
	cabecalho.createDiv({ cls: "mytasks-evento-cor" }).style.backgroundColor = evento.cor;
	cabecalho.createEl("strong", { text: evento.titulo });

	const quando = evento.diaInteiro
		? "dia inteiro"
		: evento.horarioFim
			? `${evento.horario} – ${evento.horarioFim}`
			: (evento.horario ?? "");
	popover.createDiv({ cls: "mytasks-evento-popover-quando", text: quando });

	if (evento.local) {
		const linha = popover.createDiv({ cls: "mytasks-evento-popover-linha" });
		setIcon(linha.createSpan({ cls: "mytasks-evento-popover-icone" }), "map-pin");
		linha.createSpan({ text: evento.local });
	}

	if (evento.descricao) {
		popover.createDiv({ cls: "mytasks-evento-popover-descricao", text: evento.descricao });
	}

	popover.createDiv({ cls: "mytasks-evento-popover-origem", text: evento.calendarioNome });

	// Posiciona junto da âncora, corrigindo se estourar a borda da janela.
	const retangulo = ancora.getBoundingClientRect();
	popover.style.top = `${retangulo.bottom + 4}px`;
	popover.style.left = `${retangulo.left}px`;
	const caixa = popover.getBoundingClientRect();
	if (caixa.right > window.innerWidth - 8) {
		popover.style.left = `${Math.max(8, window.innerWidth - caixa.width - 8)}px`;
	}
	if (caixa.bottom > window.innerHeight - 8) {
		popover.style.top = `${Math.max(8, retangulo.top - caixa.height - 4)}px`;
	}

	const fechar = () => {
		popover.remove();
		document.removeEventListener("click", aoClicarFora, true);
		document.removeEventListener("keydown", aoTeclar, true);
	};
	// Captura na fase de captura para fechar antes que o clique vire outra ação na grade.
	const aoClicarFora = (e: MouseEvent) => {
		if (!popover.contains(e.target as Node) && !ancora.contains(e.target as Node)) fechar();
	};
	const aoTeclar = (e: KeyboardEvent) => {
		if (e.key === "Escape") fechar();
	};
	document.addEventListener("click", aoClicarFora, true);
	document.addEventListener("keydown", aoTeclar, true);
}

export function desenharEventoExterno(
	container: HTMLElement,
	evento: EventoExterno,
	opcoes: OpcoesEventoExterno = {}
): HTMLElement {
	const item = container.createDiv({ cls: "mytasks-evento-externo" });
	if (opcoes.compacto) item.addClass("mytasks-evento-externo-compacto");

	item.createDiv({ cls: "mytasks-evento-cor" }).style.backgroundColor = evento.cor;

	if (!evento.diaInteiro && evento.horario) {
		item.createSpan({ cls: "mytasks-evento-horario", text: evento.horario });
	}
	item.createSpan({ cls: "mytasks-evento-titulo", text: evento.titulo });

	// Tooltip nativa como atalho: o popover é para quando ela quiser ler a descrição inteira.
	const partes = [evento.titulo];
	if (!evento.diaInteiro && evento.horario) {
		partes.push(evento.horarioFim ? `${evento.horario} – ${evento.horarioFim}` : evento.horario);
	}
	if (evento.local) partes.push(evento.local);
	partes.push(`(${evento.calendarioNome})`);
	item.setAttribute("title", partes.join("\n"));

	item.addEventListener("click", (e) => {
		// Não deixa o clique subir para a célula do dia, que abriria o painel de detalhes por baixo.
		e.stopPropagation();
		abrirPopover(evento, item);
	});

	return item;
}
