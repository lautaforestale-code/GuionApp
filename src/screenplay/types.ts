export type ElementType =
  | "scene_heading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "shot"
  | "centered";

export interface ScriptElement {
  id: string;
  type: ElementType;
  text: string;
}

export const ELEMENT_ORDER: ElementType[] = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  scene_heading: "Encabezado de escena",
  action: "Acción",
  character: "Personaje",
  parenthetical: "Paréntesis",
  dialogue: "Diálogo",
  transition: "Transición",
  shot: "Plano",
  centered: "Centrado",
};

export function nextElementId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyElement(type: ElementType = "action"): ScriptElement {
  return { id: nextElementId(), type, text: "" };
}
