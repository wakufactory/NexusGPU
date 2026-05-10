export type ShaderChunkLibrary = Record<string, string>;

const INCLUDE_PATTERN = /^[ \t]*#include\s+<([A-Za-z0-9_./-]+)>[ \t]*;?[ \t]*$/gm;

export const shaderChunkLibrary = {
  // Built-in sphere SDF and analytic gradient.
  "sdf/sphere": /* wgsl */ `
// 球のSigned Distance Function。
fn sdSphere(point: vec3<f32>, radius: f32) -> f32 {
  return length(point) - radius;
}

fn sdSphereGrad(point: vec3<f32>) -> vec3<f32> {
  let pointLength = length(point);
  if (pointLength <= 0.000001) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }

  return point / pointLength;
}
`,
  // Built-in axis-aligned box SDF and analytic gradient.
  "sdf/box": /* wgsl */ `
// 箱のSigned Distance Function。boundsは中心から各面までの半径ベクトル。
fn sdBox(point: vec3<f32>, bounds: vec3<f32>) -> f32 {
  let q = abs(point) - bounds;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdBoxGrad(point: vec3<f32>, bounds: vec3<f32>) -> vec3<f32> {
  let q = abs(point) - bounds;
  let outside = max(q, vec3<f32>(0.0));

  if (length(outside) > 0.000001) {
    return normalize(outside * sign(point));
  }

  if (q.x > q.y && q.x > q.z) {
    return vec3<f32>(sign(point.x), 0.0, 0.0);
  }

  if (q.y > q.z) {
    return vec3<f32>(0.0, sign(point.y), 0.0);
  }

  return vec3<f32>(0.0, 0.0, sign(point.z));
}
`,
  // Built-in Y-axis cylinder SDF and analytic gradient.
  "sdf/cylinder": /* wgsl */ `
// Y軸方向の円柱のSigned Distance Function。dimensionsは(radius, halfHeight)。
fn sdCylinder(point: vec3<f32>, dimensions: vec2<f32>) -> f32 {
  let d = abs(vec2<f32>(length(point.xz), point.y)) - dimensions;
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}

fn sdCylinderGrad(point: vec3<f32>, dimensions: vec2<f32>) -> vec3<f32> {
  let radialLength = length(point.xz);
  let radial = point.xz / max(radialLength, 0.000001);
  let d = abs(vec2<f32>(radialLength, point.y)) - dimensions;

  if (d.x > 0.0 && d.y > 0.0) {
    return normalize(vec3<f32>(radial.x * d.x, sign(point.y) * d.y, radial.y * d.x));
  }

  if (d.x > d.y) {
    return vec3<f32>(radial.x, 0.0, radial.y);
  }

  return vec3<f32>(0.0, sign(point.y), 0.0);
}
`,
  // Built-in XZ-plane torus SDF and analytic gradient.
  "sdf/torus": /* wgsl */ `
// XZ平面上のトーラスのSigned Distance Function。radiiは(majorRadius, minorRadius)。
fn sdTorus(point: vec3<f32>, radii: vec2<f32>) -> f32 {
  let q = vec2<f32>(length(point.xz) - radii.x, point.y);
  return length(q) - radii.y;
}

fn sdTorusGrad(point: vec3<f32>, radii: vec2<f32>) -> vec3<f32> {
  let radialLength = length(point.xz);
  let radial = point.xz / max(radialLength, 0.000001);
  let q = vec2<f32>(radialLength - radii.x, point.y);
  let qLength = length(q);
  let ringNormal = q / max(qLength, 0.000001);
  let grad = vec3<f32>(radial.x * ringNormal.x, ringNormal.y, radial.y * ringNormal.x);

  if (length(grad) <= 0.000001) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }

  return normalize(grad);
}
`,
  // Built-in ellipsoid SDF and analytic gradient.
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

fn sdEllipsoidGrad(point: vec3<f32>, radii: vec3<f32>) -> vec3<f32> {
  let safeRadii = max(radii, vec3<f32>(0.001));
  let implicitGrad = point / (safeRadii * safeRadii);
  let gradLength = length(implicitGrad);
  if (gradLength <= 0.000001) {
    return vec3<f32>(0.0, 1.0, 0.0);
  }

  return implicitGrad / gradLength;
}
`,
  // Smooth minimum helper used by SDF and custom WGSL snippets.
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
  // Quaternion vector rotation helper used for object transforms.
  "math/quaternion": /* wgsl */ `
// quaternionで3Dベクトルを回転する。qは[x, y, z, w]の正規化済み値。
fn rotateByQuaternion(point: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
  let qVector = q.xyz;
  let uv = cross(qVector, point);
  let uuv = cross(qVector, uv);
  return point + ((uv * q.w) + uuv) * 2.0;
}
`,
  // 3D/4D simplex noise helpers for SdfFunction and modifier snippets.
  "noise/simplex": /* wgsl */ `
// 3D/4D simplex noise。戻り値はおおむね[-1, 1]。
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

fn simplexGrad4(j: f32, ip: vec4<f32>) -> vec4<f32> {
  let ones = vec4<f32>(1.0, 1.0, 1.0, -1.0);
  let pxyz = floor(fract(vec3<f32>(j) * ip.xyz) * 7.0) * ip.z - vec3<f32>(1.0);
  let pw = 1.5 - dot(abs(pxyz), ones.xyz);
  let p = vec4<f32>(pxyz, pw);
  let s = select(vec4<f32>(0.0), vec4<f32>(1.0), p < vec4<f32>(0.0));
  return vec4<f32>(pxyz + (s.xyz * 2.0 - vec3<f32>(1.0)) * vec3<f32>(s.w), pw);
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

fn simplexNoise4d(point: vec4<f32>) -> f32 {
  let c = vec2<f32>(0.1381966011250105, 0.30901699437494745);

  var i = floor(point + dot(point, c.yyyy));
  let x0 = point - i + dot(i, c.xxxx);

  let isX = step(x0.yzw, x0.xxx);
  let isYZ = step(x0.zww, x0.yyz);

  var i0 = vec4<f32>(isX.x + isX.y + isX.z, 1.0 - isX.x, 1.0 - isX.y, 1.0 - isX.z);
  i0 = vec4<f32>(
    i0.x,
    i0.y + isYZ.x + isYZ.y,
    i0.z + (1.0 - isYZ.x) + isYZ.z,
    i0.w + (1.0 - isYZ.y) + (1.0 - isYZ.z)
  );

  let i3 = clamp(i0, vec4<f32>(0.0), vec4<f32>(1.0));
  let i2 = clamp(i0 - vec4<f32>(1.0), vec4<f32>(0.0), vec4<f32>(1.0));
  let i1 = clamp(i0 - vec4<f32>(2.0), vec4<f32>(0.0), vec4<f32>(1.0));

  let x1 = x0 - i1 + c.xxxx;
  let x2 = x0 - i2 + 2.0 * c.xxxx;
  let x3 = x0 - i3 + 3.0 * c.xxxx;
  let x4 = x0 - vec4<f32>(1.0) + 4.0 * c.xxxx;

  i = simplexMod289Vec4(i);
  let j0 = simplexPermute(simplexPermute(simplexPermute(simplexPermute(vec4<f32>(i.w)) + vec4<f32>(i.z)) + vec4<f32>(i.y)) + vec4<f32>(i.x)).x;
  let j1 = simplexPermute(
    simplexPermute(
      simplexPermute(
        simplexPermute(vec4<f32>(i.w) + vec4<f32>(i1.w, i2.w, i3.w, 1.0)) + vec4<f32>(i.z) + vec4<f32>(i1.z, i2.z, i3.z, 1.0)
      ) + vec4<f32>(i.y) + vec4<f32>(i1.y, i2.y, i3.y, 1.0)
    ) + vec4<f32>(i.x) + vec4<f32>(i1.x, i2.x, i3.x, 1.0)
  );

  let ip = vec4<f32>(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);

  var p0 = simplexGrad4(j0, ip);
  var p1 = simplexGrad4(j1.x, ip);
  var p2 = simplexGrad4(j1.y, ip);
  var p3 = simplexGrad4(j1.z, ip);
  var p4 = simplexGrad4(j1.w, ip);

  let norm0 = simplexTaylorInvSqrt(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm0.x;
  p1 *= norm0.y;
  p2 *= norm0.z;
  p3 *= norm0.w;
  p4 *= simplexTaylorInvSqrt(vec4<f32>(dot(p4, p4))).x;

  var m0 = max(vec3<f32>(0.6) - vec3<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3<f32>(0.0));
  var m1 = max(vec2<f32>(0.6) - vec2<f32>(dot(x3, x3), dot(x4, x4)), vec2<f32>(0.0));
  m0 *= m0;
  m1 *= m1;

  return 49.0 * (
    dot(m0 * m0, vec3<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
    dot(m1 * m1, vec2<f32>(dot(p3, x3), dot(p4, x4)))
  );
}

fn simplexNoise(point: vec3<f32>) -> f32 {
  return simplexNoise3d(point);
}
`,
  // Default lit material with ambient, diffuse, optional shadow, and rim terms.
  "material/default": /* wgsl */ `
fn materialDefault(input: MaterialInput) -> vec3<f32> {
  let lightDirection = normalize(camera.lightInfo.xyz);
  let diffuse = max(dot(input.normal, lightDirection), 0.0);
  let rim = 0.0 * pow(max(0.0, 1.0 - dot(input.normal, -input.rayDirection)), 3.0);
  let ambient = 0.54 + 0.1 * input.normal.y;
  let shadowsEnabled = camera.renderInfo.z > 0.5;
  var shadow = 1.0;

  if (shadowsEnabled) {
    let shadowPoint = input.worldPoint + input.normal * 0.015;
    let shadowHit = raymarch(shadowPoint, normalize(camera.lightInfo.xyz));
    let shadowed = shadowHit.distance > 0.0 && shadowHit.distance < min(8.0, camera.renderInfo.y);
    shadow = select(1.0, 0.38, shadowed);
  }

  return input.color * (ambient + diffuse * shadow) + rim * vec3<f32>(0.45, 0.75, 0.86);
}
`,
  // Debug material that visualizes the world-space normal as RGB.
  "material/normal": /* wgsl */ `
fn materialNormal(input: MaterialInput) -> vec3<f32> {
  return input.normal * 0.5 + vec3<f32>(0.5);
}
`,
  // Lightweight Cook-Torrance style material.
  // materialUniform: x=metallic, y=roughness, z=specular, w=ambient.
  "material/pbr": /* wgsl */ `
fn materialPbrFresnelSchlick(cosTheta: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn materialPbrDistributionGgx(normal: vec3<f32>, halfVector: vec3<f32>, roughness: f32) -> f32 {
  let alpha = roughness * roughness;
  let alpha2 = alpha * alpha;
  let nDotH = max(dot(normal, halfVector), 0.0);
  let nDotH2 = nDotH * nDotH;
  let denom = nDotH2 * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(3.14159265359 * denom * denom, 0.0001);
}

fn materialPbrGeometrySchlickGgx(nDotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) * 0.125;
  return nDotV / max(nDotV * (1.0 - k) + k, 0.0001);
}

fn materialPbrGeometrySmith(normal: vec3<f32>, viewDirection: vec3<f32>, lightDirection: vec3<f32>, roughness: f32) -> f32 {
  let nDotV = max(dot(normal, viewDirection), 0.0);
  let nDotL = max(dot(normal, lightDirection), 0.0);
  return materialPbrGeometrySchlickGgx(nDotV, roughness) * materialPbrGeometrySchlickGgx(nDotL, roughness);
}

fn materialPbr(input: MaterialInput) -> vec3<f32> {
  let metallic = clamp(input.materialUniform.x, 0.0, 1.0);
  let roughnessInput = select(input.materialUniform.y, 0.48, abs(input.materialUniform.y) <= 0.0001);
  let roughness = clamp(roughnessInput, 0.04, 1.0);
  let specularInput = select(input.materialUniform.z, 0.5, abs(input.materialUniform.z) <= 0.0001);
  let specular = clamp(specularInput, 0.0, 1.0);
  let ambientInput = select(input.materialUniform.w, 0.28, abs(input.materialUniform.w) <= 0.0001);
  let ambientStrength = clamp(ambientInput, 0.0, 1.0);

  let normal = normalize(input.normal);
  let viewDirection = normalize(input.cam - input.worldPoint);
  let lightDirection = normalize(camera.lightInfo.xyz);
  let lightRadiance = vec3<f32>(3.2);
  let halfVector = normalize(viewDirection + lightDirection);
  let nDotL = max(dot(normal, lightDirection), 0.0);
  let nDotV = max(dot(normal, viewDirection), 0.0);

  let baseColor = clamp(input.color, vec3<f32>(0.0), vec3<f32>(1.0));
  let dielectricF0 = vec3<f32>(0.08 * specular);
  let f0 = mix(dielectricF0, baseColor, metallic);
  let fresnel = materialPbrFresnelSchlick(max(dot(halfVector, viewDirection), 0.0), f0);
  let distribution = materialPbrDistributionGgx(normal, halfVector, roughness);
  let geometry = materialPbrGeometrySmith(normal, viewDirection, lightDirection, roughness);
  let specularTerm = (distribution * geometry * fresnel) / max(4.0 * nDotV * nDotL, 0.0001);
  let diffuseTerm = (vec3<f32>(1.0) - fresnel) * (1.0 - metallic) * baseColor * 0.31830988618;

  var shadow = 1.0;
  if (camera.renderInfo.z > 0.5) {
    let shadowPoint = input.worldPoint + normal * 0.015;
    let shadowHit = raymarch(shadowPoint, lightDirection);
    let shadowed = shadowHit.distance > 0.0 && shadowHit.distance < min(8.0, camera.renderInfo.y);
    shadow = select(1.0, 0.32, shadowed);
  }

  let direct = (diffuseTerm + specularTerm) * lightRadiance * nDotL * shadow;
  let ambient = baseColor * ambientStrength * (1.0 - metallic * 0.55);
  return ambient + direct;
}
`,
  // Texture color material that samples texture0 with localPoint.xz mapping.
  "material/texture0-color": /* wgsl */ `
fn materialTexture0Color(input: MaterialInput) -> vec3<f32> {
  let scale = select(input.materialUniform.x, 1.0, abs(input.materialUniform.x) <= 0.0001);
  let uv = fract(input.localPoint.xz * scale + input.materialUniform.yz);
  let texel = textureSampleLevel(texture0, sampler0, uv, 0.0).rgb;
  return texel * input.color;
}
`,
  // Matcap material that samples texture0 from view-space normal coordinates.
  "material/texture0-matcap": /* wgsl */ `
fn materialTexture0Matcap(input: MaterialInput) -> vec3<f32> {
  let viewRight = normalize(camera.right.xyz);
  let viewUp = normalize(camera.up.xyz);
  let uv = vec2<f32>(dot(input.normal, viewRight), dot(input.normal, viewUp)) * 0.5 + vec2<f32>(0.5);
  let texel = textureSampleLevel(texture0, sampler0, clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
  return texel * input.color;
}
`,
  // HSL to RGB conversion helper for color-driven custom WGSL.
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
