import { useEffect, useMemo, useRef, useState } from "react";
import { SceneStore } from "./SceneStore";
import { SceneContext } from "./SceneContext";
import { WebGpuSdfRenderer } from "./WebGpuSdfRenderer";
import type { NexusCanvasProps, SceneSnapshot } from "./types";

/**
 * ReactツリーとWebGPUレンダラを接続するルートコンポーネント。
 * 子のSDFプリミティブはContext経由でSceneStoreへ登録される。
 */
export function NexusCanvas({ camera, renderSettings, children }: NexusCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGpuSdfRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const store = useMemo(() => new SceneStore(), []);

  // カメラpropsが変わったらSceneStoreへ反映し、レンダラのUniform更新につなげる。
  useEffect(() => {
    store.setCamera(camera);
  }, [camera, store]);

  // デバッグ設定はシーン構造ではないため、レンダラへ直接渡す。
  useEffect(() => {
    rendererRef.current?.setRenderSettings(renderSettings);
  }, [renderSettings]);

  // 子コンポーネント向けのフレームループ。useFrameでSDF propsを動かせるようにする。
  useEffect(() => {
    let frameId = 0;
    let startTime: number | null = null;
    let lastTime: number | null = null;

    const tick = (time: number) => {
      startTime ??= time;
      lastTime ??= time;

      const elapsed = (time - startTime) / 1000;
      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      store.advanceFrame({ time, elapsed, delta });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [store]);

  // CanvasのWebGPU初期化、SceneStore購読、アンマウント時の破棄をまとめて管理する。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    WebGpuSdfRenderer.create(canvas)
      .then((renderer) => {
        if (cancelled) {
          renderer.destroy();
          return;
        }

        rendererRef.current = renderer;
        renderer.setRenderSettings(renderSettings);
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
  }, [store]);

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
      <canvas ref={canvasRef} className="nexus-canvas" aria-label="NexusGPU viewport" />
      {children}
    </SceneContext.Provider>
  );
}
