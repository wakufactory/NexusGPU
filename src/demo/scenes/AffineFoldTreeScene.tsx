import { NexusCanvas, SdfFunction } from "../../nexusgpu";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 180,
  maxDistance: 18,
  shadows: false,
  normalEpsilon: 0.001,
  surfaceEpsilon: 0.0015,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    angle: 0.58,
    scale: 0.68,
    radius: 0.075,
    depth: 10,
    safety: 0.82,
    lean: 0.04,
    spread: 0.18,
    asymmetry: 0.08,
    depthAsymmetry: 0.0,
  },
  [
    { key: "angle", name: "Branch angle", min: 0.1, max: 1.15, step: 0.01 },
    { key: "scale", name: "Affine scale", min: 0.45, max: 0.82, step: 0.01 },
    { key: "radius", name: "Root radius", min: 0.02, max: 0.16, step: 0.005, precision: 3 },
    { key: "depth", name: "Fold depth", min: 2, max: 12, step: 1 },
    { key: "safety", name: "Ray safety", min: 0.45, max: 1.0, step: 0.01 },
    { key: "lean", name: "Lean", min: -0.35, max: 0.35, step: 0.01 },
    { key: "spread", name: "Depth spread", min: 0, max: 0.75, step: 0.01 },
    { key: "asymmetry", name: "Asymmetry", min: -0.35, max: 0.35, step: 0.01 },
    { key: "depthAsymmetry", name: "Depth asymmetry", min: -0.35, max: 0.35, step: 0.01 },
  ],
);

export type AffineFoldTreeSceneParameters = typeof initialParameters;

type AffineFoldTreeSceneProps = {
  parameters: AffineFoldTreeSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const AFFINE_FOLD_TREE_SDF = /* wgsl */ `
// 2D回転の小さなhelper。XY方向の枝開きと、XZ方向の奥行き開きの両方で使う。
fn treeRot2(v: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(c * v.x - s * v.y, s * v.x + c * v.y);
}

fn sdfFunction(
  point: vec3<f32>,
  data0: vec4<f32>,
  data1: vec4<f32>,
  data2: vec4<f32>,
  color: vec3<f32>,
  smoothness: f32
) -> SceneHit {
  // data0:
  //   x = XY平面上の枝角度
  //   y = 子枝空間への縮小率。各fold後に座標をこの値で割り、距離はworldScaleで戻す
  //   z = 各階層で評価する球の基準半径
  //   w = raymarchを保守的にする安全係数。小さいほど抜けにくいが厚く/遅くなる
  let branchAngle = data0.x;
  let affineScale = clamp(data0.y, 0.2, 0.95);
  let rootRadius = max(data0.z, 0.005)*5.;
  let safety = clamp(data0.w, 0.35, 1.0);

  // data1:
  //   x = 各階層の基準枝長
  //   y = fold反復数。実際のforはWGSL都合で12固定上限にしてbreakする
  //   z = 階層ごとの幹の横流れ。完全な自己相似から少し外して木らしくする
  //   w = XZ方向の奥行き開き角度
  let trunkLength = max(data1.x, 0.2);
  let foldDepth = clamp(data1.y, 1.0, 12.0);
  let lean = data1.z;
  let depthSpread = data1.w;

  // data2:
  //   x = XY側の左右非対称。左枝/右枝でbranchAngleへ反対符号で足す
  //   y = Z側の左右非対称。左枝/右枝でdepthSpreadへ反対符号で足す
  let asymmetry = data2.x;
  let depthAsymmetry = data2.y;

  // pは現在階層のローカル評価点。
  // 各loopで「現在階層の1つの球」を測り、その後pを子枝の正準空間へ戻す。
  // これにより2^depth本を列挙せず、depth回の評価だけで自己相似な枝集合を近似する。
  var p = point;

  // pをaffineScaleで割るたびに距離も同じ倍率でワールド距離へ戻す必要がある。
  var worldScale = 1.0;
  var distance = 1e6;
  var closestLevel = 0.0;

  for (var i = 0; i < 12; i = i + 1) {
    if (f32(i) >= foldDepth) {
      break;
    }

    let level = f32(i);
   
    // 現在階層で評価する枝ノード。
    // capsule版では原点からtopへ伸びる線分を測っていたが、現在はtop位置の球を測る。
    // leanだけ階層依存で入れて、完全に機械的な反復に見えすぎないようにする。
    let top = vec3<f32>(lean * level * 0.045, trunkLength, 0.0);

    let capsuleDistance = sdCapsule(
      p,
      top,
      vec3<f32>(0.0),
      rootRadius,
      1.0
    ) * worldScale;
    let localDistance = capsuleDistance;

    if (localDistance < distance) {
      closestLevel = level;
    }
    distance = smoothMin(distance, localDistance, smoothness);

    p = p - top;

    // 子枝が左右どちら側にあるかをfold前に記録する。
    // fold後はabsで片側へ畳むため、このsideだけが左右差を残す手がかりになる。
    let side = select(-1.0, 1.0, p.x >= 0.0);

    // 左右と前後を正準側へ畳む。これが枝数を指数的に増やさずに済ませる中心。
    // 斜めfoldは子枝の正準空間を壊しやすかったため、ここでは安定したX/Z mirrorに限定する。
    p.x = abs(p.x);
    p.z = abs(p.z);

    // まずXZ平面で奥行き方向の枝開きを戻す。
    // depthAsymmetryは左右のsideで符号を変え、奥行き方向だけ別に非対称化する。
    let depthFolded = treeRot2(p.xz, -(depthSpread + depthAsymmetry * side));

    // 次にXY平面で枝角度を戻す。
    // asymmetryはdepthAsymmetryとは独立に、正面から見える枝開きの左右差を作る。
    let branchFolded = treeRot2(vec2<f32>(depthFolded.x, p.y), branchAngle + asymmetry * side);

    // 子枝のローカル空間へスケールを戻す。以降の階層ではこのpを親枝として扱う。
    p = vec3<f32>(branchFolded.x, branchFolded.y, depthFolded.y) / affineScale;

    worldScale = worldScale * affineScale;
  }

  // 最短距離を出した階層で簡易的に色を変える。
  // SceneHitのlocalPointは元のpointにして、material側には実空間の座標感を渡す。
  let levelTone = closestLevel / max(foldDepth - 1.0, 1.0);
  let bark = vec3<f32>(0.34, 0.17, 0.075);
  let newGrowth = vec3<f32>(0.78, 0.52, 0.20);
  let painted = mix(bark, newGrowth, levelTone * 0.65);

  // domain folding + smoothMinは厳密SDFではなくdistance estimator寄りなので、
  // safetyで少し短めに返してraymarchのすり抜けを抑える。
  return SceneHit(distance * safety, painted, smoothness, point);
}
`;

function AffineFoldTreeContent({ parameters }: { parameters: AffineFoldTreeSceneParameters }) {
  return (
    <SdfFunction
      sdfFunction={AFFINE_FOLD_TREE_SDF}
      // data0: branchAngle, affineScale, rootRadius, ray safety.
      data0={[parameters.angle, parameters.scale, parameters.radius, parameters.safety]}
      // data1: trunkLength, foldDepth, lean, depthSpread.
      data1={[1.05, parameters.depth, parameters.lean, parameters.spread]}
      // data2: XY asymmetry, depth asymmetry, reserved, reserved.
      data2={[parameters.asymmetry, parameters.depthAsymmetry, 0, 0]}
      position={[0, -1.15, 0]}
      color={[0.34, 0.17, 0.075]}
      smoothness={0.52}
      material="default"
      materialUniform={[0.04, 0.78, 0.34, 0.08]}
      bounds={{ center: [0, 1.2, 0], radius: 2.9 }}
    />
  );
}

export function Scene({ parameters, canvasProps }: AffineFoldTreeSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [2.35, 1.25, 4.85], target: [0, 0.55, 0], fov: 38 }}
      lighting={{ direction: [-0.48, 0.62, 0.31], color: [1.0, 0.92, 0.78], intensity: 1.35 }}
      background={{ yPositive: [0.025, 0.04, 0.055], yNegative: [0.11, 0.085, 0.055] }}
      orbitControls
    >
      <AffineFoldTreeContent parameters={parameters} />
    </NexusCanvas>
  );
}
