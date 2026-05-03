import type { ComponentType } from "react";
import sceneConfigs from "./scenes.json";
import type { NexusCamera, NexusLighting } from "../nexusgpu";
import type { AnyNexusSceneDefinition, SceneSliderParameter } from "./types";

type SceneModule = {
  Scene?: ComponentType<{ parameters: any }>;
  camera?: Required<NexusCamera>;
  lighting?: Required<NexusLighting>;
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

function assertVec3(value: readonly number[], label: string): asserts value is [number, number, number] {
  if (value.length !== 3 || value.some((item) => typeof item !== "number")) {
    throw new Error(`${label} must be a three-number array.`);
  }
}

function resolveCamera(config: SceneJsonConfig, sceneModule: SceneModule): Required<NexusCamera> {
  if (!sceneModule.camera) {
    throw new Error(`${config.id}.module must export camera.`);
  }

  assertVec3(sceneModule.camera.position, `${config.id}.camera.position`);
  assertVec3(sceneModule.camera.target, `${config.id}.camera.target`);

  if (typeof sceneModule.camera.fov !== "number") {
    throw new Error(`${config.id}.camera.fov must be a number.`);
  }

  return {
    position: sceneModule.camera.position,
    target: sceneModule.camera.target,
    fov: sceneModule.camera.fov,
  };
}

function resolveLighting(config: SceneJsonConfig, sceneModule: SceneModule): Required<NexusLighting> {
  if (!sceneModule.lighting) {
    throw new Error(`${config.id}.module must export lighting.`);
  }

  assertVec3(sceneModule.lighting.direction, `${config.id}.lighting.direction`);

  return {
    direction: sceneModule.lighting.direction,
  };
}

function resolveParameterControls(
  config: SceneJsonConfig,
  sceneModule: SceneModule,
): readonly SceneSliderParameter<Record<string, unknown>>[] {
  if (!sceneModule.initialParameters) {
    throw new Error(`${config.id}.module must export initialParameters.`);
  }

  const initialParameters = sceneModule.initialParameters;

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

function resolveScene(config: SceneJsonConfig): AnyNexusSceneDefinition {
  // JSONにはReact componentを直接入れられないため、moduleパスからScene exportを解決する。
  const sceneModule = sceneModules[config.module];

  if (!sceneModule) {
    throw new Error(`${config.id}.module was not found: ${config.module}`);
  }

  if (!sceneModule.Scene) {
    throw new Error(`${config.id}.module must export a Scene component.`);
  }

  if (!sceneModule.initialParameters) {
    throw new Error(`${config.id}.module must export initialParameters.`);
  }

  return {
    id: config.id,
    title: config.title,
    description: config.description,
    camera: resolveCamera(config, sceneModule),
    lighting: resolveLighting(config, sceneModule),
    initialParameters: sceneModule.initialParameters,
    parameterControls: resolveParameterControls(config, sceneModule),
    Component: sceneModule.Scene,
  };
}

export const SCENES = (sceneConfigs as SceneJsonConfig[]).map(resolveScene);

export type SceneId = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE_ID: SceneId = SCENES[0]?.id ?? "animated-sdf";

export function getSceneDefinition(sceneId: SceneId): AnyNexusSceneDefinition {
  return SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0];
}
