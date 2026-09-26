import type { ScriptElement } from "./types";

export interface FormatIssue {
  elementId: string;
  message: string;
  /** Returns the corrected text for this element; omitted when there's no
   *  single deterministic fix (the writer has to resolve it by hand). */
  fix?: (text: string) => string;
}

const TIME_OF_DAY_RE = /\b(D[IÍ]A|NOCHE|TARDE|AMANECER|ATARDECER|MADRUGADA|CONT[IÍ]NUO)\b/i;

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Flags likely character-name typos: two very similar names used across the
 *  script are usually the same person misspelled, not two characters. */
function checkCharacterNameTypos(elements: ScriptElement[]): FormatIssue[] {
  const counts = new Map<string, number>();
  for (const el of elements) {
    const name = el.type === "character" ? el.text.trim() : "";
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts.keys()];
  if (names.length < 2) return [];

  const canonicalFor = new Map<string, string>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]];
      if (Math.min(a.length, b.length) < 3) continue;
      const maxDistance = Math.max(a.length, b.length) >= 8 ? 2 : 1;
      if (levenshtein(a, b) > maxDistance) continue;
      const [frequent, rare] =
        (counts.get(a) ?? 0) >= (counts.get(b) ?? 0) ? [a, b] : [b, a];
      if (!canonicalFor.has(rare)) canonicalFor.set(rare, frequent);
    }
  }
  if (canonicalFor.size === 0) return [];

  const issues: FormatIssue[] = [];
  for (const el of elements) {
    if (el.type !== "character") continue;
    const canonical = canonicalFor.get(el.text.trim());
    if (!canonical) continue;
    issues.push({
      elementId: el.id,
      message: `¿Es el mismo personaje que "${canonical}"? Aparece escrito de las dos formas.`,
      fix: () => canonical,
    });
  }
  return issues;
}

export function checkFormat(elements: ScriptElement[]): FormatIssue[] {
  const issues: FormatIssue[] = [];

  for (const el of elements) {
    const text = el.text.trim();
    if (!text) continue;

    if (el.type === "parenthetical" && !(text.startsWith("(") && text.endsWith(")"))) {
      issues.push({
        elementId: el.id,
        message: "Los paréntesis van entre paréntesis.",
        fix: (t) => `(${t.trim()})`,
      });
    }

    if (el.type === "transition" && !text.endsWith(":")) {
      issues.push({
        elementId: el.id,
        message: 'Las transiciones suelen terminar en ":".',
        fix: (t) => `${t.trim()}:`,
      });
    }

    if (el.type === "scene_heading" && !TIME_OF_DAY_RE.test(text)) {
      issues.push({
        elementId: el.id,
        message: "Falta indicar el momento del día (DÍA, NOCHE...).",
        fix: (t) => `${t.trim()} - DÍA`,
      });
    }
  }

  return [...issues, ...checkCharacterNameTypos(elements)];
}
