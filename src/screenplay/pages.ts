import type { ScriptElement } from "./types";

const CHARS_PER_LINE = 61; // Courier 12pt within a 6in text column, ~10 cpi
const LINES_PER_PAGE = 55; // standard "one page = one minute" rule of thumb

function linesForElement(el: ScriptElement): number {
  const width = el.type === "dialogue" ? 40 : el.type === "parenthetical" ? 30 : CHARS_PER_LINE;
  const textLines = Math.max(1, Math.ceil(el.text.length / width));
  const spacer = el.type === "dialogue" || el.type === "parenthetical" ? 0 : 1;
  return textLines + spacer;
}

/** Rough page-count estimate, matching the "one page ≈ one minute of screen time" convention. */
export function estimatePages(elements: ScriptElement[]): number {
  const totalLines = elements.reduce((sum, el) => sum + linesForElement(el), 0);
  return Math.max(1, Math.round((totalLines / LINES_PER_PAGE) * 10) / 10);
}
