import { Gauge } from "lucide-react";
import type { CanvasPixelSize, NexusRenderSettings } from "../nexusgpu";

type RenderSettings = Required<NexusRenderSettings>;

type RenderSettingsPanelProps = {
  settings: RenderSettings;
  canvasPixelSize?: CanvasPixelSize | null;
  onChange: (settings: RenderSettings) => void;
};

export function RenderSettingsPanel({ settings, canvasPixelSize, onChange }: RenderSettingsPanelProps) {
  const updateSetting = <Key extends keyof RenderSettings>(
    key: Key,
    value: RenderSettings[Key],
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <>
    <section className="panel">
      <h2>STEREO</h2>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.stereoSbs}
          onChange={(event) => updateSetting("stereoSbs", event.target.checked)}
        />
        <span>Stereo SBS</span>
      </label>

      <label className="control-row">
        <span>Stereo base</span>
        <output>{settings.stereoBase.toFixed(3)}</output>
        <input
          type="range"
          min="0"
          max="0.5"
          step="0.005"
          value={settings.stereoBase}
          disabled={!settings.stereoSbs}
          onChange={(event) => updateSetting("stereoBase", Number(event.target.value))}
        />
      </label>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.stereoSwapEyes}
          disabled={!settings.stereoSbs}
          onChange={(event) => updateSetting("stereoSwapEyes", event.target.checked)}
        />
        <span>Cross-eye swap</span>
      </label>
    </section>

    <section className="panel debug-panel">
      <div className="panel-title">
        <Gauge size={18} />
        <h2>Debug</h2>
      </div>

      <label className="control-row resolution-row">
        <span>Resolution</span>
        <output>
          {Math.round(settings.resolutionScale * 100)}%
          {canvasPixelSize ? ` / ${canvasPixelSize.width} x ${canvasPixelSize.height} px` : ""}
        </output>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={settings.resolutionScale}
          onChange={(event) => updateSetting("resolutionScale", Number(event.target.value))}
        />
      </label>

      <label className="control-row">
        <span>Ray steps</span>
        <output>{settings.maxSteps}</output>
        <input
          type="range"
          min="16"
          max="160"
          step="4"
          value={settings.maxSteps}
          onChange={(event) => updateSetting("maxSteps", Number(event.target.value))}
        />
      </label>

      <label className="control-row">
        <span>Max distance</span>
        <output>{settings.maxDistance}</output>
        <input
          type="range"
          min="12"
          max="90"
          step="2"
          value={settings.maxDistance}
          onChange={(event) => updateSetting("maxDistance", Number(event.target.value))}
        />
      </label>

      <label className="control-row">
        <span>Normal epsilon</span>
        <output>{settings.normalEpsilon.toFixed(4)}</output>
        <input
          type="range"
          min="0.001"
          max="0.01"
          step="0.0005"
          value={settings.normalEpsilon}
          onChange={(event) => updateSetting("normalEpsilon", Number(event.target.value))}
        />
      </label>

      <label className="control-row">
        <span>Surface epsilon</span>
        <output>{settings.surfaceEpsilon.toFixed(4)}</output>
        <input
          type="range"
          min="0.001"
          max="0.02"
          step="0.0005"
          value={settings.surfaceEpsilon}
          onChange={(event) => updateSetting("surfaceEpsilon", Number(event.target.value))}
        />
      </label>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.shadows}
          onChange={(event) => updateSetting("shadows", event.target.checked)}
        />
        <span>Shadows</span>
      </label>

    </section>
  </>
  );
}
