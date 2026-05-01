import type { ComponentType } from "react";
import type { NexusCamera, NexusLighting } from "../nexusgpu";

export type SceneParametersPanelProps<Parameters extends object> = {
  parameters: Parameters;
  onChange: (patch: Partial<Parameters>) => void;
};

export type NexusSceneDefinition<Parameters extends object> = {
  id: string;
  title: string;
  description: string;
  camera: Required<NexusCamera>;
  lighting: Required<NexusLighting>;
  initialParameters: Parameters;
  Component: ComponentType<{ parameters: Parameters }>;
  ParametersPanel?: ComponentType<SceneParametersPanelProps<Parameters>>;
};

export type AnyNexusSceneDefinition = NexusSceneDefinition<any>;
