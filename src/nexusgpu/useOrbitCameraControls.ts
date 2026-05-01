import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { DEFAULT_CAMERA } from "./defaults";
import { clamp } from "./math";
import type { SceneStore } from "./SceneStore";
import type { NexusCamera, Vec3 } from "./types";

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

type OrbitCameraControlsOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  camera: NexusCamera | undefined;
  enabled: boolean;
  store: SceneStore;
};

export function useOrbitCameraControls({ canvasRef, camera, enabled, store }: OrbitCameraControlsOptions) {
  const orbitStateRef = useRef<OrbitCameraState | null>(null);

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

  // Canvas上のドラッグ、ホイール、ピンチを、SDFレンダラ用のカメラpropsへ変換する。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) {
      return;
    }

    const activePointers = new Map<number, PointerEvent>();
    let activeDragPointerId: number | null = null;
    let previousPinchDistance: number | null = null;

    const applyOrbitState = (state: OrbitCameraState) => {
      orbitStateRef.current = state;
      store.setCamera(createCameraFromOrbitState(state));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      activePointers.set(event.pointerId, event);
      activeDragPointerId = activePointers.size === 1 ? event.pointerId : null;
      previousPinchDistance = getPointerDistance(activePointers);
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-orbiting");
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) {
        return;
      }

      const state = orbitStateRef.current ?? createOrbitCameraState(resolveCamera(camera));
      activePointers.set(event.pointerId, event);

      if (activePointers.size >= 2) {
        const pinchDistance = getPointerDistance(activePointers);
        if (pinchDistance !== null && previousPinchDistance !== null && pinchDistance > 0) {
          const radius = clamp(state.radius * (previousPinchDistance / pinchDistance), 1.2, 80);
          applyOrbitState({ ...state, radius });
        }
        previousPinchDistance = pinchDistance;
        activeDragPointerId = null;
        event.preventDefault();
        return;
      }

      if (activeDragPointerId !== event.pointerId) {
        activeDragPointerId = event.pointerId;
        event.preventDefault();
        return;
      }

      applyOrbitState({
        ...state,
        yaw: state.yaw - event.movementX * ORBIT_ROTATE_SPEED,
        pitch: clamp(state.pitch + event.movementY * ORBIT_ROTATE_SPEED, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE),
      });
      event.preventDefault();
    };

    const stopOrbiting = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) {
        return;
      }

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      activePointers.delete(event.pointerId);
      activeDragPointerId = activePointers.size === 1 ? (activePointers.keys().next().value ?? null) : null;
      previousPinchDistance = getPointerDistance(activePointers);
      if (activePointers.size === 0) {
        canvas.classList.remove("is-orbiting");
      }
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
    canvasRef,
    enabled,
    store,
  ]);
}

function resolveCamera(camera: NexusCamera | undefined): Required<NexusCamera> {
  return {
    position: camera?.position ?? DEFAULT_CAMERA.position,
    target: camera?.target ?? DEFAULT_CAMERA.target,
    fov: camera?.fov ?? DEFAULT_CAMERA.fov,
  };
}

function getPointerDistance(activePointers: Map<number, PointerEvent>): number | null {
  const [firstPointer, secondPointer] = Array.from(activePointers.values());
  if (!firstPointer || !secondPointer) {
    return null;
  }

  return Math.hypot(firstPointer.clientX - secondPointer.clientX, firstPointer.clientY - secondPointer.clientY);
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
