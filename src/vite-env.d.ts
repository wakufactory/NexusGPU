/// <reference types="vite/client" />

declare module "virtual:nexusgpu-scene-registry" {
  export type SceneId = string;

  export const SCENES: readonly import("./demo/scenes/types").AnyNexusSceneDefinition[];
  export const DEFAULT_SCENE_ID: SceneId;
  export function getSceneDefinition(
    sceneId: SceneId,
  ): import("./demo/scenes/types").AnyNexusSceneDefinition;
}
