import type { ScriptElement } from "./types";

const HISTORY_KEY = "guionapp:history";
const MAX_ENTRIES = 40;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  title: string;
  elements: ScriptElement[];
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // storage full or unavailable — the running document still works, it just
    // won't gain another checkpoint this time
  }
}

/** Appends a checkpoint unless it is identical to the most recent one. */
export function pushSnapshot(title: string, elements: ScriptElement[]): HistoryEntry[] {
  const history = loadHistory();
  const last = history[history.length - 1];
  const serialized = JSON.stringify({ title, elements });
  if (last && JSON.stringify({ title: last.title, elements: last.elements }) === serialized) {
    return history;
  }
  const entry: HistoryEntry = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    timestamp: Date.now(),
    title,
    elements,
  };
  const next = [...history, entry];
  saveHistory(next);
  return next;
}

export function deleteSnapshot(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id);
  saveHistory(next);
  return next;
}
