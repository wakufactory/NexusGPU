import { useEffect, useMemo, useRef, useState } from "react";
import { SceneStore } from "./SceneStore";
import { SceneContext } from "./SceneContext";
import { WebGpuSdfRenderer } from "./WebGpuSdfRenderer";
import { DEFAULT_CAMERA, DEFAULT_LIGHTING } from "./defaults";
import { clamp } from "./math";
import type { NexusCamera, NexusCanvasProps, NexusLighting, SceneSnapshot, Vec3 } from "./types";

const MIN_POLAR_ANGLE = -Math.PI / 2 + 0.05;
const MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
const ORBIT_ROTATE_SPEED = 0.005;
const ORBIT_ZOOM_SPEED = 0.001;

type OrbitCameraState = {
  target: Vec3;
  fov: number;
  radius: number;
  yaw: number;
  pitch: number;
};

/**
 * ReactツリーとWebGPUレンダラを接続するルートコンポーネント。
 * 子のSDFプリミティブはContext経由でSceneStoreへ登録される。
 */
export function NexusCanvas({
  camera,
  lighting,
  orbitControls = false,
  renderSettings,
  onCanvasPixelSizeChange,
  children,
}: NexusCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGpuSdfRenderer | null>(null);
  const orbitStateRef = useRef<OrbitCameraState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const store = useMemo(() => new SceneStore(), []);

  // カメラpropsが変わったらSceneStoreへ反映し、レンダラのUniform更新につなげる。
  useEffect(() => {
    const initialCamera = resolveCamera(camera);
    orbitStateRef.current = createOrbitCameraState(initialCamera);
    store.setCamera(initialCamera);
  }, [
    camera?.fov,
    camera?.position?.[0],
    camera?.position?.[1],
    camera?.position?.[2],
    camera?.target?.[0],
    camera?.target?.[1],
    camera?.target?.[2],
    store,
  ]);

  // ライティングpropsが変わったらSceneStoreへ反映し、レンダラのUniform更新につなげる。
  useEffect(() => {
    store.setLighting(resolveLighting(lighting));
  }, [
    lighting?.direction?.[0],
    lighting?.direction?.[1],
    lighting?.direction?.[2],
    store,
  ]);

  // Canvas上のドラッグとホイールを、SDFレンダラ用のカメラpropsへ変換する。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !orbitControls) {
      return;
    }

    let activePointerId: number | null = null;

    const applyOrbitState = (state: OrbitCameraState) => {
      orbitStateRef.current = state;
      store.setCamera(createCameraFromOrbitState(state));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      activePointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-orbiting");
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) {
        return;
      }

      const state = orbitStateRef.current ?? createOrbitCameraState(resolveCamera(camera));
      applyOrbitState({
        ...state,
        yaw: state.yaw - event.movementX * ORBIT_ROTATE_SPEED,
        pitch: clamp(state.pitch + event.movementY * ORBIT_ROTATE_SPEED, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE),
      });
      event.preventDefault();
    };

    const stopOrbiting = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) {
        return;
      }

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      activePointerId = null;
      canvas.classList.remove("is-orbiting");
    };

    const handleWheel = (event: WheelEvent) => {
      const state = orbitStateRef.current ?? createOrbitCameraState(resolveCamera(camera));
      const radius = clamp(state.radius * Math.exp(event.deltaY * ORBIT_ZOOM_SPEED), 1.2, 80);
      applyOrbitState({ ...state, radius });
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", stopOrbiting);
    canvas.addEventListener("pointercancel", stopOrbiting);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.classList.remove("is-orbiting");
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", stopOrbiting);
      canvas.removeEventListener("pointercancel", stopOrbiting);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [
    camera,
    orbitControls,
    store,
  ]);

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

    WebGpuSdfRenderer.create(canvas, { onCanvasPixelSizeChange })
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
  }, [onCanvasPixelSizeChange, store]);

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

function resolveCamera(camera: NexusCamera | undefined): Required<NexusCamera> {
  return {
    position: camera?.position ?? DEFAULT_CAMERA.position,
    target: camera?.target ?? DEFAULT_CAMERA.target,
    fov: camera?.fov ?? DEFAULT_CAMERA.fov,
  };
}

function resolveLighting(lighting: NexusLighting | undefined): Required<NexusLighting> {
  return {
    direction: lighting?.direction ?? DEFAULT_LIGHTING.direction,
  };
}

function createOrbitCameraState(camera: Required<NexusCamera>): OrbitCameraState {
  const offsetX = camera.position[0] - camera.target[0];
  const offsetY = camera.position[1] - camera.target[1];
  const offsetZ = camera.position[2] - camera.target[2];
  const radius = Math.max(Math.hypot(offsetX, offsetY, offsetZ), 0.001);

  return {
    target: camera.target,
    fov: camera.fov,
    radius,
    yaw: Math.atan2(offsetX, offsetZ),
    pitch: clamp(Math.asin(offsetY / radius), MIN_POLAR_ANGLE, MAX_POLAR_ANGLE),
  };
}

function createCameraFromOrbitState(state: OrbitCameraState): Required<NexusCamera> {
  const cosPitch = Math.cos(state.pitch);

  return {
    target: state.target,
    fov: state.fov,
    position: [
      state.target[0] + Math.sin(state.yaw) * cosPitch * state.radius,
      state.target[1] + Math.sin(state.pitch) * state.radius,
      state.target[2] + Math.cos(state.yaw) * cosPitch * state.radius,
    ],
  };
}
