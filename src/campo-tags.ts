export class CampoTags {
	private valores: string[];
	private containerChips: HTMLElement;
	private input: HTMLInputElement;
	private listaSugestoes: HTMLElement;

	constructor(
		container: HTMLElement,
		valoresIniciais: string[],
		private sugestoesDisponiveis: string[],
		private aoMudar: (valores: string[]) => void
	) {
		this.valores = [...valoresIniciais];

		const wrapper = container.createDiv({ cls: "mytasks-campo-tags" });
		this.containerChips = wrapper.createDiv({ cls: "mytasks-tags-chips" });

		this.input = wrapper.createEl("input", {
			type: "text",
			placeholder: "Digite e pressione Enter",
			cls: "mytasks-tags-input",
		});

		this.listaSugestoes = wrapper.createDiv({ cls: "mytasks-tags-sugestoes" });
		this.listaSugestoes.hide();

		this.input.addEventListener("input", () => this.atualizarSugestoes());
		this.input.addEventListener("focus", () => this.atualizarSugestoes());
		this.input.addEventListener("click", () => this.atualizarSugestoes());
		this.input.addEventListener("blur", () => {
			window.setTimeout(() => this.listaSugestoes.hide(), 150);
		});
		this.input.addEventListener("keydown", (evento) => {
			if (evento.key === "Enter") {
				evento.preventDefault();
				this.confirmarValor(this.input.value);
			} else if (evento.key === "Backspace" && this.input.value === "" && this.valores.length > 0) {
				this.removerValor(this.valores[this.valores.length - 1]);
			}
		});

		this.renderizarChips();
	}

	private confirmarValor(valorBruto: string) {
		const valor = valorBruto.trim();
		if (!valor || this.valores.includes(valor)) {
			this.input.value = "";
			return;
		}
		this.valores.push(valor);
		this.input.value = "";
		this.listaSugestoes.hide();
		this.renderizarChips();
		this.aoMudar(this.valores);
	}

	private removerValor(valor: string) {
		this.valores = this.valores.filter((v) => v !== valor);
		this.renderizarChips();
		this.aoMudar(this.valores);
	}

	private renderizarChips() {
		this.containerChips.empty();
		for (const valor of this.valores) {
			const chip = this.containerChips.createDiv({ cls: "mytasks-tag-chip" });
			chip.createSpan({ text: valor });
			const remover = chip.createSpan({ text: "×", cls: "mytasks-tag-remover" });
			remover.addEventListener("click", () => this.removerValor(valor));
		}
	}

	private atualizarSugestoes() {
		const query = this.input.value.trim().toLowerCase();
		const candidatas = this.sugestoesDisponiveis.filter(
			(s) => !this.valores.includes(s) && (query === "" || s.toLowerCase().includes(query))
		);

		this.listaSugestoes.empty();
		if (candidatas.length === 0) {
			this.listaSugestoes.hide();
			return;
		}

		for (const sugestao of candidatas.slice(0, 8)) {
			const item = this.listaSugestoes.createDiv({ cls: "mytasks-tag-sugestao" });
			item.setText(sugestao);
			item.addEventListener("mousedown", (evento) => {
				evento.preventDefault();
				this.confirmarValor(sugestao);
			});
		}
		this.listaSugestoes.show();
	}
}
