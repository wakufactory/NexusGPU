import { useState } from "react";
import { Maximize2, Minimize2, Sparkles } from "lucide-react";
import { INITIAL_RENDER_SETTINGS } from "./app/renderSettings";
import { useFullscreenViewport } from "./app/useFullscreenViewport";
import { NexusCanvas } from "./nexusgpu";
import { SceneParametersPanel } from "./panels/SceneParametersPanel";
import { RenderSettingsPanel } from "./panels/RenderSettingsPanel";
import { AnimatedSdfScene } from "./scenes/AnimatedSdfScene";

const INITIAL_SPHERE_SMOOTHNESS = 0.7;

/** NexusGPUの現在のAPIを触るためのデモアプリ。 */
export function App() {
  const { shellRef, isFullscreen, fullscreenStyle, toggleFullscreen } = useFullscreenViewport();
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState(INITIAL_RENDER_SETTINGS);
  const [sphereSmoothness, setSphereSmoothness] = useState(INITIAL_SPHERE_SMOOTHNESS);

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
        {/* renderSettingsを変えると、シェーダのステップ数や解像度が即座に変わる。 */}
        <NexusCanvas
          camera={{ position: [0, 0.7, 5.2], target: [0, 0, 0], fov: 48 }}
          lighting={{ direction: [0.25, 0.85, 0.35] }}
          orbitControls
          renderSettings={renderSettings}
        >
          <AnimatedSdfScene sphereSmoothness={sphereSmoothness} />
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

        <SceneParametersPanel
          sphereSmoothness={sphereSmoothness}
          onSphereSmoothnessChange={setSphereSmoothness}
        />
        <RenderSettingsPanel settings={renderSettings} onChange={setRenderSettings} />
      </aside>
    </main>
  );
}
