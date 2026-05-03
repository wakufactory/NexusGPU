import { useState } from "react";
import { Layers3, Maximize2, Minimize2, Pause, Play, Sparkles } from "lucide-react";
import { INITIAL_RENDER_SETTINGS } from "./app/renderSettings";
import { useFullscreenViewport } from "./app/useFullscreenViewport";
import { NexusCanvas } from "./nexusgpu";
import { RenderSettingsPanel } from "./panels/RenderSettingsPanel";
import { SceneParametersPanel } from "./panels/SceneParametersPanel";
import { DEFAULT_SCENE_ID, getSceneDefinition, SCENES } from "./scenes/registry";
import type { NexusRenderSettings, NexusRenderStats } from "./nexusgpu";
import type { AnyNexusSceneDefinition } from "./scenes/types";
import type { SceneId } from "./scenes/registry";

const ACTIVE_SCENE_STORAGE_KEY = "nexusgpu.activeSceneId";

type SceneCanvasProps = {
  scene: AnyNexusSceneDefinition;
  parameters: object;
  renderingEnabled: boolean;
  renderSettings: NexusRenderSettings;
  onRenderStatsChange: (stats: NexusRenderStats) => void;
};

function SceneCanvas({
  scene,
  parameters,
  renderingEnabled,
  renderSettings,
  onRenderStatsChange,
}: SceneCanvasProps) {
  const SceneComponent = scene.Component;

  return (
    <NexusCanvas
      camera={scene.camera}
      lighting={scene.lighting}
      orbitControls
      renderingEnabled={renderingEnabled}
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
  const controls = scene.parameterControls ?? [];

  return (
    <SceneParametersPanel
      parameters={parameters}
      controls={controls}
      onChange={onChange}
    />
  );
}

function isSceneId(value: string | null): value is SceneId {
  return SCENES.some((scene) => scene.id === value);
}

function getInitialActiveSceneId(): SceneId {
  try {
    const storedSceneId = localStorage.getItem(ACTIVE_SCENE_STORAGE_KEY);
    return isSceneId(storedSceneId) ? storedSceneId : DEFAULT_SCENE_ID;
  } catch {
    return DEFAULT_SCENE_ID;
  }
}

function saveActiveSceneId(sceneId: SceneId) {
  try {
    localStorage.setItem(ACTIVE_SCENE_STORAGE_KEY, sceneId);
  } catch {
    // Ignore unavailable storage and keep the in-memory scene selection working.
  }
}

/** NexusGPUの現在のAPIを触るためのデモアプリ。 */
export function App() {
  const { shellRef, isFullscreen, fullscreenStyle, toggleFullscreen } = useFullscreenViewport();
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState(INITIAL_RENDER_SETTINGS);
  const [renderingEnabled, setRenderingEnabled] = useState(true);
  const [activeSceneId, setActiveSceneId] = useState<SceneId>(getInitialActiveSceneId);
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
    saveActiveSceneId(sceneId);
  };

  return (
    <main ref={shellRef} className={isFullscreen ? "app-shell is-fullscreen" : "app-shell"}>
      <section className="viewport" style={fullscreenStyle}>
        <button
          className="render-toggle"
          type="button"
          aria-label={renderingEnabled ? "Pause rendering" : "Resume rendering"}
          aria-pressed={!renderingEnabled}
          onClick={() => setRenderingEnabled((current) => !current)}
        >
          {renderingEnabled ? <Pause size={18} /> : <Play size={18} />}
          <span>{renderingEnabled ? "Stop" : "Resume"}</span>
        </button>
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
          renderingEnabled={renderingEnabled}
          renderSettings={renderSettings}
          onRenderStatsChange={setRenderStats}
        />
      </section>
      <aside className="sidebar">

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
        <div className="brand">
          <Sparkles size={24} />
          <div>
            <h1>NexusGPU</h1>
            <p>React driven SDF renderer for WebGPU.</p>
          </div>
        </div>
      </aside>
    </main>
  );
}
