import { SlidersHorizontal } from "lucide-react";
import type { SceneSliderParameter } from "../scenes/types";

type SceneParametersPanelProps<Parameters extends object> = {
  parameters: Parameters;
  controls: readonly SceneSliderParameter<Parameters>[];
  onChange: (patch: Partial<Parameters>) => void;
};

function getPrecision(step: number) {
  const [, fraction = ""] = String(step).split(".");
  return fraction.length;
}

export function SceneParametersPanel<Parameters extends object>({
  parameters,
  controls,
  onChange,
}: SceneParametersPanelProps<Parameters>) {
  if (controls.length === 0) {
    return null;
  }

  return (
    <section className="panel debug-panel">
      <div className="panel-title">
        <SlidersHorizontal size={18} />
        <h2>Parameters</h2>
      </div>

      {controls.map((control) => {
        const value = Number(parameters[control.key]);
        const precision = control.precision ?? getPrecision(control.step);

        return (
          <label className="control-row" key={control.key}>
            <span>{control.name}</span>
            <output>{value.toFixed(precision)}</output>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={value}
              onChange={(event) =>
                onChange({ [control.key]: Number(event.target.value) } as Partial<Parameters>)
              }
            />
          </label>
        );
      })}
    </section>
  );
}
