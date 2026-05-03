import type { ComponentType } from "react";
import type { NexusCamera, NexusLighting } from "../nexusgpu";

type NumberParameterKey<Parameters extends object> = {
  [Key in keyof Parameters]-?: Parameters[Key] extends number ? Key : never;
}[keyof Parameters] &
  string;

export type SceneSliderParameter<Parameters extends object> = {
  key: NumberParameterKey<Parameters>;
  name: string;
  min: number;
  max: number;
  step: number;
  precision?: number;
};

export type NexusSceneDefinition<Parameters extends object> = {
  id: string;
  title: string;
  description: string;
  camera: Required<NexusCamera>;
  lighting: Required<NexusLighting>;
  initialParameters: Parameters;
  parameterControls?: readonly SceneSliderParameter<Parameters>[];
  Component: ComponentType<{ parameters: Parameters }>;
};

export type AnyNexusSceneDefinition = NexusSceneDefinition<any>;

export type NexusSceneSettings<Parameters extends object> = Pick<
  NexusSceneDefinition<Parameters>,
  "camera" | "lighting" | "initialParameters" | "parameterControls"
>;

export function defineScene<Parameters extends object>(
  definition: NexusSceneDefinition<Parameters>,
) {
  return definition;
}

export function defineSceneSettings<Parameters extends object>(
  settings: NexusSceneSettings<Parameters>,
) {
  return settings;
}
