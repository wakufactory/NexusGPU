import type { NexusRenderSettings } from "../nexusgpu";

export type RenderSettings = Required<NexusRenderSettings>;

export const INITIAL_RENDER_SETTINGS: RenderSettings = {
  resolutionScale: 0.4,
  maxSteps: 100,
  maxDistance: 42,
  shadows: true,
  normalEpsilon: 0.0025,
  surfaceEpsilon: 0.0025,
  stereoSbs: false,
  stereoBase: 0.08,
  stereoSwapEyes: false,
};
