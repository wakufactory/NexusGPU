import type { ComponentType } from "react";
import type { NexusCamera, NexusLighting } from "../nexusgpu";

type WidenLiteral<Value> = Value extends string
  ? string
  : Value extends number
    ? number
    : Value extends boolean
      ? boolean
      : Value;

type WidenObject<ObjectType extends object> = {
  [Key in keyof ObjectType]: WidenLiteral<ObjectType[Key]>;
};

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

export function defineScene<Parameters extends object>(
  definition: NexusSceneDefinition<Parameters>,
) {
  return definition;
}

export function defineSceneParameters<const Parameters extends object>(
  parameters: Parameters,
): WidenObject<Parameters> {
  return parameters as WidenObject<Parameters>;
}

export function defineSceneSliderParameters<Parameters extends object>(
  _parameters: Parameters,
  controls: readonly SceneSliderParameter<Parameters>[],
) {
  return controls;
}
