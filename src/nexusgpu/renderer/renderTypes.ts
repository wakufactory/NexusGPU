import type { Vec3 } from "../types";

export type NexusRenderTargetView = {
  view: GPUTextureView;
  x?: number;
  y?: number;
  width: number;
  height: number;
  clearValue?: GPUColor;
};

export type NexusRenderCamera = {
  width: number;
  height: number;
  viewportOrigin: readonly [number, number];
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fov: number;
  projectionMode: "fov" | "inverseProjection";
  inverseProjection: Float32Array;
};
