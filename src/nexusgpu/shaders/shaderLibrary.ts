export type ShaderChunkLibrary = Record<string, string>;

const INCLUDE_PATTERN = /^[ \t]*#include\s+<([A-Za-z0-9_./-]+)>[ \t]*;?[ \t]*$/gm;

export const shaderChunkLibrary = {
  "sdf/sphere": /* wgsl */ `
// 球のSigned Distance Function。
fn sdSphere(point: vec3<f32>, radius: f32) -> f32 {
  return length(point) - radius;
}
`,
  "sdf/box": /* wgsl */ `
// 箱のSigned Distance Function。boundsは中心から各面までの半径ベクトル。
fn sdBox(point: vec3<f32>, bounds: vec3<f32>) -> f32 {
  let q = abs(point) - bounds;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}
`,
  "sdf/cylinder": /* wgsl */ `
// Y軸方向の円柱のSigned Distance Function。dimensionsは(radius, halfHeight)。
fn sdCylinder(point: vec3<f32>, dimensions: vec2<f32>) -> f32 {
  let d = abs(vec2<f32>(length(point.xz), point.y)) - dimensions;
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}
`,
  "sdf/torus": /* wgsl */ `
// XZ平面上のトーラスのSigned Distance Function。radiiは(majorRadius, minorRadius)。
fn sdTorus(point: vec3<f32>, radii: vec2<f32>) -> f32 {
  let q = vec2<f32>(length(point.xz) - radii.x, point.y);
  return length(q) - radii.y;
}
`,
  "sdf/ellipsoid": /* wgsl */ `
// 楕円球のSigned Distance Function。radiiはX/Y/Z各軸の半径。
fn sdEllipsoid(point: vec3<f32>, radii: vec3<f32>) -> f32 {
  let safeRadii = max(radii, vec3<f32>(0.001));
  let k0 = length(point / safeRadii);
  let k1 = length(point / (safeRadii * safeRadii));
  if (k1 <= 0.000001) {
    return -min(safeRadii.x, min(safeRadii.y, safeRadii.z));
  }
  return k0 * (k0 - 1.0) / k1;
}
`,
  "sdf/smooth-min": /* wgsl */ `
// 複数のSDFを滑らかに結合するためのsmooth min。
fn smoothMin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0001) {
    return min(a, b);
  }

  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
`,
  "math/quaternion": /* wgsl */ `
// quaternionで3Dベクトルを回転する。qは[x, y, z, w]の正規化済み値。
fn rotateByQuaternion(point: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
  let qVector = q.xyz;
  let uv = cross(qVector, point);
  let uuv = cross(qVector, uv);
  return point + ((uv * q.w) + uuv) * 2.0;
}
`,
} satisfies ShaderChunkLibrary;

export function resolveShaderIncludes(
  source: string,
  library: ShaderChunkLibrary = shaderChunkLibrary,
  includeStack: string[] = [],
): string {
  return source.replace(INCLUDE_PATTERN, (_statement, chunkName: string) => {
    if (includeStack.includes(chunkName)) {
      throw new Error(`Cyclic shader include detected: ${[...includeStack, chunkName].join(" -> ")}`);
    }

    const chunk = library[chunkName];
    if (chunk === undefined) {
      throw new Error(`Unknown shader include <${chunkName}>.`);
    }

    return resolveShaderIncludes(chunk, library, [...includeStack, chunkName]).trim();
  });
}
