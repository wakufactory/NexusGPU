import { createContext, useContext, useEffect, useRef } from "react";
import { SceneStore } from "./SceneStore";
import type { NexusFrameCallback } from "./types";

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
