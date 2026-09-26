import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ELEMENT_LABELS,
  ELEMENT_ORDER,
  type ElementType,
  type ScriptElement,
  emptyElement,
  nextElementId,
} from "../screenplay/types";
import { nextTypeOnEnter, nextTypeOnTab, transformTextForType } from "../screenplay/autoformat";
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

const CTRL_SHORTCUTS: Record<string, ElementType> = {
  "1": "scene_heading",
  "2": "action",
  "3": "character",
  "4": "parenthetical",
  "5": "dialogue",
  "6": "transition",
  "7": "shot",
};

export const ScreenplayEditor = forwardRef<ScreenplayEditorHandle, Props>(
  function ScreenplayEditor(
    { initialElements, onChange, activeElementId, onActiveElementChange },
    ref
  ) {
    const [elements, setElements] = useState<ScriptElement[]>(initialElements);
    const refs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pendingFocus = useRef<{ id: string; offset: number } | null>(null);

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

    function updateText(id: string, text: string) {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, text } : el)));
    }

    function setType(id: string, type: ElementType) {
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, type, text: transformTextForType(type, el.text) } : el))
      );
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
        updateText(el.id, transformed);
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
            registerRef={(node) => {
              if (node) refs.current.set(el.id, node);
              else refs.current.delete(el.id);
            }}
            onInput={(text) => updateText(el.id, text)}
            onKeyDown={(e) => handleKeyDown(e, el, index)}
            onFocus={() => onActiveElementChange?.(el.id)}
            onBlurCommit={handleBlurCommit}
          />
        ))}
      </div>
    );
  }
);

function Line({
  el,
  index,
  isActive,
  registerRef,
  onInput,
  onKeyDown,
  onFocus,
  onBlurCommit,
}: {
  el: ScriptElement;
  index: number;
  isActive: boolean;
  registerRef: (node: HTMLDivElement | null) => void;
  onInput: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onBlurCommit: (el: ScriptElement, div: HTMLDivElement) => void;
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
        onInput(transformed);
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={(e) => onBlurCommit(el, e.currentTarget)}
      spellCheck={false}
      data-active={isActive}
    />
  );
}

function placeholderFor(type: ElementType, index: number): string {
  if (type === "scene_heading" && index === 0) return "INT. LUGAR - DÍA";
  return ELEMENT_LABELS[type];
}

export { ELEMENT_ORDER };
