import type { Vec3 } from "./types";

/** propsで受け取ったVec3を検証し、不正値があればfallbackの成分で補う。 */
export function normalizeVec3(value: Vec3 | undefined, fallback: Vec3): Vec3 {
  if (!value) {
    return fallback;
  }

  return [
    Number.isFinite(value[0]) ? value[0] : fallback[0],
    Number.isFinite(value[1]) ? value[1] : fallback[1],
    Number.isFinite(value[2]) ? value[2] : fallback[2],
  ];
}

/** 数値を指定範囲に収める小さなユーティリティ。 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
