import type { ComponentType } from "react";
import sceneConfigs from "./scenes.json";
import type { NexusCamera, NexusLighting } from "../nexusgpu";
import type { AnyNexusSceneDefinition, NexusSceneSettings, SceneSliderParameter } from "./types";

type SceneModule = {
  Scene?: ComponentType<{ parameters: any }>;
  sceneSettings?: NexusSceneSettings<any>;
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

function assertVec3(value: readonly number[], label: string): asserts value is [number, number, number] {
  if (value.length !== 3 || value.some((item) => typeof item !== "number")) {
    throw new Error(`${label} must be a three-number array.`);
  }
}

function resolveCamera(config: SceneJsonConfig, settings: NexusSceneSettings<object>): Required<NexusCamera> {
  assertVec3(settings.camera.position, `${config.id}.camera.position`);
  assertVec3(settings.camera.target, `${config.id}.camera.target`);

  if (typeof settings.camera.fov !== "number") {
    throw new Error(`${config.id}.camera.fov must be a number.`);
  }

  return {
    position: settings.camera.position,
    target: settings.camera.target,
    fov: settings.camera.fov,
  };
}

function resolveLighting(config: SceneJsonConfig, settings: NexusSceneSettings<object>): Required<NexusLighting> {
  assertVec3(settings.lighting.direction, `${config.id}.lighting.direction`);

  return {
    direction: settings.lighting.direction,
  };
}

function resolveParameterControls(
  config: SceneJsonConfig,
  settings: NexusSceneSettings<Record<string, unknown>>,
): readonly SceneSliderParameter<Record<string, unknown>>[] {
  return (settings.parameterControls ?? []).map((control) => {
    if (!(control.key in settings.initialParameters)) {
      throw new Error(`${config.id}.parameterControls.${control.key} is missing from initialParameters.`);
    }

    if (typeof settings.initialParameters[control.key] !== "number") {
      throw new Error(`${config.id}.parameterControls.${control.key} must point to a number parameter.`);
    }

    return control as SceneSliderParameter<Record<string, unknown>>;
  });
}

function resolveScene(config: SceneJsonConfig): AnyNexusSceneDefinition {
  // JSONにはReact componentを直接入れられないため、moduleパスからScene exportを解決する。
  const sceneModule = sceneModules[config.module];

  if (!sceneModule) {
    throw new Error(`${config.id}.module was not found: ${config.module}`);
  }

  if (!sceneModule.Scene) {
    throw new Error(`${config.id}.module must export a Scene component.`);
  }

  if (!sceneModule.sceneSettings) {
    throw new Error(`${config.id}.module must export sceneSettings.`);
  }

  return {
    id: config.id,
    title: config.title,
    description: config.description,
    camera: resolveCamera(config, sceneModule.sceneSettings),
    lighting: resolveLighting(config, sceneModule.sceneSettings),
    initialParameters: sceneModule.sceneSettings.initialParameters,
    parameterControls: resolveParameterControls(config, sceneModule.sceneSettings),
    Component: sceneModule.Scene,
  };
}

export const SCENES = (sceneConfigs as SceneJsonConfig[]).map(resolveScene);

export type SceneId = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE_ID: SceneId = SCENES[0]?.id ?? "animated-sdf";

export function getSceneDefinition(sceneId: SceneId): AnyNexusSceneDefinition {
  return SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0];
}
