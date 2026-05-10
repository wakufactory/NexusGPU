import type { NexusBackground, NexusCamera, ResolvedNexusLighting } from "./types";

export const DEFAULT_CAMERA: Required<NexusCamera> = {
  position: [0, 0.5, 5],
  target: [0, 0, 0],
  fov: 45,
};

export const DEFAULT_LIGHTING: ResolvedNexusLighting = {
  type: "directional",
  direction: [-0.45, 0.85, 0.35],
  color: [1, 1, 1],
  intensity: 1,
  mainLight: {
    type: "directional",
    direction: [-0.45, 0.85, 0.35],
    position: [0, 0, 0],
    color: [1, 1, 1],
    intensity: 1,
    range: 0,
  },
  lights: [
    {
      type: "directional",
      direction: [-0.45, 0.85, 0.35],
      position: [0, 0, 0],
      color: [1, 1, 1],
      intensity: 1,
      range: 0,
    },
  ],
};

export const DEFAULT_BACKGROUND: Required<NexusBackground> = {
  yPositive: [0.02, 0.025, 0.028],
  yNegative: [0.12, 0.16, 0.17],
};
