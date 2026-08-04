import { setIcon } from "obsidian";

// Estado de aberto/fechado de cada acordeão, por chave estável. Vive no MÓDULO (não na instância da
// aba de Configurações) porque `display()` reconstrói a tela inteira a cada gravação: sem isso, mexer
// em qualquer campo dentro de um acordeão o fecharia na cara dela no meio da edição.
const abertos = new Map<string, boolean>();

export interface OpcoesAcordeao {
	// Chave estável usada para lembrar aberto/fechado entre redesenhos. Precisa ser única na tela e
	// não pode depender de índice de lista (senão renomear/reordenar embaralha o estado).
	chave: string;
	titulo: string;
	descricao?: string;
	// Começa aberto na PRIMEIRA vez que aparece (depois disso vale o que ela deixou).
	abertoPorPadrao?: boolean;
	// Acordeão aninhado: recua e afina o título, pro nível de dentro não competir com o de fora.
	aninhado?: boolean;
}

export interface Acordeao {
	// Onde o conteúdo da seção é desenhado.
	corpo: HTMLElement;
	// Só é chamado quando a seção está ABERTA — desenhar conteúdo fechado é trabalho jogado fora,
	// e algumas seções são caras (listas que varrem o vault).
	sePreenchido: (desenhar: (corpo: HTMLElement) => void) => void;
}

// Uma seção recolhível no estilo do Style Settings: cabeçalho clicável com seta, conteúdo abaixo.
// Pode ser aninhada (acordeão dentro de acordeão) passando `aninhado: true`.
export function criarAcordeao(container: HTMLElement, opcoes: OpcoesAcordeao): Acordeao {
	const aberto = abertos.get(opcoes.chave) ?? opcoes.abertoPorPadrao ?? false;
	abertos.set(opcoes.chave, aberto);

	const secao = container.createDiv({ cls: "mytasks-acordeao" });
	if (opcoes.aninhado) secao.addClass("mytasks-acordeao-aninhado");
	secao.toggleClass("mytasks-acordeao-aberto", aberto);

	// <button> de propósito: dá foco por teclado e Enter/Espaço de graça, que uma <div> clicável não tem.
	const cabecalho = secao.createEl("button", {
		cls: "mytasks-acordeao-cabecalho",
		attr: { "aria-expanded": String(aberto) },
	});

	const seta = cabecalho.createSpan({ cls: "mytasks-acordeao-seta" });
	setIcon(seta, "chevron-right");

	const textos = cabecalho.createDiv({ cls: "mytasks-acordeao-textos" });
	textos.createSpan({ cls: "mytasks-acordeao-titulo", text: opcoes.titulo });
	if (opcoes.descricao) {
		textos.createDiv({ cls: "mytasks-acordeao-descricao", text: opcoes.descricao });
	}

	const corpo = secao.createDiv({ cls: "mytasks-acordeao-corpo" });
	if (!aberto) corpo.addClass("mytasks-oculto");

	// Guarda o desenhador pra usar na primeira abertura, quando a seção nasce fechada. Declarado ANTES
	// do listener que o usa — `let` não sofre hoisting de valor, e chamá-lo antes daria erro.
	let desenharPendente: ((corpo: HTMLElement) => void) | null = null;

	cabecalho.addEventListener("click", () => {
		const novoEstado = !(abertos.get(opcoes.chave) ?? false);
		abertos.set(opcoes.chave, novoEstado);
		secao.toggleClass("mytasks-acordeao-aberto", novoEstado);
		corpo.toggleClass("mytasks-oculto", !novoEstado);
		cabecalho.setAttr("aria-expanded", String(novoEstado));

		// Conteúdo desenhado só na primeira abertura (ver `sePreenchido`): sem isso, abrir uma seção
		// que nunca foi aberta mostraria uma caixa vazia.
		if (novoEstado && desenharPendente) {
			const desenhar = desenharPendente;
			desenharPendente = null;
			desenhar(corpo);
		}
	});

	return {
		corpo,
		sePreenchido: (desenhar) => {
			if (aberto) {
				desenhar(corpo);
				return;
			}
			desenharPendente = desenhar;
		},
	};
}

// Marca um acordeão como aberto ANTES de ele ser desenhado. Usado ao criar um item novo (um filtro,
// por exemplo): ele nasce já expandido, pronto pra ser preenchido, em vez de fechado no fim da lista.
export function abrirAcordeao(chave: string): void {
	abertos.set(chave, true);
}

// Esquece o estado de todos os acordeões — usado ao trocar de grupo/página, onde as chaves passam a
// descrever outra coisa e manter o estado anterior confundiria mais do que ajudaria.
export function limparEstadoAcordeoes(): void {
	abertos.clear();
}
