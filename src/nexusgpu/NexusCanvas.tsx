import { useEffect, useMemo, useRef, useState } from "react";
import { SceneStore } from "./SceneStore";
import { SceneContext } from "./SceneContext";
import { WebGpuSdfRenderer } from "./WebGpuSdfRenderer";
import { DEFAULT_BACKGROUND } from "./defaults";
import { useOrbitCameraControls } from "./useOrbitCameraControls";
import type { NexusBackground, NexusCanvasProps, SceneSnapshot } from "./types";

/**
 * ReactツリーとWebGPUレンダラを接続するルートコンポーネント。
 * 子のSDFプリミティブはContext経由でSceneStoreへ登録される。
 */
export function NexusCanvas({
  camera,
  lighting,
  background,
  textures,
  orbitControls = false,
  xrRequestId = 0,
  onXrStateChange,
  renderingEnabled = true,
  renderSettings,
  onRenderStatsChange,
  children,
}: NexusCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGpuSdfRenderer | null>(null);
  const elapsedRef = useRef(0);
  const renderSettingsRef = useRef(renderSettings);
  const texturesRef = useRef(textures);
  const renderingEnabledRef = useRef(renderingEnabled);
  const xrRequestIdRef = useRef(xrRequestId);
  const [error, setError] = useState<string | null>(null);
  const store = useMemo(() => new SceneStore(), []);
  const lightingKey = JSON.stringify(lighting ?? null);

  useOrbitCameraControls({
    canvasRef,
    camera,
    enabled: orbitControls,
    store,
  });

  // ライティングpropsが変わったらSceneStoreへ反映し、レンダラのUniform更新につなげる。
  useEffect(() => {
    store.setLighting(lighting);
  }, [lightingKey, store]);

  // 背景色propsが変わったらSceneStoreへ反映し、レンダラのUniform更新につなげる。
  useEffect(() => {
    store.setBackground(resolveBackground(background));
  }, [
    background?.yPositive?.[0],
    background?.yPositive?.[1],
    background?.yPositive?.[2],
    background?.yNegative?.[0],
    background?.yNegative?.[1],
    background?.yNegative?.[2],
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

  useEffect(() => {
    texturesRef.current = textures;
    rendererRef.current?.setTextures(textures);
  }, [textures]);

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
        renderer.setXrStateChangeHandler(onXrStateChange);
        renderer.setRenderSettings(renderSettingsRef.current);
        renderer.setRenderingEnabled(renderingEnabledRef.current);
        renderer.setTextures(texturesRef.current);
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

  useEffect(() => {
    rendererRef.current?.setXrStateChangeHandler(onXrStateChange);
  }, [onXrStateChange]);

  useEffect(() => {
    if (xrRequestId === xrRequestIdRef.current) {
      return;
    }

    xrRequestIdRef.current = xrRequestId;
    if (xrRequestId > 0) {
      rendererRef.current?.toggleXr();
    }
  }, [xrRequestId]);

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

function resolveBackground(background: NexusBackground | undefined): Required<NexusBackground> {
  return {
    yPositive: background?.yPositive ?? DEFAULT_BACKGROUND.yPositive,
    yNegative: background?.yNegative ?? DEFAULT_BACKGROUND.yNegative,
  };
}
