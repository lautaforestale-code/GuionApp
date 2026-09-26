import type { ScriptElement } from "../screenplay/types";
import "./SceneNavigator.css";

interface Props {
  elements: ScriptElement[];
  onJump: (id: string) => void;
}

export function SceneNavigator({ elements, onJump }: Props) {
  const scenes = elements.filter((el) => el.type === "scene_heading");

  return (
    <div className="scene-nav">
      <h3>Escenas</h3>
      {scenes.length === 0 && <p className="scene-nav__empty">Sin escenas todavía</p>}
      <ol>
        {scenes.map((el, i) => (
          <li key={el.id} onClick={() => onJump(el.id)}>
            <span className="scene-nav__num">{i + 1}</span>
            <span className="scene-nav__text">{el.text || "(sin título)"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
