import { ELEMENT_ORDER, type ElementType } from "./types";

const SCENE_HEADING_PREFIXES = ["INT.", "EXT.", "INT/EXT.", "I/E.", "EST."];

export function looksLikeSceneHeading(text: string): boolean {
  const upper = text.trim().toUpperCase();
  return SCENE_HEADING_PREFIXES.some((p) => upper.startsWith(p));
}

export function looksLikeTransition(text: string): boolean {
  return /^(CUT TO:|CORTE A:|FUNDE A:|DISUELVE A:|FADE (IN|OUT):|FADE TO:)/i.test(
    text.trim()
  );
}

/** Uppercases text for element types where the industry standard requires it. */
export function transformTextForType(type: ElementType, text: string): string {
  if (type === "scene_heading" || type === "character" || type === "transition") {
    return text.toUpperCase();
  }
  return text;
}

/** What element type should the NEW line be, when the writer presses Enter
 *  at the end of a line of the given type. Mirrors Final Draft / WriterDuet
 *  conventions so dialogue exchanges and action flow without manual Tabbing. */
export function nextTypeOnEnter(current: ElementType, currentText: string): ElementType {
  switch (current) {
    case "scene_heading":
      return "action";
    case "action":
      return "action";
    case "character":
      return currentText.trim() ? "dialogue" : "action";
    case "parenthetical":
      return "dialogue";
    case "dialogue":
      return "character";
    case "transition":
      return "scene_heading";
    case "shot":
      return "action";
    case "centered":
      return "action";
    default:
      return "action";
  }
}

/** Tab cycles forward through the standard element order; Shift+Tab goes back. */
export function nextTypeOnTab(current: ElementType, backwards = false): ElementType {
  const idx = ELEMENT_ORDER.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const len = ELEMENT_ORDER.length;
  const nextIdx = backwards ? (base - 1 + len) % len : (base + 1) % len;
  return ELEMENT_ORDER[nextIdx];
}
