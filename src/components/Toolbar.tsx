import { ELEMENT_LABELS, ELEMENT_ORDER, type ElementType } from "../screenplay/types";
import "./Toolbar.css";

interface Props {
  activeType: ElementType | null;
  onSetType: (type: ElementType) => void;
  onNew: () => void;
  onOpen: () => void;
  onSaveFountain: () => void;
  onSaveJson: () => void;
  onExportPdf: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  pageEstimate: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onToggleHistory: () => void;
}

const SHORTCUT_BY_TYPE: Record<ElementType, string> = {
  scene_heading: "Ctrl+1",
  action: "Ctrl+2",
  character: "Ctrl+3",
  parenthetical: "Ctrl+4",
  dialogue: "Ctrl+5",
  transition: "Ctrl+6",
  shot: "Ctrl+7",
  centered: "",
};

export function Toolbar({
  activeType,
  onSetType,
  onNew,
  onOpen,
  onSaveFountain,
  onSaveJson,
  onExportPdf,
  title,
  onTitleChange,
  pageEstimate,
  theme,
  onToggleTheme,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onToggleHistory,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <input
          className="toolbar__title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Título del guion"
        />
        <div className="toolbar__file-actions">
          <button onClick={onNew}>Nuevo</button>
          <button onClick={onOpen}>Abrir</button>
          <button onClick={onSaveFountain}>Guardar .fountain</button>
          <button onClick={onSaveJson}>Guardar .json</button>
          <button onClick={onExportPdf}>Exportar PDF</button>
          <button onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
            ↶ Deshacer
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Ctrl+Shift+Z">
            ↷ Rehacer
          </button>
          <button onClick={onToggleHistory}>Historial</button>
        </div>
        <div className="toolbar__pages">≈ {pageEstimate} pág.</div>
        <button
          className="toolbar__theme-toggle"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
      <div className="toolbar__row toolbar__elements">
        {ELEMENT_ORDER.map((type) => (
          <button
            key={type}
            className={activeType === type ? "active" : ""}
            onClick={() => onSetType(type)}
            title={SHORTCUT_BY_TYPE[type]}
          >
            {ELEMENT_LABELS[type]}
          </button>
        ))}
        <span className="toolbar__hint">Tab: siguiente elemento · Shift+Tab: anterior · Enter: nueva línea</span>
      </div>
    </div>
  );
}
