import { createContext, useContext } from "react";
import { SceneStore } from "./SceneStore";

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
