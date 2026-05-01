import { useEffect, useRef, useState } from "react";
import { Glasses, Maximize2, Minimize2, Sparkles } from "lucide-react";
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
import type { NexusCanvasHandle, NexusRenderStats } from "./nexusgpu";
import type { AnimatedSdfSceneParameters } from "./scenes/AnimatedSdfScene2";

/** NexusGPUの現在のAPIを触るためのデモアプリ。 */
export function App() {
  const { shellRef, isFullscreen, fullscreenStyle, toggleFullscreen } = useFullscreenViewport();
  const canvasApiRef = useRef<NexusCanvasHandle | null>(null);
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState(INITIAL_RENDER_SETTINGS);
  const [sceneParameters, setSceneParameters] = useState(INITIAL_SCENE_PARAMETERS);
  const [renderStats, setRenderStats] = useState<NexusRenderStats | null>(null);
  const [xrSupported, setXrSupported] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const [isStartingXr, setIsStartingXr] = useState(false);

  useEffect(() => {
    const xr = (navigator as Navigator & {
      xr?: { isSessionSupported?: (mode: "immersive-vr") => Promise<boolean> };
    }).xr;

    if (!xr?.isSessionSupported) {
      setXrSupported(false);
      return;
    }

    const hasXrGpuBinding = "XRGPUBinding" in globalThis || "XRWebGPUBinding" in globalThis;
    let cancelled = false;
    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (!cancelled) {
          setXrSupported(supported && hasXrGpuBinding);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setXrSupported(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSceneParameters = (patch: Partial<AnimatedSdfSceneParameters>) => {
    setSceneParameters((current) => ({ ...current, ...patch }));
  };

  const startXrSbsSession = async () => {
    setIsStartingXr(true);
    setXrError(null);
    setRenderSettings((current) => ({ ...current, stereoSbs: true }));

    try {
      await canvasApiRef.current?.startXrSbsSession();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setXrError(message);
    } finally {
      setIsStartingXr(false);
    }
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
          ref={canvasApiRef}
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
        <section className="panel xr-panel">
          <div className="panel-title">
            <Glasses size={18} />
            <h2>XR</h2>
          </div>
          <button
            className="xr-button"
            type="button"
            disabled={!xrSupported || isStartingXr || renderStats?.xrPresenting}
            onClick={startXrSbsSession}
          >
            {renderStats?.xrPresenting ? "XR active" : isStartingXr ? "Starting XR" : "Enter XR SBS"}
          </button>
          {xrError ? <p className="panel-error">{xrError}</p> : null}
        </section>
      </aside>
    </main>
  );
}
