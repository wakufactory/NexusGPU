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
};

// 距離場を評価した結果。smoothnessはこのhitがsmooth unionに参加できる幅。
struct SceneHit {
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(1) var<storage, read> objects: array<SdfObject, MAX_OBJECTS>;
`;
