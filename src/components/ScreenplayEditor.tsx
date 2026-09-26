import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ELEMENT_LABELS,
  ELEMENT_ORDER,
  type ElementType,
  type ScriptElement,
  emptyElement,
  nextElementId,
} from "../screenplay/types";
import { nextTypeOnEnter, nextTypeOnTab, transformTextForType } from "../screenplay/autoformat";
import { checkFormat, type FormatIssue } from "../screenplay/formatChecks";
import type { Speller } from "../screenplay/spellcheck";
import { tokenizeWords, type WordSpan } from "../screenplay/wordTokenizer";
import "./ScreenplayEditor.css";

export interface ScreenplayEditorHandle {
  getElements: () => ScriptElement[];
  loadElements: (elements: ScriptElement[]) => void;
  setElementType: (id: string, type: ElementType) => void;
  focusElement: (id: string) => void;
}

interface Props {
  initialElements: ScriptElement[];
  onChange?: (elements: ScriptElement[]) => void;
  activeElementId: string | null;
  onActiveElementChange?: (id: string | null) => void;
}

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function setCaretAtOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const textNode = el.firstChild;
  if (!textNode) {
    range.setStart(el, 0);
  } else {
    const len = textNode.textContent?.length ?? 0;
    range.setStart(textNode, Math.min(Math.max(offset, 0), len));
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

const WORD_BOUNDARY_RE = /[\s.,;:!?)\]"'”»]/;

function stripAccents(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Reapplies `original`'s case pattern (ALLCAPS / Capitalized / lowercase)
 *  onto `replacement`, which is assumed to be the same word, just accented. */
function recase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement.toLowerCase();
}

/** Silently restores missing/wrong accents once a word is finished (a
 *  boundary character was just typed, or the field is being left) — but only
 *  when the unaccented form isn't a word on its own, so "esta"/"está",
 *  "el"/"él", "si"/"sí" etc. (both real, different words) are never touched. */
function tryAutoAccentFix(div: HTMLDivElement, speller: Speller | null, atEnd: boolean) {
  if (!speller) return;
  const text = div.textContent ?? "";
  const caret = atEnd ? text.length : getCaretOffset(div);
  if (caret === 0) return;
  if (!atEnd && !WORD_BOUNDARY_RE.test(text[caret - 1])) return;

  const wordEnd = atEnd ? caret : caret - 1;
  const span = tokenizeWords(text).find((s) => s.end === wordEnd);
  if (!span || span.word.length < 3 || speller.correct(span.word)) return;

  const match = speller
    .suggest(span.word)
    .find((s) => s !== span.word && stripAccents(s).toLowerCase() === stripAccents(span.word).toLowerCase());
  if (!match) return;

  const fixed = recase(span.word, match);
  if (fixed === span.word) return;
  div.textContent = text.slice(0, span.start) + fixed + text.slice(span.end);
  setCaretAtOffset(div, caret);
}

const CTRL_SHORTCUTS: Record<string, ElementType> = {
  "1": "scene_heading",
  "2": "action",
  "3": "character",
  "4": "parenthetical",
  "5": "dialogue",
  "6": "transition",
  "7": "shot",
};

interface OpenPopover {
  elementId: string;
  kind: "spelling" | "format";
  rect: DOMRect;
  spelling?: { word: string; start: number; end: number; suggestions: string[] };
  formatIssues?: FormatIssue[];
}

export const ScreenplayEditor = forwardRef<ScreenplayEditorHandle, Props>(
  function ScreenplayEditor(
    { initialElements, onChange, activeElementId, onActiveElementChange },
    ref
  ) {
    const [elements, setElements] = useState<ScriptElement[]>(initialElements);
    const [misspellings, setMisspellings] = useState<Record<string, WordSpan[]>>({});
    const [popover, setPopover] = useState<OpenPopover | null>(null);
    const refs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pendingFocus = useRef<{ id: string; offset: number } | null>(null);
    const spellerRef = useRef<Speller | null>(null);

    useImperativeHandle(ref, () => ({
      getElements: () => elements,
      loadElements: (els) => setElements(els.length ? els : [emptyElement("scene_heading")]),
      setElementType: (id, type) => setType(id, type),
      focusElement: (id) => {
        const node = refs.current.get(id);
        if (node) {
          node.focus();
          setCaretAtOffset(node, node.textContent?.length ?? 0);
        }
      },
    }));

    useEffect(() => {
      onChange?.(elements);
    }, [elements, onChange]);

    useEffect(() => {
      if (!pendingFocus.current) return;
      const { id, offset } = pendingFocus.current;
      const node = refs.current.get(id);
      if (node) {
        node.focus();
        setCaretAtOffset(node, offset);
      }
      pendingFocus.current = null;
    }, [elements]);

    // Spelling runs debounced and off the critical path: it re-tokenizes the
    // whole document, which is cheap for a screenplay but not free.
    useEffect(() => {
      let cancelled = false;
      const timer = setTimeout(async () => {
        const { getSpeller } = await import("../screenplay/spellcheck");
        const speller = await getSpeller();
        if (cancelled) return;
        spellerRef.current = speller;
        for (const el of elements) {
          if (el.type !== "character") continue;
          for (const span of tokenizeWords(el.text)) speller.add(span.word);
        }
        const result: Record<string, WordSpan[]> = {};
        for (const el of elements) {
          if (!el.text.trim()) continue;
          const spans = tokenizeWords(el.text).filter(
            (w) => w.word.length > 1 && !speller.correct(w.word)
          );
          if (spans.length) result[el.id] = spans;
        }
        if (!cancelled) setMisspellings(result);
      }, 500);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [elements]);

    const formatIssuesByElement = useMemo(() => {
      const map = new Map<string, FormatIssue[]>();
      for (const issue of checkFormat(elements)) {
        const list = map.get(issue.elementId) ?? [];
        list.push(issue);
        map.set(issue.elementId, list);
      }
      return map;
    }, [elements]);

    function updateText(id: string, text: string) {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, text } : el)));
    }

    function setType(id: string, type: ElementType) {
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, type, text: transformTextForType(type, el.text) } : el))
      );
    }

    function openSpellingPopover(elementId: string, span: WordSpan, rect: DOMRect) {
      const suggestions = spellerRef.current?.suggest(span.word).slice(0, 5) ?? [];
      setPopover({
        elementId,
        kind: "spelling",
        rect,
        spelling: { word: span.word, start: span.start, end: span.end, suggestions },
      });
    }

    function openFormatPopover(elementId: string, issues: FormatIssue[], rect: DOMRect) {
      setPopover({ elementId, kind: "format", rect, formatIssues: issues });
    }

    function applySpellingFix(replacement: string) {
      if (!popover?.spelling) return;
      const el = elements.find((e) => e.id === popover.elementId);
      if (!el) return;
      const { start, end } = popover.spelling;
      updateText(popover.elementId, el.text.slice(0, start) + replacement + el.text.slice(end));
      setPopover(null);
    }

    async function addToDictionary() {
      if (!popover?.spelling) return;
      const word = popover.spelling.word;
      const { addCustomWord } = await import("../screenplay/spellcheck");
      addCustomWord(word);
      spellerRef.current?.add(word);
      setMisspellings((prev) => {
        const next: Record<string, WordSpan[]> = {};
        for (const [id, spans] of Object.entries(prev)) {
          const filtered = spans.filter((s) => s.word !== word);
          if (filtered.length) next[id] = filtered;
        }
        return next;
      });
      setPopover(null);
    }

    function applyFormatFix(issue: FormatIssue) {
      if (!issue.fix) return;
      const el = elements.find((e) => e.id === issue.elementId);
      if (!el) return;
      updateText(issue.elementId, issue.fix(el.text));
      setPopover(null);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>, el: ScriptElement, index: number) {
      const div = e.currentTarget;

      if ((e.ctrlKey || e.metaKey) && CTRL_SHORTCUTS[e.key]) {
        e.preventDefault();
        setType(el.id, CTRL_SHORTCUTS[e.key]);
        pendingFocus.current = { id: el.id, offset: getCaretOffset(div) };
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const newType = nextTypeOnTab(el.type, e.shiftKey);
        setType(el.id, newType);
        pendingFocus.current = { id: el.id, offset: getCaretOffset(div) };
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const offset = getCaretOffset(div);
        const fullText = div.textContent ?? "";
        const before = fullText.slice(0, offset);
        const after = fullText.slice(offset);
        const newType = nextTypeOnEnter(el.type, before);
        const newEl: ScriptElement = {
          id: nextElementId(),
          type: newType,
          text: transformTextForType(newType, after),
        };
        setElements((prev) => {
          const copy = prev.slice();
          copy[index] = { ...el, text: before };
          copy.splice(index + 1, 0, newEl);
          return copy;
        });
        pendingFocus.current = { id: newEl.id, offset: 0 };
        return;
      }

      if (e.key === "Backspace") {
        const offset = getCaretOffset(div);
        const hasSelection = !window.getSelection()?.isCollapsed;
        if (offset === 0 && !hasSelection) {
          if (index === 0) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          const prevEl = elements[index - 1];
          const mergedText = prevEl.text + el.text;
          setElements((prev) => {
            const copy = prev.slice();
            copy[index - 1] = { ...prevEl, text: mergedText };
            copy.splice(index, 1);
            return copy;
          });
          pendingFocus.current = { id: prevEl.id, offset: prevEl.text.length };
          return;
        }
      }

      if (e.key === "ArrowUp") {
        const offset = getCaretOffset(div);
        if (offset === 0 && index > 0) {
          e.preventDefault();
          const prevEl = elements[index - 1];
          pendingFocus.current = { id: prevEl.id, offset: prevEl.text.length };
          setElements((prev) => prev.slice());
        }
      }

      if (e.key === "ArrowDown") {
        const offset = getCaretOffset(div);
        const len = (div.textContent ?? "").length;
        if (offset === len && index < elements.length - 1) {
          e.preventDefault();
          const nextEl = elements[index + 1];
          pendingFocus.current = { id: nextEl.id, offset: 0 };
          setElements((prev) => prev.slice());
        }
      }
    }

    function handleBlurCommit(el: ScriptElement, div: HTMLDivElement) {
      const transformed = transformTextForType(el.type, div.textContent ?? "");
      if (transformed !== div.textContent) {
        div.textContent = transformed;
      }
      tryAutoAccentFix(div, spellerRef.current, true);
      const finalText = div.textContent ?? "";
      if (finalText !== el.text) {
        updateText(el.id, finalText);
      }
    }

    return (
      <div className="screenplay-page">
        {elements.map((el, index) => (
          <Line
            key={el.id}
            el={el}
            index={index}
            isActive={activeElementId === el.id}
            spellSpans={misspellings[el.id] ?? EMPTY_SPANS}
            formatIssues={formatIssuesByElement.get(el.id) ?? EMPTY_ISSUES}
            registerRef={(node) => {
              if (node) refs.current.set(el.id, node);
              else refs.current.delete(el.id);
            }}
            onInput={(text) => updateText(el.id, text)}
            onKeyDown={(e) => handleKeyDown(e, el, index)}
            onFocus={() => onActiveElementChange?.(el.id)}
            onBlurCommit={handleBlurCommit}
            spellerRef={spellerRef}
            onSpellingClick={openSpellingPopover}
            onFormatClick={openFormatPopover}
          />
        ))}
        {popover &&
          createPortal(
            <IssuePopover
              popover={popover}
              onClose={() => setPopover(null)}
              onApplySpelling={applySpellingFix}
              onAddToDictionary={addToDictionary}
              onApplyFormat={applyFormatFix}
            />,
            document.body
          )}
      </div>
    );
  }
);

const EMPTY_SPANS: WordSpan[] = [];
const EMPTY_ISSUES: FormatIssue[] = [];

function IssuePopover({
  popover,
  onClose,
  onApplySpelling,
  onAddToDictionary,
  onApplyFormat,
}: {
  popover: OpenPopover;
  onClose: () => void;
  onApplySpelling: (replacement: string) => void;
  onAddToDictionary: () => void;
  onApplyFormat: (issue: FormatIssue) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const top = popover.rect.bottom + window.scrollY + 4;
  const left = popover.rect.left + window.scrollX;

  return (
    <div ref={popoverRef} className="issue-popover" style={{ top, left }}>
      {popover.kind === "spelling" && popover.spelling && (
        <>
          <div className="issue-popover__title">"{popover.spelling.word}"</div>
          {popover.spelling.suggestions.length === 0 && (
            <div className="issue-popover__empty">Sin sugerencias</div>
          )}
          {popover.spelling.suggestions.map((s) => (
            <button key={s} onClick={() => onApplySpelling(s)}>
              {s}
            </button>
          ))}
          <button className="issue-popover__secondary" onClick={onAddToDictionary}>
            Agregar al diccionario
          </button>
        </>
      )}
      {popover.kind === "format" && popover.formatIssues && (
        <>
          {popover.formatIssues.map((issue, i) => (
            <div key={i} className="issue-popover__format-item">
              <div className="issue-popover__title">{issue.message}</div>
              {issue.fix && <button onClick={() => onApplyFormat(issue)}>Corregir</button>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Line({
  el,
  index,
  isActive,
  spellSpans,
  formatIssues,
  registerRef,
  onInput,
  onKeyDown,
  onFocus,
  onBlurCommit,
  spellerRef,
  onSpellingClick,
  onFormatClick,
}: {
  el: ScriptElement;
  index: number;
  isActive: boolean;
  spellSpans: WordSpan[];
  formatIssues: FormatIssue[];
  registerRef: (node: HTMLDivElement | null) => void;
  onInput: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlurCommit: (el: ScriptElement, div: HTMLDivElement) => void;
  spellerRef: React.RefObject<Speller | null>;
  onSpellingClick: (elementId: string, span: WordSpan, rect: DOMRect) => void;
  onFormatClick: (elementId: string, issues: FormatIssue[], rect: DOMRect) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerRef(divRef.current);
    return () => registerRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (divRef.current && divRef.current.textContent !== el.text) {
      divRef.current.textContent = el.text;
    }
  }, [el.text]);

  return (
    <div className="line-row">
      <div
        ref={divRef}
        className={`line line--${el.type}`}
        data-placeholder={el.text === "" ? placeholderFor(el.type, index) : undefined}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => {
          const div = e.currentTarget;
          const raw = div.textContent ?? "";
          const transformed = transformTextForType(el.type, raw);
          if (transformed !== raw) {
            const offset = getCaretOffset(div);
            div.textContent = transformed;
            setCaretAtOffset(div, offset);
          }
          tryAutoAccentFix(div, spellerRef.current, false);
          onInput(div.textContent ?? "");
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={(e) => onBlurCommit(el, e.currentTarget)}
        spellCheck={false}
        data-active={isActive}
      />
      {spellSpans.length > 0 && (
        <div className={`line line--${el.type} line--overlay`} aria-hidden="true">
          {renderSpellingOverlay(el.text, spellSpans, (span, rect) =>
            onSpellingClick(el.id, span, rect)
          )}
        </div>
      )}
      {formatIssues.length > 0 && (
        <button
          type="button"
          className="line-row__format-badge"
          title={formatIssues.map((i) => i.message).join(" · ")}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFormatClick(el.id, formatIssues, e.currentTarget.getBoundingClientRect());
          }}
        >
          !
        </button>
      )}
    </div>
  );
}

function renderSpellingOverlay(
  text: string,
  spans: WordSpan[],
  onWordClick: (span: WordSpan, rect: DOMRect) => void
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.start > cursor) nodes.push(text.slice(cursor, span.start));
    nodes.push(
      <mark
        key={i}
        className="issue-mark"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onWordClick(span, e.currentTarget.getBoundingClientRect());
        }}
      >
        {text.slice(span.start, span.end)}
      </mark>
    );
    cursor = span.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function placeholderFor(type: ElementType, index: number): string {
  if (type === "scene_heading" && index === 0) return "INT. LUGAR - DÍA";
  return ELEMENT_LABELS[type];
}

export { ELEMENT_ORDER };
