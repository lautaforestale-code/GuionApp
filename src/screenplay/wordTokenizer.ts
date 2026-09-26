export interface WordSpan {
  start: number;
  end: number;
  word: string;
}

const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

export function tokenizeWords(text: string): WordSpan[] {
  const spans: WordSpan[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, word: match[0] });
  }
  return spans;
}
