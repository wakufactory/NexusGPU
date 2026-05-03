import { useEffect, useMemo, useRef, useState } from "react";
import { SceneStore } from "./SceneStore";
import { SceneContext } from "./SceneContext";
import { WebGpuSdfRenderer } from "./WebGpuSdfRenderer";
import { DEFAULT_LIGHTING } from "./defaults";
import { useOrbitCameraControls } from "./useOrbitCameraControls";
import type { NexusCanvasProps, NexusLighting, SceneSnapshot } from "./types";

/**
 * ReactツリーとWebGPUレンダラを接続するルートコンポーネント。
 * 子のSDFプリミティブはContext経由でSceneStoreへ登録される。
 */
export function NexusCanvas({
  camera,
  lighting,
  orbitControls = false,
  renderingEnabled = true,
  renderSettings,
  onRenderStatsChange,
  children,
}: NexusCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGpuSdfRenderer | null>(null);
  const elapsedRef = useRef(0);
  const renderSettingsRef = useRef(renderSettings);
  const renderingEnabledRef = useRef(renderingEnabled);
  const [error, setError] = useState<string | null>(null);
  const store = useMemo(() => new SceneStore(), []);

  useOrbitCameraControls({
    canvasRef,
    camera,
    enabled: orbitControls,
    store,
  });

  // ライティングpropsが変わったらSceneStoreへ反映し、レンダラのUniform更新につなげる。
  useEffect(() => {
    store.setLighting(resolveLighting(lighting));
  }, [
    lighting?.direction?.[0],
    lighting?.direction?.[1],
    lighting?.direction?.[2],
    store,
  ]);

  // デバッグ設定はシーン構造ではないため、レンダラへ直接渡す。
  useEffect(() => {
    renderSettingsRef.current = renderSettings;
    rendererRef.current?.setRenderSettings(renderSettings);
  }, [renderSettings]);

  useEffect(() => {
    renderingEnabledRef.current = renderingEnabled;
    rendererRef.current?.setRenderingEnabled(renderingEnabled);
  }, [renderingEnabled]);

  // 子コンポーネント向けのフレームループ。useFrameでSDF propsを動かせるようにする。
  useEffect(() => {
    if (!renderingEnabled) {
      return;
    }

    let frameId = 0;
    let lastTime: number | null = null;

    const tick = (time: number) => {
      lastTime ??= time;

      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      elapsedRef.current += delta;

      store.advanceFrame({ time, elapsed: elapsedRef.current, delta });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [renderingEnabled, store]);

  // CanvasのWebGPU初期化、SceneStore購読、アンマウント時の破棄をまとめて管理する。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    WebGpuSdfRenderer.create(canvas, { onRenderStatsChange })
      .then((renderer) => {
        if (cancelled) {
          renderer.destroy();
          return;
        }

        rendererRef.current = renderer;
        renderer.setRenderSettings(renderSettingsRef.current);
        renderer.setRenderingEnabled(renderingEnabledRef.current);
        unsubscribe = store.subscribe((snapshot: SceneSnapshot) => {
          renderer.setScene(snapshot);
        });
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [onRenderStatsChange, store]);

  if (error) {
    return (
      <SceneContext.Provider value={store}>
        <div className="nexus-fallback">
          <span>{error}</span>
          {children}
        </div>
      </SceneContext.Provider>
    );
  }

  return (
    <SceneContext.Provider value={store}>
      <canvas
        ref={canvasRef}
        className={orbitControls ? "nexus-canvas has-orbit-controls" : "nexus-canvas"}
        aria-label="NexusGPU viewport"
      />
      {children}
    </SceneContext.Provider>
  );
}

function resolveLighting(lighting: NexusLighting | undefined): Required<NexusLighting> {
  return {
    direction: lighting?.direction ?? DEFAULT_LIGHTING.direction,
  };
}
