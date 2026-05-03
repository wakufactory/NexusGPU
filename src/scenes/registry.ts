import type { ComponentType } from "react";
import sceneConfigs from "./scenes.json";
import type { NexusCamera, NexusLighting } from "../nexusgpu";
import type { AnyNexusSceneDefinition, SceneSliderParameter } from "./types";

type SceneModule = {
  Scene?: ComponentType<{ parameters: any }>;
};

type SceneJsonConfig = {
  id: string;
  title: string;
  description: string;
  module: string;
  camera: {
    position: number[];
    target: number[];
    fov: number;
  };
  lighting: {
    direction: number[];
  };
  initialParameters: Record<string, unknown>;
  parameterControls?: SceneJsonSliderParameter[];
};

type SceneJsonSliderParameter = {
  key: string;
  name: string;
  min: number;
  max: number;
  step: number;
  precision?: number;
};

// ビルド時点で存在するsceneファイルを自動収集し、JSONのmodule文字列から参照できるようにする。
const sceneModules = import.meta.glob<SceneModule>("./*.tsx", {
  eager: true,
});

// JSONから読む配列はtuple型にならないため、NexusGPUが期待するVec3形状を実行時に確認する。
function assertVec3(value: number[], label: string): asserts value is [number, number, number] {
  if (value.length !== 3 || value.some((item) => typeof item !== "number")) {
    throw new Error(`${label} must be a three-number array.`);
  }
}

function resolveCamera(config: SceneJsonConfig): Required<NexusCamera> {
  assertVec3(config.camera.position, `${config.id}.camera.position`);
  assertVec3(config.camera.target, `${config.id}.camera.target`);

  if (typeof config.camera.fov !== "number") {
    throw new Error(`${config.id}.camera.fov must be a number.`);
  }

  return {
    position: config.camera.position,
    target: config.camera.target,
    fov: config.camera.fov,
  };
}

function resolveLighting(config: SceneJsonConfig): Required<NexusLighting> {
  assertVec3(config.lighting.direction, `${config.id}.lighting.direction`);

  return {
    direction: config.lighting.direction,
  };
}

function resolveParameterControls(
  config: SceneJsonConfig,
): readonly SceneSliderParameter<Record<string, unknown>>[] {
  return (config.parameterControls ?? []).map((control) => {
    // Sliderはnumber parameter専用なので、JSONのkeyと初期値の対応をここで検証する。
    if (!(control.key in config.initialParameters)) {
      throw new Error(`${config.id}.parameterControls.${control.key} is missing from initialParameters.`);
    }

    if (typeof config.initialParameters[control.key] !== "number") {
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

  return {
    id: config.id,
    title: config.title,
    description: config.description,
    camera: resolveCamera(config),
    lighting: resolveLighting(config),
    initialParameters: config.initialParameters,
    parameterControls: resolveParameterControls(config),
    Component: sceneModule.Scene,
  };
}

export const SCENES = (sceneConfigs as SceneJsonConfig[]).map(resolveScene);

export type SceneId = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE_ID: SceneId = SCENES[0]?.id ?? "animated-sdf";

export function getSceneDefinition(sceneId: SceneId): AnyNexusSceneDefinition {
  return SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0];
}
