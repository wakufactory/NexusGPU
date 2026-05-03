import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { SceneStore } from "./SceneStore";
import type { NexusCamera, NexusFrameCallback, NexusLighting } from "./types";

// NexusCanvas配下のプリミティブが、現在のSceneStoreへアクセスするためのContext。
export const SceneContext = createContext<SceneStore | null>(null);

/** NexusCanvas外でプリミティブが使われた場合は、早い段階で明確なエラーにする。 */
export function useSceneStore() {
  const store = useContext(SceneContext);
  if (!store) {
    throw new Error("SDF primitives must be rendered inside <NexusCanvas>.");
  }

  return store;
}

/** NexusCanvas配下で毎フレーム処理を実行する。SDF propsのアニメーションに使う。 */
export function useFrame(callback: NexusFrameCallback) {
  const store = useSceneStore();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return store.subscribeFrame((state) => callbackRef.current(state));
  }, [store]);
}

/** NexusCanvas配下のscene componentからカメラを更新する。 */
export function useCamera() {
  const store = useSceneStore();

  return useMemo(
    () => ({
      set: (camera: NexusCamera) => store.setCamera(camera),
    }),
    [store],
  );
}

/** NexusCanvas配下のscene componentからライティングを更新する。 */
export function useLighting() {
  const store = useSceneStore();

  return useMemo(
    () => ({
      set: (lighting: NexusLighting) => store.setLighting(lighting),
    }),
    [store],
  );
}
