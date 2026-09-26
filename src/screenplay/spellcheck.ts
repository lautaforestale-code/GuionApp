import nspellFactory from "nspell";
// Bundled as raw text (and inlined for the single-file artifact build) so the
// checker works fully offline, with no runtime fetch. This whole module is
// meant to be dynamically imported — the dictionary is ~900KB of text and
// has no reason to sit in the app's initial bundle.
import esAff from "../assets/dictionaries/es.aff?raw";
import esDic from "../assets/dictionaries/es.dic?raw";

export interface Speller {
  correct(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): unknown;
}

const CUSTOM_WORDS_KEY = "guionapp:dictionary";

// Screenwriting shorthand that isn't in a general-language dictionary.
const SCREENPLAY_TERMS = [
  "INT",
  "EXT",
  "ESC",
  "POV",
  "OFF",
  "CONT'D",
  "CONTD",
  "FADE",
  "CUT",
  "DISUELVE",
  "FUNDE",
  "ENCADENADO",
  "ENCADENA",
  "OS",
  "VO",
  "FLASHBACK",
  "MONTAJE",
];

export function loadCustomWords(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_WORDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addCustomWord(word: string) {
  const words = loadCustomWords();
  if (words.includes(word)) return;
  words.push(word);
  try {
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(words));
  } catch {
    // storage unavailable — the word still gets added to the live speller
  }
}

let spellerPromise: Promise<Speller> | null = null;

/** Builds the speller off the main thread's critical path: dictionary
 *  parsing is CPU-heavy, so it's deferred until the browser is idle. */
export function getSpeller(): Promise<Speller> {
  if (!spellerPromise) {
    spellerPromise = new Promise((resolve) => {
      const build = () => {
        const speller = nspellFactory(esAff, esDic) as unknown as Speller;
        for (const word of SCREENPLAY_TERMS) speller.add(word);
        for (const word of loadCustomWords()) speller.add(word);
        resolve(speller);
      };
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (ric) ric(build);
      else setTimeout(build, 0);
    });
  }
  return spellerPromise;
}
