import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import { ScreenplayEditor, type ScreenplayEditorHandle } from "./components/ScreenplayEditor";
import { Toolbar } from "./components/Toolbar";
import { SceneNavigator } from "./components/SceneNavigator";
import { type ScriptElement, type ElementType, emptyElement } from "./screenplay/types";
import { fromFountain, toFountain } from "./screenplay/fountain";
import { estimatePages } from "./screenplay/pages";
import { applyTheme, getInitialTheme, persistTheme, type Theme } from "./theme";
import { HistoryPanel } from "./components/HistoryPanel";
import { type HistoryEntry, deleteSnapshot, loadHistory, pushSnapshot } from "./screenplay/history";
import "./App.css";

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const UNDO_DEBOUNCE_MS = 800;
const MAX_UNDO_DEPTH = 100;

const STORAGE_KEY = "guionapp:document";

interface StoredDoc {
  title: string;
  elements: ScriptElement[];
}

function loadFromStorage(): StoredDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDoc;
      if (parsed.elements?.length) return parsed;
    }
  } catch {
    // ignore corrupted storage
  }
  return { title: "Sin título", elements: [emptyElement("scene_heading")] };
}

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

interface DownloadsCapability {
  save: (req: { filename: string; data: Blob }) => Promise<{ status: string }>;
}

/** Saves a file both as a normal local web app (classic <a download>) and when
 *  published as a Claude Artifact, where the sandbox blocks anchor downloads
 *  and requires the `downloads` capability instead. Artifact-only extensions
 *  are limited, so `.fountain` becomes `.txt` there (still plain Fountain text). */
async function saveFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });

  if (window.claude?.use) {
    try {
      const downloads = (await window.claude.use("downloads")) as DownloadsCapability | null;
      if (!downloads) return;
      const artifactSafeName = filename.replace(/\.fountain$/, ".txt");
      await downloads.save({ filename: artifactSafeName, data: blob });
    } catch {
      // viewer declined, rate-limited, or capability unavailable — nothing more to do
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const initial = useMemo(loadFromStorage, []);
  const editorRef = useRef<ScreenplayEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initial.title);
  const [elements, setElements] = useState<ScriptElement[]>(initial.elements);
  const [activeElementId, setActiveElementId] = useState<string | null>(initial.elements[0]?.id ?? null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(loadHistory);

  const undoStack = useRef<ScriptElement[][]>([]);
  const redoStack = useRef<ScriptElement[][]>([]);
  const lastCommitted = useRef<ScriptElement[]>(initial.elements);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceUndoRedoRerender] = useState(0);
  const isRestoring = useRef(false);
  const lastSnapshotRef = useRef<string>(JSON.stringify({ title: initial.title, elements: initial.elements }));

  // Kept current on every render so timers below don't need to be torn down
  // and recreated on every keystroke just to see fresh values.
  const latestRef = useRef({ title, elements });
  latestRef.current = { title, elements };

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  function handleToggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  const handleEditorChange = useCallback((els: ScriptElement[]) => {
    setElements(els);
  }, []);

  // Groups rapid typing into a single undo step: only commits the previous
  // state once editing has paused, instead of on every keystroke.
  useEffect(() => {
    if (isRestoring.current) {
      isRestoring.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const prev = lastCommitted.current;
      if (prev !== elements) {
        undoStack.current.push(prev);
        if (undoStack.current.length > MAX_UNDO_DEPTH) undoStack.current.shift();
        redoStack.current = [];
        lastCommitted.current = elements;
        forceUndoRedoRerender((n) => n + 1);
      }
    }, UNDO_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [elements]);

  function applyElements(next: ScriptElement[]) {
    isRestoring.current = true;
    lastCommitted.current = next;
    setElements(next);
    editorRef.current?.loadElements(next);
  }

  function handleUndo() {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(lastCommitted.current);
    applyElements(prev);
    forceUndoRedoRerender((n) => n + 1);
  }

  function handleRedo() {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(lastCommitted.current);
    applyElements(next);
    forceUndoRedoRerender((n) => n + 1);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const { title, elements } = latestRef.current;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, elements }));
    }, 400);
    return () => clearTimeout(id);
  }, [title, elements]);

  // Periodic checkpoint so a version history survives even if the writer
  // never explicitly exports a file. Runs on a single long-lived interval
  // (not recreated per keystroke) that always reads the latest doc via ref.
  useEffect(() => {
    const id = setInterval(() => {
      const { title, elements } = latestRef.current;
      const serialized = JSON.stringify({ title, elements });
      if (serialized !== lastSnapshotRef.current) {
        lastSnapshotRef.current = serialized;
        setHistoryEntries(pushSnapshot(title, elements));
      }
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  function snapshotNow() {
    lastSnapshotRef.current = JSON.stringify({ title, elements });
    setHistoryEntries(pushSnapshot(title, elements));
  }

  function handleRestoreVersion(entry: HistoryEntry) {
    if (!confirm(`¿Restaurar la versión del ${new Date(entry.timestamp).toLocaleString("es-AR")}? Tu versión actual se guarda como checkpoint antes de restaurar.`)) {
      return;
    }
    snapshotNow();
    setTitle(entry.title);
    applyElements(entry.elements);
    setShowHistory(false);
  }

  function handleDeleteVersion(id: string) {
    setHistoryEntries(deleteSnapshot(id));
  }

  useEffect(() => {
    document.title = `${title} — GuionApp`;
  }, [title]);

  const activeType = elements.find((el) => el.id === activeElementId)?.type ?? null;
  const pageEstimate = useMemo(() => estimatePages(elements), [elements]);

  function handleSetType(type: ElementType) {
    if (activeElementId) editorRef.current?.setElementType(activeElementId, type);
  }

  function handleNew() {
    if (!confirm("¿Crear un guion nuevo? Se perderá lo que no esté guardado.")) return;
    const fresh = [emptyElement("scene_heading")];
    editorRef.current?.loadElements(fresh);
    setElements(fresh);
    setTitle("Sin título");
  }

  function handleOpen() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let loaded: ScriptElement[];
    if (file.name.endsWith(".json")) {
      const parsed = JSON.parse(text) as StoredDoc;
      loaded = parsed.elements;
      setTitle(parsed.title ?? file.name.replace(/\.json$/, ""));
    } else {
      loaded = fromFountain(text);
      setTitle(file.name.replace(/\.fountain$/, ""));
    }
    editorRef.current?.loadElements(loaded);
    setElements(loaded);
    e.target.value = "";
  }

  function handleSaveFountain() {
    saveFile(`${title || "guion"}.fountain`, toFountain(elements), "text/plain;charset=utf-8");
    snapshotNow();
  }

  function handleSaveJson() {
    saveFile(
      `${title || "guion"}.json`,
      JSON.stringify({ title, elements }, null, 2),
      "application/json;charset=utf-8"
    );
    snapshotNow();
  }

  function handleExportPdf() {
    window.print();
  }

  function handleJumpToScene(id: string) {
    setActiveElementId(id);
    editorRef.current?.focusElement(id);
  }

  return (
    <div className="app">
      <Toolbar
        activeType={activeType}
        onSetType={handleSetType}
        onNew={handleNew}
        onOpen={handleOpen}
        onSaveFountain={handleSaveFountain}
        onSaveJson={handleSaveJson}
        onExportPdf={handleExportPdf}
        title={title}
        onTitleChange={setTitle}
        pageEstimate={pageEstimate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.current.length > 0}
        canRedo={redoStack.current.length > 0}
        onToggleHistory={() => setShowHistory((v) => !v)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".fountain,.txt,.json"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />
      <div className="app__body">
        <SceneNavigator elements={elements} onJump={handleJumpToScene} />
        <div className="app__editor-scroll">
          <ScreenplayEditor
            ref={editorRef}
            initialElements={initial.elements}
            onChange={handleEditorChange}
            activeElementId={activeElementId}
            onActiveElementChange={setActiveElementId}
          />
        </div>
      </div>
      {showHistory && (
        <HistoryPanel
          entries={historyEntries}
          onRestore={handleRestoreVersion}
          onDelete={handleDeleteVersion}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

export default App;
