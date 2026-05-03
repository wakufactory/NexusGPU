import {
  AnimatedSdfScene,
  INITIAL_SCENE_PARAMETERS as ANIMATED_SDF_INITIAL_PARAMETERS,
  SCENE_CAMERA as ANIMATED_SDF_CAMERA,
  SCENE_LIGHTING as ANIMATED_SDF_LIGHTING,
} from "./AnimatedSdfScene2";
import {
  WaveSdfScene,
  INITIAL_SCENE_PARAMETERS as WAVE_SDF_INITIAL_PARAMETERS,
  SCENE_CAMERA as WAVE_SDF_CAMERA,
  SCENE_LIGHTING as WAVE_SDF_LIGHTING,
} from "./WaveSdfScene";
import { defineScene } from "./types";
import type { AnyNexusSceneDefinition } from "./types";

export const SCENES = [
  defineScene({
    id: "animated-sdf",
    title: "AnimatedSdfScene2",
    description: "Orbiting SDF primitives from AnimatedSdfScene2 with smooth blending.",
    camera: ANIMATED_SDF_CAMERA,
    lighting: ANIMATED_SDF_LIGHTING,
    initialParameters: ANIMATED_SDF_INITIAL_PARAMETERS,
    parameterControls: [
      {
        key: "sphereSmoothness",
        name: "Sphere smoothness",
        min: 0,
        max: 1.5,
        step: 0.05,
      },
    ],
    Component: AnimatedSdfScene,
  }),
  defineScene({
    id: "wave-sdf",
    title: "Wave SDF",
    description: "Animated height-field plane built with SdfFunction.",
    camera: WAVE_SDF_CAMERA,
    lighting: WAVE_SDF_LIGHTING,
    initialParameters: WAVE_SDF_INITIAL_PARAMETERS,
    parameterControls: [
      {
        key: "waveAmplitude",
        name: "Wave amplitude",
        min: 0,
        max: 0.8,
        step: 0.02,
      },
      {
        key: "waveFrequency",
        name: "Wave frequency",
        min: 0.5,
        max: 7,
        step: 0.1,
      },
      {
        key: "waveSpeed",
        name: "Wave speed",
        min: 0,
        max: 5,
        step: 0.1,
      },
    ],
    Component: WaveSdfScene,
  }),
] satisfies readonly AnyNexusSceneDefinition[];

export type SceneId = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE_ID: SceneId = "animated-sdf";

export function getSceneDefinition(sceneId: SceneId): AnyNexusSceneDefinition {
  return SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0];
}
