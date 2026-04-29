import type { NexusCamera, NexusLighting } from "./types";

export const DEFAULT_CAMERA: Required<NexusCamera> = {
  position: [0, 0.5, 5],
  target: [0, 0, 0],
  fov: 45,
};

export const DEFAULT_LIGHTING: Required<NexusLighting> = {
  direction: [-0.45, 0.85, 0.35],
};
