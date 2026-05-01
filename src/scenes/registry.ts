import {
  AnimatedSdfScene,
  INITIAL_SCENE_PARAMETERS as ANIMATED_SDF_INITIAL_PARAMETERS,
  SCENE_CAMERA as ANIMATED_SDF_CAMERA,
  SCENE_LIGHTING as ANIMATED_SDF_LIGHTING,
} from "./AnimatedSdfScene2";
import { WaveSdfSceneParametersPanel } from "../panels/WaveSdfSceneParametersPanel";
import {
  WaveSdfScene,
  INITIAL_SCENE_PARAMETERS as WAVE_SDF_INITIAL_PARAMETERS,
  SCENE_CAMERA as WAVE_SDF_CAMERA,
  SCENE_LIGHTING as WAVE_SDF_LIGHTING,
} from "./WaveSdfScene";
import { SceneParametersPanel } from "../panels/SceneParametersPanel";
import type { AnyNexusSceneDefinition } from "./types";

export const SCENES = [
  {
    id: "wave-sdf",
    title: "Wave SDF",
    description: "Animated height-field plane built with SdfFunction.",
    camera: WAVE_SDF_CAMERA,
    lighting: WAVE_SDF_LIGHTING,
    initialParameters: WAVE_SDF_INITIAL_PARAMETERS,
    Component: WaveSdfScene,
    ParametersPanel: WaveSdfSceneParametersPanel,
  },
  {
    id: "animated-sdf",
    title: "AnimatedSdfScene2",
    description: "Orbiting SDF primitives from AnimatedSdfScene2 with smooth blending.",
    camera: ANIMATED_SDF_CAMERA,
    lighting: ANIMATED_SDF_LIGHTING,
    initialParameters: ANIMATED_SDF_INITIAL_PARAMETERS,
    Component: AnimatedSdfScene,
    ParametersPanel: SceneParametersPanel,
  },
] satisfies readonly AnyNexusSceneDefinition[];

export type SceneId = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE_ID: SceneId = "wave-sdf";

export function getSceneDefinition(sceneId: SceneId): AnyNexusSceneDefinition {
  return SCENES.find((scene) => scene.id === sceneId) ?? SCENES[0];
}
