import { Menu, setIcon } from "obsidian";
import { ConfiguracoesGestorTarefas } from "./tipos";

export interface OpcoesSeletorGrupo {
	// Config GLOBAL (o seletor precisa da lista completa de grupos, não só do grupo ativo).
	configuracoes: ConfiguracoesGestorTarefas;
	grupoAtivoId: string;
	// Ícone Lucide do gatilho (ex: "square-kanban" no Kanban, "calendar-days" no Calendário).
	icone: string;
	aoEscolher: (grupoId: string) => void;
}

// Botão só-ícone discreto que abre um Menu com os grupos de tarefas, para alternar o grupo ativo de uma
// view única (Kanban/Calendário). Modelado em SeletorAgrupamento/SeletorFiltroSalvo.
export class SeletorGrupo {
	private botao: HTMLButtonElement;

	constructor(private container: HTMLElement, private opcoes: OpcoesSeletorGrupo) {
		this.botao = container.createEl("button", {
			cls: "mytasks-seletor-discreto mytasks-seletor-so-icone mytasks-seletor-grupo",
			attr: { "aria-label": "Grupo de tarefas" },
		});
		const icone = this.botao.createSpan({ cls: "mytasks-seletor-discreto-icone" });
		setIcon(icone, opcoes.icone);

		this.botao.addEventListener("click", () => this.abrirMenu());
	}

	private abrirMenu(): void {
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		menu.addItem((item) => item.setTitle("selecionar grupo").setDisabled(true));
		menu.addSeparator();
		for (const grupo of this.opcoes.configuracoes.grupos) {
			menu.addItem((item) =>
				item
					.setTitle(grupo.nome)
					.setIcon(grupo.icone)
					.setChecked(grupo.id === this.opcoes.grupoAtivoId)
					.onClick(() => {
						if (grupo.id === this.opcoes.grupoAtivoId) return;
						this.opcoes.aoEscolher(grupo.id);
					})
			);
		}
		const retangulo = this.botao.getBoundingClientRect();
		menu.showAtPosition({ x: retangulo.left, y: retangulo.bottom + 4 });
	}
}
