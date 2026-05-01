import { Waves } from "lucide-react";
import type { WaveSdfSceneParameters } from "../scenes/WaveSdfScene";

type WaveSdfSceneParametersPanelProps = {
  parameters: WaveSdfSceneParameters;
  onChange: (patch: Partial<WaveSdfSceneParameters>) => void;
};

export function WaveSdfSceneParametersPanel({ parameters, onChange }: WaveSdfSceneParametersPanelProps) {
  const { waveAmplitude, waveFrequency, waveSpeed } = parameters;

  return (
    <section className="panel debug-panel">
      <div className="panel-title">
        <Waves size={18} />
        <h2>Wave Parameters</h2>
      </div>

      <label className="control-row">
        <span>Wave amplitude</span>
        <output>{waveAmplitude.toFixed(2)}</output>
        <input
          type="range"
          min="0"
          max="0.8"
          step="0.02"
          value={waveAmplitude}
          onChange={(event) => onChange({ waveAmplitude: Number(event.target.value) })}
        />
      </label>

      <label className="control-row">
        <span>Wave frequency</span>
        <output>{waveFrequency.toFixed(2)}</output>
        <input
          type="range"
          min="0.5"
          max="7"
          step="0.1"
          value={waveFrequency}
          onChange={(event) => onChange({ waveFrequency: Number(event.target.value) })}
        />
      </label>

      <label className="control-row">
        <span>Wave speed</span>
        <output>{waveSpeed.toFixed(2)}</output>
        <input
          type="range"
          min="0"
          max="5"
          step="0.1"
          value={waveSpeed}
          onChange={(event) => onChange({ waveSpeed: Number(event.target.value) })}
        />
      </label>
    </section>
  );
}
