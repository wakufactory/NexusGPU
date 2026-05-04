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

function fract(value: number) {
  return value - Math.floor(value);
}

function simplexMod289(value: number) {
  return value - Math.floor(value / 289.0) * 289.0;
}

function simplexPermute(value: number) {
  return simplexMod289(((value * 34.0) + 10.0) * value);
}

function simplexTaylorInvSqrt(value: number) {
  return 1.79284291400159 - 0.85373472095314 * value;
}

function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 3D simplex noise。戻り値はおおむね[-1, 1]。 */
export function simplexNoise3d(point: Vec3) {
  const c = [1.0 / 6.0, 1.0 / 3.0] as const;
  const i: Vec3 = [
    Math.floor(point[0] + (point[0] + point[1] + point[2]) * c[1]),
    Math.floor(point[1] + (point[0] + point[1] + point[2]) * c[1]),
    Math.floor(point[2] + (point[0] + point[1] + point[2]) * c[1]),
  ];
  const iDot = (i[0] + i[1] + i[2]) * c[0];
  const x0: Vec3 = [point[0] - i[0] + iDot, point[1] - i[1] + iDot, point[2] - i[2] + iDot];

  const g: Vec3 = [x0[0] >= x0[1] ? 1.0 : 0.0, x0[1] >= x0[2] ? 1.0 : 0.0, x0[2] >= x0[0] ? 1.0 : 0.0];
  const l: Vec3 = [1.0 - g[0], 1.0 - g[1], 1.0 - g[2]];
  const i1: Vec3 = [Math.min(g[0], l[2]), Math.min(g[1], l[0]), Math.min(g[2], l[1])];
  const i2: Vec3 = [Math.max(g[0], l[2]), Math.max(g[1], l[0]), Math.max(g[2], l[1])];

  const x1: Vec3 = [x0[0] - i1[0] + c[0], x0[1] - i1[1] + c[0], x0[2] - i1[2] + c[0]];
  const x2: Vec3 = [x0[0] - i2[0] + c[1], x0[1] - i2[1] + c[1], x0[2] - i2[2] + c[1]];
  const x3: Vec3 = [x0[0] - 0.5, x0[1] - 0.5, x0[2] - 0.5];

  const ix = simplexMod289(i[0]);
  const iy = simplexMod289(i[1]);
  const iz = simplexMod289(i[2]);
  const p = [0, 1, 2, 3].map((index) => {
    const offset = index === 0 ? [0.0, 0.0, 0.0] : index === 1 ? i1 : index === 2 ? i2 : [1.0, 1.0, 1.0];
    return simplexPermute(simplexPermute(simplexPermute(iz + offset[2]) + iy + offset[1]) + ix + offset[0]);
  });

  const n = 0.142857142857;
  const ns = [n * 2.0, n * 0.5 - 1.0, n] as const;
  const j = p.map((value) => value - 49.0 * Math.floor(value * ns[2] * ns[2]));
  const x_ = j.map((value) => Math.floor(value * ns[2]));
  const y_ = j.map((value, index) => Math.floor(value - 7.0 * x_[index]));

  const x = x_.map((value) => value * ns[0] + ns[1]);
  const y = y_.map((value) => value * ns[0] + ns[1]);
  const h = x.map((value, index) => 1.0 - Math.abs(value) - Math.abs(y[index]));

  const b0 = [x[0], x[1], y[0], y[1]];
  const b1 = [x[2], x[3], y[2], y[3]];
  const s0 = b0.map((value) => Math.floor(value) * 2.0 + 1.0);
  const s1 = b1.map((value) => Math.floor(value) * 2.0 + 1.0);
  const sh = h.map((value) => (value <= 0.0 ? -1.0 : 0.0));
  const a0 = [b0[0] + s0[0] * sh[0], b0[2] + s0[2] * sh[0], b0[1] + s0[1] * sh[1], b0[3] + s0[3] * sh[1]];
  const a1 = [b1[0] + s1[0] * sh[2], b1[2] + s1[2] * sh[2], b1[1] + s1[1] * sh[3], b1[3] + s1[3] * sh[3]];

  let p0: Vec3 = [a0[0], a0[1], h[0]];
  let p1: Vec3 = [a0[2], a0[3], h[1]];
  let p2: Vec3 = [a1[0], a1[1], h[2]];
  let p3: Vec3 = [a1[2], a1[3], h[3]];
  const norm = [simplexTaylorInvSqrt(dot3(p0, p0)), simplexTaylorInvSqrt(dot3(p1, p1)), simplexTaylorInvSqrt(dot3(p2, p2)), simplexTaylorInvSqrt(dot3(p3, p3))];
  p0 = [p0[0] * norm[0], p0[1] * norm[0], p0[2] * norm[0]];
  p1 = [p1[0] * norm[1], p1[1] * norm[1], p1[2] * norm[1]];
  p2 = [p2[0] * norm[2], p2[1] * norm[2], p2[2] * norm[2]];
  p3 = [p3[0] * norm[3], p3[1] * norm[3], p3[2] * norm[3]];

  const m = [x0, x1, x2, x3].map((xValue) => {
    const value = Math.max(0.6 - dot3(xValue, xValue), 0.0);
    return value * value;
  });
  return 42.0 * (m[0] * m[0] * dot3(p0, x0) + m[1] * m[1] * dot3(p1, x1) + m[2] * m[2] * dot3(p2, x2) + m[3] * m[3] * dot3(p3, x3));
}

export function simplexNoise(point: Vec3) {
  return simplexNoise3d(point);
}

/** hsl[0]は色相[0, 1]、hsl[1]は彩度[0, 1]、hsl[2]は輝度[0, 1]。 */
export function hsl2rgb(hsl: Vec3): Vec3 {
  const hue = fract(hsl[0]);
  const saturation = clamp(hsl[1], 0.0, 1.0);
  const lightness = clamp(hsl[2], 0.0, 1.0);
  const rgb = [0.0, 2.0 / 3.0, 1.0 / 3.0].map((offset) => clamp(Math.abs(fract(hue + offset) * 6.0 - 3.0) - 1.0, 0.0, 1.0));
  return [
    lightness + saturation * (rgb[0] - 0.5) * (1.0 - Math.abs(2.0 * lightness - 1.0)),
    lightness + saturation * (rgb[1] - 0.5) * (1.0 - Math.abs(2.0 * lightness - 1.0)),
    lightness + saturation * (rgb[2] - 0.5) * (1.0 - Math.abs(2.0 * lightness - 1.0)),
  ];
}
