import { useState } from "react";
import { Maximize2, Minimize2, Sparkles } from "lucide-react";
import { INITIAL_RENDER_SETTINGS } from "./app/renderSettings";
import { useFullscreenViewport } from "./app/useFullscreenViewport";
import { NexusCanvas } from "./nexusgpu";
import { SceneParametersPanel } from "./panels/SceneParametersPanel";
import { RenderSettingsPanel } from "./panels/RenderSettingsPanel";
import {
  AnimatedSdfScene,
  INITIAL_SCENE_PARAMETERS,
  SCENE_CAMERA,
  SCENE_LIGHTING,
} from "./scenes/AnimatedSdfScene2";
import type { NexusRenderStats } from "./nexusgpu";
import type { AnimatedSdfSceneParameters } from "./scenes/AnimatedSdfScene2";

/** NexusGPUの現在のAPIを触るためのデモアプリ。 */
export function App() {
  const { shellRef, isFullscreen, fullscreenStyle, toggleFullscreen } = useFullscreenViewport();
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState(INITIAL_RENDER_SETTINGS);
  const [sceneParameters, setSceneParameters] = useState(INITIAL_SCENE_PARAMETERS);
  const [renderStats, setRenderStats] = useState<NexusRenderStats | null>(null);

  const updateSceneParameters = (patch: Partial<AnimatedSdfSceneParameters>) => {
    setSceneParameters((current) => ({ ...current, ...patch }));
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
        <NexusCanvas
          camera={SCENE_CAMERA}
          lighting={SCENE_LIGHTING}
          orbitControls
          renderSettings={renderSettings}
          onRenderStatsChange={setRenderStats}
        >
          <AnimatedSdfScene parameters={sceneParameters} />
        </NexusCanvas>
      </section>
      <aside className="sidebar">
        <div className="brand">
          <Sparkles size={24} />
          <div>
            <h1>NexusGPU</h1>
            <p>React driven SDF renderer for WebGPU.</p>
          </div>
        </div>

        <SceneParametersPanel parameters={sceneParameters} onChange={updateSceneParameters} />
        <RenderSettingsPanel
          settings={renderSettings}
          renderStats={renderStats}
          onChange={setRenderSettings}
        />
      </aside>
    </main>
  );
}
