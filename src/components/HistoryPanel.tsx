import type { HistoryEntry } from "../screenplay/history";
import { estimatePages } from "../screenplay/pages";
import "./HistoryPanel.css";

interface Props {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const formatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function HistoryPanel({ entries, onRestore, onDelete, onClose }: Props) {
  const ordered = [...entries].reverse();

  return (
    <div className="history-panel__overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-panel__header">
          <h3>Historial de versiones</h3>
          <button className="history-panel__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {ordered.length === 0 && (
          <p className="history-panel__empty">
            Todavía no hay versiones guardadas. Se van a ir creando solas mientras escribís, o al
            guardar un archivo.
          </p>
        )}
        <ul className="history-panel__list">
          {ordered.map((entry) => (
            <li key={entry.id} className="history-panel__item">
              <div className="history-panel__meta">
                <span className="history-panel__date">{formatter.format(entry.timestamp)}</span>
                <span className="history-panel__title">{entry.title || "Sin título"}</span>
                <span className="history-panel__pages">≈ {estimatePages(entry.elements)} pág.</span>
              </div>
              <div className="history-panel__actions">
                <button onClick={() => onRestore(entry)}>Restaurar</button>
                <button onClick={() => onDelete(entry.id)} className="history-panel__delete">
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
