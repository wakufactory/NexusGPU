import { SlidersHorizontal } from "lucide-react";
import type { AnimatedSdfSceneParameters } from "../scenes/AnimatedSdfScene2";

type SceneParametersPanelProps = {
  parameters: AnimatedSdfSceneParameters;
  onChange: (patch: Partial<AnimatedSdfSceneParameters>) => void;
};

export function SceneParametersPanel({ parameters, onChange }: SceneParametersPanelProps) {
  const { sphereSmoothness } = parameters;

  return (
    <section className="panel debug-panel">
      <div className="panel-title">
        <SlidersHorizontal size={18} />
        <h2>Parameters</h2>
      </div>

      <label className="control-row">
        <span>Sphere smoothness</span>
        <output>{sphereSmoothness.toFixed(2)}</output>
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.05"
          value={sphereSmoothness}
          onChange={(event) => onChange({ sphereSmoothness: Number(event.target.value) })}
        />
      </label>
    </section>
  );
}
