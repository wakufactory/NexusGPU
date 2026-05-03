import type { ComponentType } from "react";
import sceneConfigs from "./scenes.json";
import type { AnyNexusSceneDefinition, NexusSceneCanvasProps, SceneSliderParameter } from "./types";

type SceneModule = {
  Scene?: ComponentType<{ parameters: any; canvasProps: NexusSceneCanvasProps }>;
  initialParameters?: Record<string, unknown>;
  parameterControls?: readonly SceneSliderParameter<Record<string, unknown>>[];
};

type SceneJsonConfig = {
  id: string;
  title: string;
  description: string;
  module: string;
};

// ビルド時点で存在するsceneファイルを自動収集し、JSONのmodule文字列から参照できるようにする。
const sceneModules = import.meta.glob<SceneModule>("./*.tsx", {
  eager: true,
});

function resolveParameterControls(
  config: SceneJsonConfig,
  sceneModule: SceneModule,
  initialParameters: Record<string, unknown>,
): readonly SceneSliderParameter<Record<string, unknown>>[] {
  return (sceneModule.parameterControls ?? []).map((control) => {
    if (!(control.key in initialParameters)) {
      throw new Error(`${config.id}.parameterControls.${control.key} is missing from initialParameters.`);
    }

    if (typeof initialParameters[control.key] !== "number") {
      throw new Error(`${config.id}.parameterControls.${control.key} must point to a number parameter.`);
    }

    return control as SceneSliderParameter<Record<string, unknown>>;
  });
}

function resolveScene(config: SceneJsonConfig): AnyNexusSceneDefinition | null {
  // JSONにはReact componentを直接入れられないため、moduleパスからScene exportを解決する。
  const sceneModule = sceneModules[config.module];

  if (!sceneModule) {
    console.warn(`[NexusGPU] Skipping scene because its module was not found: ${config.id} (${config.module})`);
    return null;
  }

  if (!sceneModule.Scene) {
    throw new Error(`${config.id}.module must export a Scene component.`);
  }

  const initialParameters = sceneModule.initialParameters ?? {};

  return {
    id: config.id,
    title: config.title,
    description: config.description,
    initialParameters,
    parameterControls: resolveParameterControls(config, sceneModule, initialParameters),
    Component: sceneModule.Scene,
  };
}

export const SCENES = (sceneConfigs as SceneJsonConfig[])
  .map(resolveScene)
  .filter((scene): scene is AnyNexusSceneDefinition => scene !== null);

export type SceneId = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE_ID: SceneId = SCENES[0]?.id ?? "animated-sdf";

export function getSceneDefinition(sceneId: SceneId): AnyNexusSceneDefinition {
  return SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0];
}
