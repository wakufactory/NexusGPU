import { useState } from "react";
import { Layers3, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { INITIAL_RENDER_SETTINGS } from "./app/renderSettings";
import { useFullscreenViewport } from "./app/useFullscreenViewport";
import { NexusCanvas } from "./nexusgpu";
import { RenderSettingsPanel } from "./panels/RenderSettingsPanel";
import { DEFAULT_SCENE_ID, getSceneDefinition, SCENES } from "./scenes/registry";
import type { NexusRenderSettings, NexusRenderStats } from "./nexusgpu";
import type { AnyNexusSceneDefinition, SceneParametersPanelProps } from "./scenes/types";
import type { SceneId } from "./scenes/registry";
import type { ComponentType } from "react";

type SceneCanvasProps = {
  scene: AnyNexusSceneDefinition;
  parameters: object;
  renderSettings: NexusRenderSettings;
  onRenderStatsChange: (stats: NexusRenderStats) => void;
};

function SceneCanvas({
  scene,
  parameters,
  renderSettings,
  onRenderStatsChange,
}: SceneCanvasProps) {
  const SceneComponent = scene.Component;

  return (
    <NexusCanvas
      camera={scene.camera}
      lighting={scene.lighting}
      orbitControls
      renderSettings={renderSettings}
      onRenderStatsChange={onRenderStatsChange}
    >
      <SceneComponent parameters={parameters} />
    </NexusCanvas>
  );
}

type ActiveSceneParametersPanelProps<Parameters extends object> = {
  scene: AnyNexusSceneDefinition;
  parameters: Parameters;
  onChange: (patch: Partial<Parameters>) => void;
};

function ActiveSceneParametersPanel<Parameters extends object>({
  scene,
  parameters,
  onChange,
}: ActiveSceneParametersPanelProps<Parameters>) {
  const ParametersPanel = scene.ParametersPanel as
    | ComponentType<SceneParametersPanelProps<Parameters>>
    | undefined;

  return ParametersPanel ? <ParametersPanel parameters={parameters} onChange={onChange} /> : null;
}

/** NexusGPUの現在のAPIを触るためのデモアプリ。 */
export function App() {
  const { shellRef, isFullscreen, fullscreenStyle, toggleFullscreen } = useFullscreenViewport();
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState(INITIAL_RENDER_SETTINGS);
  const [activeSceneId, setActiveSceneId] = useState<SceneId>(DEFAULT_SCENE_ID);
  const [renderStats, setRenderStats] = useState<NexusRenderStats | null>(null);
  const activeScene = getSceneDefinition(activeSceneId);
  const [sceneParameters, setSceneParameters] = useState<object>(activeScene.initialParameters);

  const updateSceneParameters = (patch: Partial<object>) => {
    setSceneParameters((current) => ({ ...current, ...patch }));
  };

  const changeScene = (sceneId: SceneId) => {
    const nextScene = getSceneDefinition(sceneId);
    setActiveSceneId(sceneId);
    setSceneParameters(nextScene.initialParameters);
  };

  return (
    <main ref={shellRef} className={isFullscreen ? "app-shell is-fullscreen" : "app-shell"}>
      <section className="viewport" style={fullscreenStyle}>
        <button
          className="fullscreen-toggle"
          type="button"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-pressed={isFullscreen}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <SceneCanvas
          key={activeScene.id}
          scene={activeScene}
          parameters={sceneParameters}
          renderSettings={renderSettings}
          onRenderStatsChange={setRenderStats}
        />
      </section>
      <aside className="sidebar">
        <div className="brand">
          <Sparkles size={24} />
          <div>
            <h1>NexusGPU</h1>
            <p>React driven SDF renderer for WebGPU.</p>
          </div>
        </div>

        <section className="panel debug-panel">
          <div className="panel-title">
            <Layers3 size={18} />
            <h2>Scene</h2>
          </div>
          <label className="select-row">
            <span>Active scene</span>
            <select
              value={activeSceneId}
              onChange={(event) => changeScene(event.target.value as SceneId)}
            >
              {SCENES.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.title}
                </option>
              ))}
            </select>
          </label>
          <p className="panel-description">{activeScene.description}</p>
        </section>
        <ActiveSceneParametersPanel
          key={activeScene.id}
          scene={activeScene}
          parameters={sceneParameters}
          onChange={updateSceneParameters}
        />
        <RenderSettingsPanel
          settings={renderSettings}
          renderStats={renderStats}
          onChange={setRenderSettings}
        />
      </aside>
    </main>
  );
}
