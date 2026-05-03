import { useState } from "react";
import { Layers3, Maximize2, Minimize2, Pause, Play, Sparkles } from "lucide-react";
import { INITIAL_RENDER_SETTINGS } from "./app/renderSettings";
import { useFullscreenViewport } from "./app/useFullscreenViewport";
import { RenderSettingsPanel } from "./panels/RenderSettingsPanel";
import { SceneParametersPanel } from "./panels/SceneParametersPanel";
import { DEFAULT_SCENE_ID, getSceneDefinition, SCENES } from "./scenes/registry";
import type { NexusRenderSettings, NexusRenderStats } from "./nexusgpu";
import type { AnyNexusSceneDefinition } from "./scenes/types";
import type { SceneId } from "./scenes/registry";

const ACTIVE_SCENE_STORAGE_KEY = "nexusgpu.activeSceneId";
const RENDER_SETTINGS_STORAGE_KEY = "nexusgpu.renderSettings";
const SCENE_PARAMETERS_STORAGE_KEY = "nexusgpu.sceneParametersBySceneId";

type StoredSceneParameters = Record<string, Record<string, unknown>>;

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
    <SceneComponent
      parameters={parameters}
      canvasProps={{
        renderingEnabled,
        renderSettings,
        onRenderStatsChange,
      }}
    />
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

function readStorageJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeStorageJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore unavailable storage and keep the in-memory settings working.
  }
}

function mergeStoredObject<Settings extends object>(
  defaults: Settings,
  stored: unknown,
): Settings {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return defaults;
  }

  const storedRecord = stored as Record<string, unknown>;
  const restored: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (typeof storedRecord[key] === typeof defaultValue) {
      restored[key] = storedRecord[key];
    }
  }

  return restored as Settings;
}

function saveActiveSceneId(sceneId: SceneId) {
  try {
    localStorage.setItem(ACTIVE_SCENE_STORAGE_KEY, sceneId);
  } catch {
    // Ignore unavailable storage and keep the in-memory scene selection working.
  }
}

function getInitialRenderSettings() {
  return mergeStoredObject(INITIAL_RENDER_SETTINGS, readStorageJson(RENDER_SETTINGS_STORAGE_KEY));
}

function saveRenderSettings(settings: typeof INITIAL_RENDER_SETTINGS) {
  writeStorageJson(RENDER_SETTINGS_STORAGE_KEY, settings);
}

function getStoredSceneParameters(sceneId: SceneId) {
  const storedParameters = readStorageJson<StoredSceneParameters>(SCENE_PARAMETERS_STORAGE_KEY);
  const scene = getSceneDefinition(sceneId);
  return mergeStoredObject(scene.initialParameters, storedParameters?.[sceneId]);
}

function saveSceneParameters(sceneId: SceneId, parameters: object) {
  const storedParameters = readStorageJson<StoredSceneParameters>(SCENE_PARAMETERS_STORAGE_KEY) ?? {};
  writeStorageJson(SCENE_PARAMETERS_STORAGE_KEY, {
    ...storedParameters,
    [sceneId]: parameters,
  });
}

/** NexusGPUの現在のAPIを触るためのデモアプリ。 */
export function App() {
  const { shellRef, isFullscreen, fullscreenStyle, toggleFullscreen } = useFullscreenViewport();
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState(getInitialRenderSettings);
  const [renderingEnabled, setRenderingEnabled] = useState(true);
  const [activeSceneId, setActiveSceneId] = useState<SceneId>(getInitialActiveSceneId);
  const [renderStats, setRenderStats] = useState<NexusRenderStats | null>(null);
  const activeScene = getSceneDefinition(activeSceneId);
  const [sceneParameters, setSceneParameters] = useState<object>(() =>
    getStoredSceneParameters(activeSceneId),
  );

  const updateRenderSettings = (settings: typeof INITIAL_RENDER_SETTINGS) => {
    setRenderSettings(settings);
    saveRenderSettings(settings);
  };

  const updateSceneParameters = (patch: Partial<object>) => {
    setSceneParameters((current) => {
      const nextParameters = { ...current, ...patch };
      saveSceneParameters(activeSceneId, nextParameters);
      return nextParameters;
    });
  };

  const changeScene = (sceneId: SceneId) => {
    setActiveSceneId(sceneId);
    setSceneParameters(getStoredSceneParameters(sceneId));
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
          onChange={updateRenderSettings}
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
