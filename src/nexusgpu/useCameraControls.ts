import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { DEFAULT_CAMERA } from "./defaults";
import { clamp, lengthVec3, normalizeDirectionVec3, subtractVec3 } from "./math";
import type { SceneStore } from "./SceneStore";
import type { NexusCamera, Vec3 } from "./types";

const MIN_POLAR_ANGLE = -Math.PI / 2 + 0.05;
const MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
const ORBIT_ROTATE_SPEED = 0.005;
const ORBIT_ZOOM_SPEED = 0.001;
const DEFAULT_WASD_MOVEMENT_SPEED = 3;

type CameraControlState = {
  position: Vec3;
  target: Vec3;
  fov: number;
  radius: number;
  yaw: number;
  pitch: number;
};

type CameraControlsOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  camera: NexusCamera | undefined;
  orbitEnabled: boolean;
  wasdEnabled: boolean;
  wasdMovementSpeed: number | undefined;
  store: SceneStore;
};

export function useCameraControls({
  canvasRef,
  camera,
  orbitEnabled,
  wasdEnabled,
  wasdMovementSpeed,
  store,
}: CameraControlsOptions) {
  const controlStateRef = useRef<CameraControlState | null>(null);
  const cameraRef = useRef<NexusCamera | undefined>(camera);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // camera propsは初期値またはscene切り替えの入力として扱い、実際の操作状態はSceneStoreのcameraに同期する。
  useEffect(() => {
    store.setCamera(resolveCamera(camera));
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

  useEffect(() => {
    return store.subscribe((snapshot) => {
      controlStateRef.current = createCameraControlState(snapshot.camera);
    });
  }, [store]);

  // Canvas上のドラッグ、ホイール、ピンチを、SDFレンダラ用のカメラpropsへ変換する。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!orbitEnabled && !wasdEnabled)) {
      return;
    }

    const activePointers = new Map<number, PointerEvent>();
    let activeDragPointerId: number | null = null;
    let previousPinchDistance: number | null = null;

    const applyControlState = (state: CameraControlState) => {
      const camera = wasdEnabled ? createFirstPersonCameraFromControlState(state) : createOrbitCameraFromControlState(state);
      controlStateRef.current = createCameraControlState(camera);
      store.setCamera(camera);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      canvas.focus();
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

      const state = controlStateRef.current ?? createCameraControlState(resolveCamera(cameraRef.current));
      activePointers.set(event.pointerId, event);

      if (activePointers.size >= 2) {
        const pinchDistance = getPointerDistance(activePointers);
        if (pinchDistance !== null && previousPinchDistance !== null && pinchDistance > 0) {
          const radius = clamp(state.radius * (previousPinchDistance / pinchDistance), 1.2, 80);
          applyControlState({ ...state, radius });
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

      applyControlState({
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
      if (wasdEnabled) {
        event.preventDefault();
        return;
      }

      const state = controlStateRef.current ?? createCameraControlState(resolveCamera(cameraRef.current));
      const radius = clamp(state.radius * Math.exp(event.deltaY * ORBIT_ZOOM_SPEED), 1.2, 80);
      applyControlState({ ...state, radius });
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", stopOrbiting);
    canvas.addEventListener("pointercancel", stopOrbiting);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      for (const pointerId of activePointers.keys()) {
        if (canvas.hasPointerCapture(pointerId)) {
          canvas.releasePointerCapture(pointerId);
        }
      }
      activePointers.clear();
      activeDragPointerId = null;
      previousPinchDistance = null;
      canvas.classList.remove("is-orbiting");
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", stopOrbiting);
      canvas.removeEventListener("pointercancel", stopOrbiting);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef, orbitEnabled, store, wasdEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wasdEnabled) {
      return;
    }

    const activeKeys = new Set<string>();
    const movementSpeed = wasdMovementSpeed ?? DEFAULT_WASD_MOVEMENT_SPEED;
    let frameId = 0;
    let lastTime: number | null = null;

    const isCanvasFocused = () => document.activeElement === canvas;

    const handlePointerDown = () => {
      canvas.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCanvasFocused() || !isMovementKey(event.code)) {
        return;
      }

      activeKeys.add(event.code);
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!activeKeys.delete(event.code)) {
        return;
      }

      event.preventDefault();
    };

    const clearKeys = () => {
      activeKeys.clear();
    };

    const tick = (time: number) => {
      lastTime ??= time;
      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      if (activeKeys.size > 0 && isCanvasFocused()) {
        const state = controlStateRef.current ?? createCameraControlState(resolveCamera(cameraRef.current));
        const movement = getWasdMovement(state, activeKeys, movementSpeed * delta);
        if (movement) {
          const nextState = {
            ...state,
            position: addVec3(state.position, movement),
            target: addVec3(state.target, movement),
          };
          const nextCamera = createFirstPersonCameraFromControlState(nextState);
          controlStateRef.current = createCameraControlState(nextCamera);
          store.setCamera(nextCamera);
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("blur", clearKeys);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    frameId = requestAnimationFrame(tick);

    return () => {
      activeKeys.clear();
      cancelAnimationFrame(frameId);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("blur", clearKeys);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [canvasRef, store, wasdEnabled, wasdMovementSpeed]);
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

function createCameraControlState(camera: Required<NexusCamera>): CameraControlState {
  const offset = subtractVec3(camera.position, camera.target);
  const radius = Math.max(lengthVec3(offset), 0.001);

  return {
    position: camera.position,
    target: camera.target,
    fov: camera.fov,
    radius,
    yaw: Math.atan2(offset[0], offset[2]),
    pitch: clamp(Math.asin(offset[1] / radius), MIN_POLAR_ANGLE, MAX_POLAR_ANGLE),
  };
}

function createOrbitCameraFromControlState(state: CameraControlState): Required<NexusCamera> {
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

function createFirstPersonCameraFromControlState(state: CameraControlState): Required<NexusCamera> {
  const orbitCamera = createOrbitCameraFromControlState(state);
  const offset = subtractVec3(orbitCamera.position, orbitCamera.target);

  return {
    position: state.position,
    target: subtractVec3(state.position, offset),
    fov: state.fov,
  };
}

function isMovementKey(code: string) {
  return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" || code === "KeyQ" || code === "KeyE";
}

function getWasdMovement(state: CameraControlState, activeKeys: Set<string>, distance: number): Vec3 | null {
  const horizontalForward = normalizeDirectionVec3([Math.sin(state.yaw), 0, Math.cos(state.yaw)], [0, 0, -1]);
  const right = normalizeDirectionVec3([horizontalForward[2], 0, -horizontalForward[0]], [1, 0, 0]);
  let x = 0;
  let y = 0;
  let z = 0;

  if (activeKeys.has("KeyW")) {
    x -= horizontalForward[0];
    z -= horizontalForward[2];
  }
  if (activeKeys.has("KeyS")) {
    x += horizontalForward[0];
    z += horizontalForward[2];
  }
  if (activeKeys.has("KeyD")) {
    x += right[0];
    z += right[2];
  }
  if (activeKeys.has("KeyA")) {
    x -= right[0];
    z -= right[2];
  }
  if (activeKeys.has("KeyE")) {
    y += 1;
  }
  if (activeKeys.has("KeyQ")) {
    y -= 1;
  }

  const direction = normalizeDirectionVec3([x, y, z], [0, 0, 0]);
  if (lengthVec3(direction) <= 0.00001) {
    return null;
  }

  return scaleVec3(direction, distance);
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec3(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}
