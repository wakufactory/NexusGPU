import { useEffect, useState } from "react";
import { Layers3, Maximize2, Minimize2, Pause, Play, Sparkles } from "lucide-react";
import { INITIAL_RENDER_SETTINGS } from "./app/renderSettings";
import { useFullscreenViewport } from "./app/useFullscreenViewport";
import { RenderSettingsPanel } from "./panels/RenderSettingsPanel";
import { SceneParametersPanel } from "./panels/SceneParametersPanel";
import { DEFAULT_SCENE_ID, getSceneDefinition, SCENES } from "virtual:nexusgpu-scene-registry";
import type { NexusRenderSettings, NexusRenderStats } from "./nexusgpu";
import type { AnyNexusSceneDefinition } from "./scenes/types";
import type { SceneId } from "virtual:nexusgpu-scene-registry";

const ACTIVE_SCENE_STORAGE_KEY = "nexusgpu.activeSceneId";
const RENDER_SETTINGS_STORAGE_KEY = "nexusgpu.renderSettings";
const SCENE_PARAMETERS_STORAGE_KEY = "nexusgpu.sceneParametersBySceneId";
const IS_SINGLE_SCENE_BUILD = Boolean(import.meta.env.VITE_NEXUSGPU_SCENE_ID?.trim());

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
    <>
      {IS_SINGLE_SCENE_BUILD && (
        <section className="panel debug-panel">
          <div className="panel-title">
            <Layers3 size={18} />
            <h2>{scene.title}</h2>
          </div>
          <p className="panel-description">{scene.description}</p>
        </section>
      )}
      <SceneParametersPanel
        parameters={parameters}
        controls={controls}
        onChange={onChange}
      />
    </>
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

function getInitialRenderSettings(sceneId: SceneId) {
  const storedSettings = readStorageJson(RENDER_SETTINGS_STORAGE_KEY);
  const scene = getSceneDefinition(sceneId);
  const baseSettings = mergeStoredObject(INITIAL_RENDER_SETTINGS, storedSettings);
  return mergeStoredObject(baseSettings, scene.initialRenderSettings);
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
  const [activeSceneId, setActiveSceneId] = useState<SceneId>(getInitialActiveSceneId);
  const [renderSettings, setRenderSettings] = useState(() => getInitialRenderSettings(activeSceneId));
  const [renderingEnabled, setRenderingEnabled] = useState(true);
  const [renderStats, setRenderStats] = useState<NexusRenderStats | null>(null);
  const activeScene = getSceneDefinition(activeSceneId);
  const [sceneParameters, setSceneParameters] = useState<object>(() =>
    getStoredSceneParameters(activeSceneId),
  );

  useEffect(() => {
    if (IS_SINGLE_SCENE_BUILD) {
      document.title = "NexusGPU: " + activeScene.title;
    }
  }, [activeScene.title]);

  useEffect(() => {
    // スライダー操作中にlocalStorage書き込みが連発しないよう、少し遅らせて保存する。
    const saveId = window.setTimeout(() => {
      saveSceneParameters(activeSceneId, sceneParameters);
    }, 150);

    return () => window.clearTimeout(saveId);
  }, [activeSceneId, sceneParameters]);

  const updateRenderSettings = (settings: typeof INITIAL_RENDER_SETTINGS) => {
    setRenderSettings(settings);
    saveRenderSettings(settings);
  };

  const updateSceneParameters = (patch: Partial<object>) => {
    setSceneParameters((current) => {
      // range inputが同じ値を送ってきた場合は、ReactツリーとSceneStoreを更新しない。
      const changed = Object.entries(patch).some(
        ([key, value]) => (current as Record<string, unknown>)[key] !== value,
      );
      if (!changed) {
        return current;
      }

      const nextParameters = { ...current, ...patch };
      return nextParameters;
    });
  };

  const changeScene = (sceneId: SceneId) => {
    setActiveSceneId(sceneId);
    setRenderSettings(getInitialRenderSettings(sceneId));
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

        {!IS_SINGLE_SCENE_BUILD && (
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
        )}
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
