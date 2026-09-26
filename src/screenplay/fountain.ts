import { type ScriptElement, emptyElement, type ElementType } from "./types";
import { looksLikeSceneHeading, looksLikeTransition } from "./autoformat";

/** Serializes our element list to Fountain plain-text markup. */
export function toFountain(elements: ScriptElement[]): string {
  const lines: string[] = [];
  elements.forEach((el, i) => {
    const prev = elements[i - 1];
    switch (el.type) {
      case "scene_heading":
        lines.push("", el.text.toUpperCase());
        break;
      case "action":
        lines.push("", el.text);
        break;
      case "character":
        lines.push("", el.text.toUpperCase());
        break;
      case "parenthetical":
        lines.push(el.text.startsWith("(") ? el.text : `(${el.text})`);
        break;
      case "dialogue":
        lines.push(prev?.type === "character" || prev?.type === "parenthetical" ? el.text : el.text);
        break;
      case "transition":
        lines.push("", `> ${el.text.toUpperCase()}`);
        break;
      case "shot":
        lines.push("", el.text.toUpperCase());
        break;
      case "centered":
        lines.push("", `> ${el.text} <`);
        break;
    }
  });
  return lines.join("\n").trim() + "\n";
}

/** Parses Fountain plain text back into our element model (subset of the spec
 *  covering the elements this editor supports). */
export function fromFountain(source: string): ScriptElement[] {
  const rawLines = source.replace(/\r\n/g, "\n").split("\n");
  const elements: ScriptElement[] = [];
  let prevBlank = true;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const line = raw.trim();

    if (line === "") {
      prevBlank = true;
      continue;
    }

    const prevType = elements[elements.length - 1]?.type;

    let type: ElementType;
    let text = line;

    if (line.startsWith(">") && line.endsWith("<")) {
      type = "centered";
      text = line.slice(1, -1).trim();
    } else if (line.startsWith(">")) {
      type = "transition";
      text = line.slice(1).trim();
    } else if (looksLikeSceneHeading(line)) {
      type = "scene_heading";
    } else if (looksLikeTransition(line)) {
      type = "transition";
    } else if (line.startsWith("(") && line.endsWith(")")) {
      type = "parenthetical";
    } else if (
      prevBlank &&
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      !/[a-z]/.test(line) &&
      line.length < 40
    ) {
      type = "character";
    } else if (prevType === "character" || prevType === "parenthetical" || prevType === "dialogue") {
      type = "dialogue";
    } else {
      type = "action";
    }

    elements.push({ ...emptyElement(type), text });
    prevBlank = false;
  }

  return elements.length ? elements : [emptyElement("scene_heading")];
}
