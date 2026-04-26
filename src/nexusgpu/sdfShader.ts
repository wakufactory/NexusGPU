export const MAX_SDF_OBJECTS = 128;

// WGSLシェーダ本体。TypeScript側のUniform/Storage Bufferレイアウトと一致させる必要がある。
export const sdfShader = /* wgsl */ `
const MAX_OBJECTS: u32 = ${MAX_SDF_OBJECTS}u;
const MAX_STEPS_CAP: i32 = 160;

// カメラ、描画解像度、デバッグ設定をまとめたUniform。
// vec4境界に揃えることで、WebGPUのアライメントエラーを避ける。
struct CameraUniform {
  resolution: vec2<f32>,
  time: f32,
  fov: f32,
  position: vec4<f32>,
  forward: vec4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  objectInfo: vec4<f32>,
  renderInfo: vec4<f32>,
};

// 1つのSDFオブジェクトをStorage Buffer内で表す固定長レコード。
struct SdfObject {
  positionKind: vec4<f32>,
  dataSmooth: vec4<f32>,
  color: vec4<f32>,
};

// 距離場を評価した結果。distanceは最短距離、colorは最も近い形状の色。
struct SceneHit {
  distance: f32,
  color: vec3<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(1) var<storage, read> objects: array<SdfObject, MAX_OBJECTS>;

// 画面全体を覆う三角形を1枚だけ描く。実際の形状はFragment Shaderで計算する。
@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(3.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );

  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

// 球のSigned Distance Function。
fn sdSphere(point: vec3<f32>, radius: f32) -> f32 {
  return length(point) - radius;
}

// 箱のSigned Distance Function。boundsは中心から各面までの半径ベクトル。
fn sdBox(point: vec3<f32>, bounds: vec3<f32>) -> f32 {
  let q = abs(point) - bounds;
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// 複数のSDFを滑らかに結合するためのsmooth min。
fn smoothMin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 0.0001) {
    return min(a, b);
  }

  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// シーン内の全SDFオブジェクトを走査し、指定点から最も近い表面距離を返す。
fn mapScene(point: vec3<f32>) -> SceneHit {
  var bestDistance = camera.renderInfo.y;
  var bestColor = vec3<f32>(0.72, 0.82, 0.9);

  for (var i = 0u; i < MAX_OBJECTS; i = i + 1u) {
    if (f32(i) >= camera.objectInfo.x) {
      break;
    }

    let object = objects[i];
    let localPoint = point - object.positionKind.xyz;
    let kind = u32(object.positionKind.w + 0.5);
    var distance = 0.0;

    if (kind == 0u) {
      distance = sdSphere(localPoint, object.dataSmooth.x);
    } else {
      distance = sdBox(localPoint, object.dataSmooth.xyz);
    }

    let smoothness = object.dataSmooth.w;
    let merged = smoothMin(bestDistance, distance, smoothness);
    let blend = smoothstep(0.0, max(0.001, smoothness + 0.001), abs(bestDistance - distance));

    if (merged < bestDistance || distance < bestDistance) {
      bestColor = mix(object.color.rgb, bestColor, blend * 0.28);
    }

    bestDistance = merged;
  }

  return SceneHit(bestDistance, bestColor);
}

// 距離場の勾配から法線を近似する。epsilonはデバッグUIから調整できる。
fn estimateNormal(point: vec3<f32>) -> vec3<f32> {
  let e = vec2<f32>(camera.renderInfo.w, 0.0);
  let normal = vec3<f32>(
    mapScene(point + e.xyy).distance - mapScene(point - e.xyy).distance,
    mapScene(point + e.yxy).distance - mapScene(point - e.yxy).distance,
    mapScene(point + e.yyx).distance - mapScene(point - e.yyx).distance
  );

  return normalize(normal);
}

// レイを少しずつ進め、距離場にヒットするまで探索する。
fn raymarch(origin: vec3<f32>, direction: vec3<f32>) -> SceneHit {
  var depth = 0.0;
  var color = vec3<f32>(0.0);
  let maxSteps = i32(clamp(camera.renderInfo.x, 1.0, f32(MAX_STEPS_CAP)));
  let maxDistance = camera.renderInfo.y;
  let surfaceEpsilon = camera.objectInfo.y;

  for (var i = 0; i < MAX_STEPS_CAP; i = i + 1) {
    if (i >= maxSteps) {
      break;
    }

    let point = origin + direction * depth;
    let hit = mapScene(point);

    if (hit.distance < surfaceEpsilon) {
      color = hit.color;
      return SceneHit(depth, color);
    }

    depth = depth + hit.distance;
    if (depth > maxDistance) {
      break;
    }
  }

  return SceneHit(-1.0, color);
}

// 未ヒット時に表示する簡易背景。
fn background(direction: vec3<f32>) -> vec3<f32> {
  let t = 0.5 * (direction.y + 1.0);
  let horizon = vec3<f32>(0.12, 0.16, 0.17);
  let zenith = vec3<f32>(0.02, 0.025, 0.028);
  return mix(horizon, zenith, t);
}

// ピクセルごとにレイを作り、SDFシーンの色を計算する。
@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = (position.xy / camera.resolution) * 2.0 - vec2<f32>(1.0);
  let aspect = camera.resolution.x / camera.resolution.y;
  let focal = 1.0 / tan(radians(camera.fov) * 0.5);
  let direction = normalize(
    camera.forward.xyz * focal +
    camera.right.xyz * uv.x * aspect +
    camera.up.xyz * uv.y
  );

  let hit = raymarch(camera.position.xyz, direction);
  var color = background(direction);

  if (hit.distance > 0.0) {
    let point = camera.position.xyz + direction * hit.distance;
    let normal = estimateNormal(point);
    let lightDirection = normalize(vec3<f32>(-0.45, 0.85, 0.35));
    let diffuse = max(dot(normal, lightDirection), 0.0);
    let rim = pow(max(0.0, 1.0 - dot(normal, -direction)), 3.0);
    let ambient = 0.24 + 0.1 * normal.y;
    let shadowPoint = point + normal * 0.015;
    let shadowHit = raymarch(shadowPoint, lightDirection);
    let shadowsEnabled = camera.renderInfo.z > 0.5;
    let shadowed = shadowsEnabled && shadowHit.distance > 0.0 && shadowHit.distance < min(8.0, camera.renderInfo.y);
    let shadow = select(1.0, 0.38, shadowed);
    color = hit.color * (ambient + diffuse * shadow) + rim * vec3<f32>(0.45, 0.75, 0.86);
  }

  let vignetteUv = position.xy / camera.resolution;
  let vignette = smoothstep(0.82, 0.22, distance(vignetteUv, vec2<f32>(0.5)));
  color = pow(color * vignette, vec3<f32>(0.92));

  return vec4<f32>(color, 1.0);
}
`;
