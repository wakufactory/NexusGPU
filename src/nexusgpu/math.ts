import type { Quaternion, Vec3 } from "./types";

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

/** propsで受け取ったQuaternionを検証・正規化し、不正値やゼロ長ならfallbackを使う。 */
export function normalizeQuaternion(value: Quaternion | undefined, fallback: Quaternion): Quaternion {
  if (!value) {
    return fallback;
  }

  const x = Number.isFinite(value[0]) ? value[0] : fallback[0];
  const y = Number.isFinite(value[1]) ? value[1] : fallback[1];
  const z = Number.isFinite(value[2]) ? value[2] : fallback[2];
  const w = Number.isFinite(value[3]) ? value[3] : fallback[3];
  const length = Math.hypot(x, y, z, w);

  if (length <= 0.000001) {
    return fallback;
  }

  return [x / length, y / length, z / length, w / length];
}

/** 数値を指定範囲に収める小さなユーティリティ。 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
