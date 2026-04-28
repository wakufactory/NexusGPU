import { SlidersHorizontal } from "lucide-react";

type SceneParametersPanelProps = {
  sphereSmoothness: number;
  onSphereSmoothnessChange: (sphereSmoothness: number) => void;
};

export function SceneParametersPanel({
  sphereSmoothness,
  onSphereSmoothnessChange,
}: SceneParametersPanelProps) {
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
          onChange={(event) => onSphereSmoothnessChange(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
