import { App, Menu, Notice, TFile, setIcon } from "obsidian";
import {
	AcaoBotao,
	CampoCaptura,
	ConfigEfetivaGrupo,
	ID_ANTECEDENCIA_ACAO,
	ID_DATA_ACAO,
	ID_MANTER_HISTORICO_ACAO,
	ID_RECORRENCIA_ACAO,
	ID_STATUS,
	IDS_CAMPOS_COMPORTAMENTO,
	OPCOES_MANTER_HISTORICO_CAPTURA,
	PresetCaptura,
	PropriedadeDefinida,
	PropriedadeValor,
	RECORRENCIA_LABELS,
	Recorrencia,
	camposDaCaptura,
	rotuloFixo,
} from "./tipos";
import { RepositorioTarefas, formatarData } from "./repositorio-tarefas";
import { SugestorArquivos } from "./sugestor-arquivos";
import { rotuloDeArquivoNaCaptura } from "./alias-captura";

// Valores pendentes na área de captura, antes de virarem tarefa. As chaves são IDs de campo
// (ID_STATUS, ID_DATA_ACAO ou id de propriedade), iguais aos de AcaoBotao.campo.
type ValoresCaptura = Record<string, PropriedadeValor>;

// Um campo já resolvido para desenho: a configuração dela (id + apresentação) somada ao rótulo e à
// definição da propriedade, que só existem na config do grupo.
type CampoDesenhavel = CampoCaptura & { rotulo: string; def?: PropriedadeDefinida };

export interface OpcoesAreaCaptura {
	app: App;
	repositorio: RepositorioTarefas;
	configuracoes: ConfigEfetivaGrupo;
	// Chamado depois de cada captura bem-sucedida.
	aoCapturar: () => void;
	// Título do bloco (o "demandas" do print). Ausente = bloco sem título.
	titulo?: string;
	// Ícone Lucide desenhado antes do título (o botão "inbox" do print).
	icone?: string;
	placeholder?: string;
	// Desenha as pastilhas de propriedade e os presets. Desligado no bloco do Inbox, que é captura
	// crua: só título, sem preencher nada. Ligado no bloco "demandas".
	mostrarCampos?: boolean;
	// Status com que a tarefa nasce, ignorando a regra posicional/os campos. O bloco do Inbox usa
	// isso pra garantir que a captura crua caia SEMPRE no Inbox, como antes.
	statusFixo?: string;
}

// Resolve o valor de UMA ação de preset no momento do clique. Igual ao valorDaAcao de
// menu-acoes-tarefa.ts — os modos relativos do prazo ("hoje", "daqui a X dias") só fazem sentido
// calculados na hora, não na hora em que o preset foi configurado.
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

// Um bloco de captura da barra lateral, na ordem do print dela: título (com ícone) → campo de digitar
// → pastilhas das propriedades → presets. A sidebar empilha DOIS destes: o do Inbox (captura crua) e o
// de demandas (com as pastilhas). Nenhum dos dois lista tarefas.
export class AreaCaptura {
	private valores: ValoresCaptura = {};
	private input: HTMLInputElement | null = null;
	private areaCampos: HTMLElement | null = null;

	constructor(private containerEl: HTMLElement, private opcoes: OpcoesAreaCaptura) {}

	renderizar(): void {
		this.containerEl.empty();
		this.containerEl.addClass("mytasks-area-captura");

		const captura = this.opcoes.configuracoes.captura;

		// O título é a pastilha do print ("inbox" com ícone, "demandas" ao lado). Não é botão: desde
		// que a lista saiu da sidebar não há mais o que alternar — os dois blocos ficam à vista.
		if (this.opcoes.titulo || this.opcoes.icone) {
			const cabecalho = this.containerEl.createDiv({ cls: "mytasks-captura-titulo" });
			if (this.opcoes.icone) {
				const icone = cabecalho.createSpan({ cls: "mytasks-captura-titulo-icone" });
				setIcon(icone, this.opcoes.icone);
			}
			if (this.opcoes.titulo) cabecalho.createSpan({ text: this.opcoes.titulo });
		}

		// `.mytasks-cabecalho` é o que dá ao input a mesma altura, largura e margem que ele tem no
		// Inbox (é a linha em que o MotorLista o desenha). Sem ela, o mesmo campo saía mais baixo e
		// mais largo nesta aba do que na outra.
		const linhaInput = this.containerEl.createDiv({ cls: "mytasks-cabecalho mytasks-captura-linha" });
		this.input = linhaInput.createEl("input", {
			type: "text",
			placeholder: this.opcoes.placeholder ?? "Adicionar tarefa...",
			cls: "mytasks-captura-rapida",
		});
		this.input.addEventListener("keydown", (evento) => {
			if (evento.key !== "Enter") return;
			evento.preventDefault();
			void this.capturar();
		});

		if (this.opcoes.mostrarCampos === false) return;

		this.areaCampos = this.containerEl.createDiv({ cls: "mytasks-captura-campos" });
		this.renderizarCampos();

		const presets = (captura.presets ?? []).filter((p) => p.visivel && p.acoes.length > 0);
		if (presets.length > 0) {
			const linhaPresets = this.containerEl.createDiv({ cls: "mytasks-captura-presets" });
			for (const preset of presets) this.desenharPreset(linhaPresets, preset);
		}
	}

	// Dispara a captura de fora — usado pelo botão "+" que a view desenha na linha do toggle (a
	// pastilha "demandas" não faz parte desta área, mora no cabeçalho da view).
	capturarAgora(): void {
		void this.capturar();
	}

	// Foca o campo de título — usado pelo comando "Capturar tarefa" da paleta.
	focar(): void {
		this.input?.focus();
	}

	private definicoesDeCampo(): CampoDesenhavel[] {
		const cfg = this.opcoes.configuracoes;
		const resultado: CampoDesenhavel[] = [];
		for (const campo of camposDaCaptura(cfg.captura)) {
			if (campo.id === ID_STATUS) {
				resultado.push({ ...campo, rotulo: cfg.status.rotulo || "Status" });
				continue;
			}
			if (campo.id === ID_DATA_ACAO) {
				resultado.push({ ...campo, rotulo: cfg.dataTarefa.rotulo || "Prazo" });
				continue;
			}
			// Recorrência só aparece se o recurso estiver ligado no grupo — mesma regra que já esconde o
			// campo do modal de editar tarefa e da nota (ver campoVisivelNaNota).
			if (campo.id === ID_RECORRENCIA_ACAO) {
				if (cfg.recorrenciaAtiva) resultado.push({ ...campo, rotulo: rotuloFixo(cfg, "recorrencia") });
				continue;
			}
			if (campo.id === ID_ANTECEDENCIA_ACAO) {
				resultado.push({ ...campo, rotulo: rotuloFixo(cfg, "antecedencia") });
				continue;
			}
			if (campo.id === ID_MANTER_HISTORICO_ACAO) {
				resultado.push({ ...campo, rotulo: rotuloFixo(cfg, "manterHistorico") });
				continue;
			}
			// Uma propriedade removida em Configurações depois de ter sido posta na captura simplesmente
			// some da barra, em vez de desenhar um controle sem opções que gravaria lixo.
			const def = cfg.propriedades.find((p) => p.id === campo.id);
			if (def) resultado.push({ ...campo, rotulo: def.rotulo, def });
		}
		return resultado;
	}

	// As opções de um campo, na ordem em que aparecem. Devolve null quando o campo não tem lista
	// fechada de opções (texto, lista, ou link de arquivo SEM "Arquivos fixos" configurados) — esses
	// não podem virar botões, porque não há um conjunto conhecido pra desenhar.
	private opcoesDoCampo(campo: CampoDesenhavel): { valor: string; rotulo: string }[] | null {
		const cfg = this.opcoes.configuracoes;

		if (campo.id === ID_DATA_ACAO || campo.def?.tipo === "data") {
			// O prazo não tem opções cadastradas: são atalhos de data. Ela pediu exatamente estes
			// ("hoje, amanhã e escolher data") — o "escolher data" é tratado à parte no desenho.
			return [
				{ valor: "hoje", rotulo: "hoje" },
				{ valor: "amanha", rotulo: "amanhã" },
			];
		}

		if (campo.id === ID_STATUS) {
			return cfg.status.opcoes.map((o) => ({ valor: o.valor, rotulo: o.valor }));
		}

		// Recorrência: as mesmas opções do modal de editar tarefa, menos "Não repete" — na captura, não
		// marcar nada JÁ é "não repete", e uma pastilha pra isso só ocuparia espaço.
		if (campo.id === ID_RECORRENCIA_ACAO) {
			return (Object.keys(RECORRENCIA_LABELS) as Recorrencia[])
				.filter((r) => r !== "nenhuma")
				.map((r) => ({ valor: r, rotulo: RECORRENCIA_LABELS[r] }));
		}

		// Antecedência não passa por aqui: é campo numérico, tratado antes de escolher a apresentação.
		if (campo.id === ID_MANTER_HISTORICO_ACAO) return OPCOES_MANTER_HISTORICO_CAPTURA;

		if (campo.def?.tipo === "selecao") {
			return (campo.def.opcoes ?? []).map((o) => ({ valor: o.valor, rotulo: o.valor }));
		}

		// Link de arquivo: SÓ os arquivos cadastrados em "Arquivos fixos" da propriedade. Sem lista
		// cadastrada não há opções — o campo cai na busca livre do vault (ver abrirEditorDeCampo).
		if (campo.def?.tipo === "link_arquivo") {
			const fixos = campo.def.arquivosFixos ?? [];
			if (fixos.length === 0) return null;
			return fixos.map((caminho) => ({
				valor: caminho,
				rotulo: rotuloDeArquivoNaCaptura(
					this.opcoes.app,
					caminho,
					campo.def?.exibirAliasNaCaptura ?? false
				),
			}));
		}

		return null;
	}

	private renderizarCampos(): void {
		if (!this.areaCampos) return;
		this.areaCampos.empty();

		const campos = this.definicoesDeCampo();
		if (campos.length === 0) {
			this.areaCampos.addClass("mytasks-oculto");
			return;
		}
		this.areaCampos.removeClass("mytasks-oculto");

		// Cada campo ganha o próprio BLOCO: o nome da propriedade em cima e os controles embaixo, nas
		// duas apresentações. Com "botões", sem o nome as opções de status e de etiqueta viravam uma
		// sopa de pastilhas sem dizer qual é de quê; com "menu", o nome some da pastilha assim que um
		// valor é escolhido (a pastilha passa a mostrar o valor), e aí não sobrava nada dizendo de que
		// campo aquilo é.
		for (const campo of campos) {
			const bloco = this.areaCampos.createDiv({ cls: "mytasks-captura-campo-bloco" });
			bloco.createDiv({ cls: "mytasks-captura-campo-rotulo", text: campo.rotulo.toLowerCase() });

			const linha = bloco.createDiv({ cls: "mytasks-captura-linha-campo" });

			// Antecedência é número de dias digitado, em qualquer apresentação: uma lista fechada de
			// pastilhas (1, 2, 3, 7) não cobre 15 ou 30 dias, e ela pediu pra digitar.
			if (campo.id === ID_ANTECEDENCIA_ACAO) {
				this.desenharCampoNumerico(linha, campo);
				continue;
			}

			const opcoes = campo.apresentacao === "botoes" ? this.opcoesDoCampo(campo) : null;
			if (opcoes) this.desenharCampoComoBotoes(linha, campo, opcoes);
			else this.desenharCampo(linha, campo);
		}
	}

	// Apresentação "botões": todas as opções à vista, um clique marca. Clicar na opção já marcada
	// desmarca — sem isso não haveria como limpar um campo sem um botão extra de "sem valor".
	private desenharCampoComoBotoes(
		container: HTMLElement,
		campo: CampoDesenhavel,
		opcoes: { valor: string; rotulo: string }[]
	): void {
		const ehPrazo = campo.id === ID_DATA_ACAO || campo.def?.tipo === "data";

		// Quantos controles esta linha vai desenhar ao todo — no prazo entra o "escolher data" no fim.
		// Serve pra saber qual é o ÚLTIMO e se ele fica sozinho na linha da grade (total ímpar), caso
		// em que ele ocupa as duas colunas em vez de deixar um buraco à direita.
		const total = opcoes.length + (ehPrazo ? 1 : 0);
		const ultimoSozinho = total % 2 === 1;

		opcoes.forEach((opcao, indice) => {
			// No prazo o valor guardado é a DATA calculada, não o atalho: comparar "hoje" com
			// "2026-08-04" nunca casaria, e o botão nunca acenderia.
			const valorEfetivo = ehPrazo ? this.dataDoAtalho(opcao.valor) : opcao.valor;
			const marcado = this.valores[campo.id] === valorEfetivo;

			const botao = container.createEl("button", {
				cls: "mytasks-captura-campo mytasks-seletor-discreto",
				attr: { "aria-label": `${campo.rotulo}: ${opcao.rotulo}` },
			});
			// Só quando NÃO é prazo: ali o último da grade é o "escolher data", desenhado depois.
			if (ultimoSozinho && !ehPrazo && indice === opcoes.length - 1) {
				botao.addClass("mytasks-captura-campo-largo");
			}
			botao.toggleClass("mytasks-captura-campo-preenchido", marcado);
			botao.createSpan({ cls: "mytasks-seletor-discreto-texto", text: opcao.rotulo });
			botao.addEventListener("click", () => {
				if (marcado) delete this.valores[campo.id];
				else this.valores[campo.id] = valorEfetivo;
				this.renderizarCampos();
			});
		});

		// "escolher data" fecha a linha do prazo — é o terceiro item que ela pediu, e precisa de um
		// seletor de verdade em vez de um valor fixo.
		if (ehPrazo) {
			const atual = this.valores[campo.id];
			const temDataLivre =
				typeof atual === "string" && atual !== this.dataDoAtalho("hoje") && atual !== this.dataDoAtalho("amanha");

			const botao = container.createEl("button", {
				cls: "mytasks-captura-campo mytasks-seletor-discreto",
				attr: { "aria-label": `${campo.rotulo}: escolher data` },
			});
			// É o último da grade no prazo; com total ímpar (hoje/amanhã/escolher = 3) ocupa a linha.
			if (ultimoSozinho) botao.addClass("mytasks-captura-campo-largo");
			botao.toggleClass("mytasks-captura-campo-preenchido", temDataLivre);
			botao.createSpan({
				cls: "mytasks-seletor-discreto-texto",
				text: temDataLivre ? (atual as string) : "escolher data",
			});
			botao.addEventListener("click", () => this.abrirSeletorDeData(campo.id));
		}
	}

	// Antecedência: um input de número dentro da casca de pastilha, ocupando a linha inteira. Grava
	// direto em `valores` a cada digitação — não há botão de confirmar aqui, e re-renderizar a cada
	// tecla tiraria o foco do campo no meio da digitação.
	private desenharCampoNumerico(container: HTMLElement, campo: CampoDesenhavel): void {
		const caixa = container.createDiv({
			cls: "mytasks-captura-numero mytasks-captura-campo-largo",
		});

		const input = caixa.createEl("input", {
			type: "number",
			attr: { min: "0", max: "365", placeholder: "0", "aria-label": campo.rotulo },
		});

		const atual = this.valores[campo.id];
		if (typeof atual === "string" || typeof atual === "number") input.value = String(atual);

		caixa.createSpan({ cls: "mytasks-captura-numero-sufixo", text: "dias antes" });

		input.addEventListener("input", () => {
			const texto = input.value.trim();
			// Campo vazio é "sem aviso antecipado" — apagar tem que LIMPAR o valor, não gravar 0 (que
			// significaria avisar no próprio dia).
			if (!texto) {
				delete this.valores[campo.id];
				return;
			}
			const dias = Number(texto);
			if (!Number.isFinite(dias) || dias < 0) return;
			this.valores[campo.id] = String(Math.floor(dias));
		});

		// Enter dentro do campo captura a tarefa, como no campo de título — senão ela teria que voltar
		// ao título só pra confirmar.
		input.addEventListener("keydown", (evento) => {
			if (evento.key !== "Enter") return;
			evento.preventDefault();
			void this.capturar();
		});
	}

	private dataDoAtalho(atalho: string): string {
		const data = new Date();
		if (atalho === "amanha") data.setDate(data.getDate() + 1);
		return formatarData(data);
	}

	// Cada campo é uma pastilha clicável que abre um menu com as opções (ou um input de data). Menu, e
	// não dropdown nativo, pelo mesmo motivo dos outros seletores do plugin: a sidebar é estreita e um
	// <select> com o rótulo dentro estouraria a largura.
	private desenharCampo(container: HTMLElement, campo: CampoDesenhavel): void {
		const valorAtual = this.valores[campo.id];
		const temValor = valorAtual !== undefined && valorAtual !== null && valorAtual !== "";

		const botao = container.createEl("button", {
			// Pastilha única do campo: sozinha na grade, ocupa as duas colunas — com metade da largura
			// sobraria um buraco à direita.
			cls: "mytasks-captura-campo mytasks-seletor-discreto mytasks-captura-campo-largo",
			attr: { "aria-label": campo.rotulo },
		});
		botao.toggleClass("mytasks-captura-campo-preenchido", temValor);
		// Sem valor mostra "escolher", não o nome do campo: o nome já está no rótulo acima da linha,
		// e repeti-lo dentro da pastilha diria a mesma coisa duas vezes.
		botao.createSpan({
			cls: "mytasks-seletor-discreto-texto",
			text: temValor ? this.rotuloDoValor(campo, valorAtual) : "escolher",
		});

		// Seta pra baixo: é o que diz que a pastilha ABRE uma lista, em vez de ser um botão que já
		// marca um valor (como os da apresentação em botões, na linha ao lado).
		const chevron = botao.createSpan({ cls: "mytasks-seletor-discreto-chevron" });
		setIcon(chevron, "chevron-down");

		botao.addEventListener("click", (evento) => this.abrirEditorDeCampo(evento, campo));
	}

	private rotuloDoValor(campo: { def?: PropriedadeDefinida }, valor: PropriedadeValor): string {
		if (Array.isArray(valor)) return valor.join(", ");
		if (typeof valor !== "string") return String(valor);
		// Link de arquivo guarda o caminho completo; na pastilha só cabe (e só interessa) o nome da nota
		// — ou o alias dela, se a propriedade estiver configurada assim.
		if (campo.def?.tipo === "link_arquivo") {
			return rotuloDeArquivoNaCaptura(this.opcoes.app, valor, campo.def.exibirAliasNaCaptura ?? false);
		}
		return valor;
	}

	private abrirEditorDeCampo(evento: MouseEvent, campo: CampoDesenhavel): void {
		if (campo.id === ID_DATA_ACAO || campo.def?.tipo === "data") {
			this.abrirMenuData(evento, campo.id);
			return;
		}

		// Status, seleção e link de arquivo COM "Arquivos fixos" têm lista fechada — viram menu de
		// opções. Link de arquivo sem lista cadastrada cai na busca livre do vault logo abaixo.
		const opcoes = this.opcoesDoCampo(campo);
		if (opcoes) {
			this.abrirMenuDeOpcoes(evento, campo.id, opcoes);
			return;
		}

		if (campo.def?.tipo === "link_arquivo") {
			this.abrirBuscaDeArquivo(campo);
			return;
		}

		// texto e lista: digitação livre num campo que aparece no lugar da pastilha.
		this.abrirEntradaDeTexto(campo);
	}

	// Abre o menu colado na BORDA INFERIOR ESQUERDA da pastilha clicada, e não no ponto do cursor
	// (`showAtMouseEvent`): clicando na direita da pastilha o menu descia deslocado, sem relação
	// visível com o controle que o abriu. Mesmo critério dos seletores do cabeçalho das views.
	private abrirMenuSobOControle(menu: Menu, evento: MouseEvent): void {
		const alvo = (evento.currentTarget ?? evento.target) as HTMLElement | null;
		if (!alvo) {
			menu.showAtMouseEvent(evento);
			return;
		}
		// `currentTarget` é o <button>; o clique pode ter caído num <span> dentro dele, então subir
		// até a pastilha garante o retângulo certo mesmo quando o listener é herdado.
		const pastilha = alvo.closest("button") ?? alvo;
		const retangulo = pastilha.getBoundingClientRect();
		menu.showAtPosition({ x: retangulo.left, y: retangulo.bottom + 4 });
	}

	private abrirMenuDeOpcoes(
		evento: MouseEvent,
		campoId: string,
		opcoes: { valor: string; rotulo: string }[]
	): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);

		menu.addItem((item) =>
			item
				.setTitle("— sem valor —")
				.setIcon("x")
				.onClick(() => {
					delete this.valores[campoId];
					this.renderizarCampos();
				})
		);

		for (const opcao of opcoes) {
			menu.addItem((item) =>
				item
					.setTitle(opcao.rotulo)
					.setChecked(this.valores[campoId] === opcao.valor)
					.onClick(() => {
						this.valores[campoId] = opcao.valor;
						this.renderizarCampos();
					})
			);
		}

		this.abrirMenuSobOControle(menu, evento);
	}

	private abrirMenuData(evento: MouseEvent, campoId: string): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);

		const marcar = (dias: number) => {
			const data = new Date();
			data.setDate(data.getDate() + dias);
			this.valores[campoId] = formatarData(data);
			this.renderizarCampos();
		};

		// Mesmos atalhos da apresentação em botões (hoje / amanhã / escolher data), pra trocar de
		// apresentação não mudar as opções disponíveis. "Em 7 dias" fica por perto por ser o outro
		// adiamento que ela usa nos presets.
		menu.addItem((item) => item.setTitle("Hoje").setIcon("sun").onClick(() => marcar(0)));
		menu.addItem((item) => item.setTitle("Amanhã").setIcon("arrow-right").onClick(() => marcar(1)));
		menu.addItem((item) => item.setTitle("Em 7 dias").setIcon("calendar-clock").onClick(() => marcar(7)));
		menu.addItem((item) =>
			item
				.setTitle("Escolher data...")
				.setIcon("calendar")
				.onClick(() => this.abrirSeletorDeData(campoId))
		);
		menu.addItem((item) =>
			item
				.setTitle("— sem data —")
				.setIcon("x")
				.onClick(() => {
					delete this.valores[campoId];
					this.renderizarCampos();
				})
		);

		this.abrirMenuSobOControle(menu, evento);
	}

	// Input nativo de data, mostrado no lugar da barra de campos até ela escolher. Usa showPicker()
	// quando existe (Chromium recente) pra abrir o calendário direto, sem um segundo clique.
	private abrirSeletorDeData(campoId: string): void {
		if (!this.areaCampos) return;
		this.areaCampos.empty();

		const input = this.areaCampos.createEl("input", { type: "date", cls: "mytasks-captura-data" });
		const atual = this.valores[campoId];
		if (typeof atual === "string") input.value = atual;

		const concluir = () => {
			if (input.value) this.valores[campoId] = input.value;
			else delete this.valores[campoId];
			this.renderizarCampos();
		};

		input.addEventListener("change", concluir);
		// blur fecha sem perder o que já foi digitado — sem isso, clicar fora deixaria a barra de campos
		// substituída pelo input de data até a próxima captura.
		input.addEventListener("blur", () => window.setTimeout(concluir, 100));
		input.focus();
		(input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
	}

	private abrirBuscaDeArquivo(campo: { id: string; rotulo: string }): void {
		if (!this.areaCampos) return;
		this.areaCampos.empty();

		const input = this.areaCampos.createEl("input", {
			type: "text",
			cls: "mytasks-captura-busca",
			placeholder: `${campo.rotulo}: buscar nota...`,
		});

		new SugestorArquivos(this.opcoes.app, input, (arquivo: TFile) => {
			this.valores[campo.id] = arquivo.path;
			this.renderizarCampos();
		});

		input.addEventListener("keydown", (evento) => {
			if (evento.key === "Escape") this.renderizarCampos();
		});
		input.addEventListener("blur", () => window.setTimeout(() => this.renderizarCampos(), 150));
		input.focus();
	}

	private abrirEntradaDeTexto(campo: { id: string; rotulo: string; def?: PropriedadeDefinida }): void {
		if (!this.areaCampos) return;
		this.areaCampos.empty();

		const input = this.areaCampos.createEl("input", {
			type: "text",
			cls: "mytasks-captura-busca",
			placeholder: campo.def?.tipo === "lista" ? `${campo.rotulo}: separe por vírgula` : campo.rotulo,
		});
		const atual = this.valores[campo.id];
		if (typeof atual === "string") input.value = atual;
		else if (Array.isArray(atual)) input.value = atual.join(", ");

		const concluir = () => {
			const texto = input.value.trim();
			if (!texto) delete this.valores[campo.id];
			else if (campo.def?.tipo === "lista") {
				this.valores[campo.id] = texto
					.split(",")
					.map((v) => v.trim())
					.filter((v) => v.length > 0);
			} else this.valores[campo.id] = texto;
			this.renderizarCampos();
		};

		input.addEventListener("keydown", (evento) => {
			if (evento.key === "Enter") {
				evento.preventDefault();
				concluir();
			}
			if (evento.key === "Escape") this.renderizarCampos();
		});
		input.addEventListener("blur", concluir);
		input.focus();
	}

	private desenharPreset(container: HTMLElement, preset: PresetCaptura): void {
		const botao = container.createEl("button", {
			cls: "mytasks-captura-preset mytasks-seletor-discreto",
			attr: { "aria-label": preset.nome },
		});
		if (preset.icone) {
			const icone = botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
			setIcon(icone, preset.icone);
		}
		botao.createSpan({ cls: "mytasks-seletor-discreto-texto", text: preset.nome });
		botao.addEventListener("click", () => void this.capturar(preset));
	}

	// Cria a tarefa. Sem preset, usa só o que estiver marcado nos campos; com preset, as ações dele
	// entram POR CIMA dos campos — clicar "Hoje" tem que marcar hoje mesmo que o campo de prazo esteja
	// com outra data, senão o preset não faria o que o nome dele promete.
	private async capturar(preset?: PresetCaptura): Promise<void> {
		if (!this.input) return;
		const titulo = this.input.value.trim();
		if (!titulo) return;

		const valores: ValoresCaptura = { ...this.valores };
		if (preset) {
			for (const acao of preset.acoes) valores[acao.campo] = valorDaAcao(acao);
		}

		// statusFixo vence tudo: o bloco do Inbox é captura crua e cai sempre lá, mesmo que uma
		// propriedade de status tenha sido marcada por engano.
		const status = this.opcoes.statusFixo ?? valores[ID_STATUS];
		const data = valores[ID_DATA_ACAO];
		// Só as propriedades customizadas seguem em `propriedades` — status, prazo e os três campos de
		// comportamento têm caminho próprio em criarTarefaRapida (regra posicional de status, chave da
		// data, chaves fixas de recorrência/antecedência/histórico).
		const propriedades: Record<string, PropriedadeValor> = {};
		for (const [id, valor] of Object.entries(valores)) {
			if (id === ID_STATUS || id === ID_DATA_ACAO) continue;
			if (IDS_CAMPOS_COMPORTAMENTO.includes(id)) continue;
			propriedades[id] = valor;
		}

		const recorrencia = valores[ID_RECORRENCIA_ACAO];
		const antecedencia = valores[ID_ANTECEDENCIA_ACAO];
		const manterHistorico = valores[ID_MANTER_HISTORICO_ACAO];

		try {
			await this.opcoes.repositorio.criarTarefaRapida(titulo, {
				status: typeof status === "string" ? status : null,
				data: typeof data === "string" ? data : null,
				propriedades,
				recorrencia: typeof recorrencia === "string" ? (recorrencia as Recorrencia) : null,
				diasAntecedenciaAviso: typeof antecedencia === "string" ? Number(antecedencia) : null,
				// Só uma escolha explícita decide; sem marcar nada, a nota modelo continua mandando.
				manterHistorico: typeof manterHistorico === "string" ? manterHistorico === "sim" : null,
			});
		} catch (erro) {
			console.error("[my-tasks] falha ao capturar tarefa", erro);
			new Notice("Não deu para criar a tarefa.");
			return;
		}

		this.input.value = "";
		if (this.opcoes.configuracoes.captura.limparAposCapturar) this.valores = {};
		this.renderizarCampos();
		this.input.focus();
		this.opcoes.aoCapturar();
	}
}
