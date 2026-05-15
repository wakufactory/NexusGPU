export const shaderLayout = /* wgsl */ `
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
  lightInfo: vec4<f32>,
  lightColorInfo: vec4<f32>,
  stereoInfo: vec4<f32>,
  backgroundYPositive: vec4<f32>,
  backgroundYNegative: vec4<f32>,
};

// 1つのSDFオブジェクトをStorage Buffer内で表す固定長レコード。
struct SdfObject {
  positionKind: vec4<f32>,
  data0: vec4<f32>,
  data1: vec4<f32>,
  data2: vec4<f32>,
  colorSmooth: vec4<f32>,
  rotation: vec4<f32>,
  materialInfo: vec4<f32>,
  materialUniform: vec4<f32>,
  boundsInfo: vec4<f32>,
};

// 距離場を評価した公開結果。smoothnessはこのhitがsmooth unionに参加できる幅。
struct SceneHit {
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
  localPoint: vec3<f32>,
};

// raymarch用の軽量な距離評価結果。色やlocalPointはhit後のSceneEvalでだけ回収する。
struct SceneDistance {
  distance: f32,
  smoothness: f32,
};

// renderer内部の評価結果。gradInfo.xyzはworld space gradient、gradInfo.wはgradientの信頼フラグ。
struct SceneEval {
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
  localPoint: vec3<f32>,
  gradInfo: vec4<f32>,
  materialId: f32,
  materialUniform: vec4<f32>,
};

// raymarch後のsurface情報。distanceはray originからの深度を表す。
struct RaymarchHit {
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
  localPoint: vec3<f32>,
  gradInfo: vec4<f32>,
  materialId: f32,
  materialUniform: vec4<f32>,
};

struct MaterialInput {
  color: vec3<f32>,
  normal: vec3<f32>,
  cam: vec3<f32>,
  localPoint: vec3<f32>,
  worldPoint: vec3<f32>,
  rayDirection: vec3<f32>,
  distance: f32,
  materialUniform: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(1) var<storage, read> objects: array<SdfObject, MAX_OBJECTS>;
@group(0) @binding(2) var sampler0: sampler;
@group(0) @binding(3) var sampler1: sampler;
@group(0) @binding(4) var sampler2: sampler;
@group(0) @binding(5) var sampler3: sampler;
@group(0) @binding(6) var texture0: texture_2d<f32>;
@group(0) @binding(7) var texture1: texture_2d<f32>;
@group(0) @binding(8) var texture2: texture_2d<f32>;
@group(0) @binding(9) var texture3: texture_2d<f32>;
`;
