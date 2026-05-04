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
  "noise/simplex": /* wgsl */ `
// 3D simplex noise。戻り値はおおむね[-1, 1]。
fn simplexMod289Vec3(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn simplexMod289Vec4(x: vec4<f32>) -> vec4<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn simplexPermute(x: vec4<f32>) -> vec4<f32> {
  return simplexMod289Vec4(((x * 34.0) + vec4<f32>(10.0)) * x);
}

fn simplexTaylorInvSqrt(r: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(1.79284291400159) - 0.85373472095314 * r;
}

fn simplexNoise3d(point: vec3<f32>) -> f32 {
  let c = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
  let d = vec4<f32>(0.0, 0.5, 1.0, 2.0);

  var i = floor(point + dot(point, c.yyy));
  let x0 = point - i + dot(i, c.xxx);

  let g = step(x0.yzx, x0.xyz);
  let l = vec3<f32>(1.0) - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  let x1 = x0 - i1 + c.xxx;
  let x2 = x0 - i2 + c.yyy;
  let x3 = x0 - d.yyy;

  i = simplexMod289Vec3(i);
  let p = simplexPermute(
    simplexPermute(
      simplexPermute(vec4<f32>(i.z) + vec4<f32>(0.0, i1.z, i2.z, 1.0)) + vec4<f32>(i.y) + vec4<f32>(0.0, i1.y, i2.y, 1.0)
    ) + vec4<f32>(i.x) + vec4<f32>(0.0, i1.x, i2.x, 1.0)
  );

  let n = 0.142857142857;
  let ns = n * d.wyz - d.xzx;

  let j = p - vec4<f32>(49.0) * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = vec4<f32>(1.0) - abs(x) - abs(y);

  let b0 = vec4<f32>(x.xy, y.xy);
  let b1 = vec4<f32>(x.zw, y.zw);

  let s0 = floor(b0) * 2.0 + vec4<f32>(1.0);
  let s1 = floor(b1) * 2.0 + vec4<f32>(1.0);
  let sh = -step(h, vec4<f32>(0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  var p0 = vec3<f32>(a0.xy, h.x);
  var p1 = vec3<f32>(a0.zw, h.y);
  var p2 = vec3<f32>(a1.xy, h.z);
  var p3 = vec3<f32>(a1.zw, h.w);

  let norm = simplexTaylorInvSqrt(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  var m = max(vec4<f32>(0.6) - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
  m *= m;
  return 42.0 * dot(m * m, vec4<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

fn simplexNoise(point: vec3<f32>) -> f32 {
  return simplexNoise3d(point);
}
`,
  "color/hsl2rgb": /* wgsl */ `
// hsl.xは色相[0, 1]、hsl.yは彩度[0, 1]、hsl.zは輝度[0, 1]。
fn hsl2rgb(hsl: vec3<f32>) -> vec3<f32> {
  let hue = fract(hsl.x);
  let saturation = clamp(hsl.y, 0.0, 1.0);
  let lightness = clamp(hsl.z, 0.0, 1.0);
  let rgb = clamp(abs(fract(vec3<f32>(hue) + vec3<f32>(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3<f32>(3.0)) - vec3<f32>(1.0), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec3<f32>(lightness) + saturation * (rgb - vec3<f32>(0.5)) * (1.0 - abs(2.0 * lightness - 1.0));
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
