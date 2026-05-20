import { useFormState } from "react-dom";
import { NexusCanvas, SdfFunction, useFrame } from "../../nexusgpu";
import { axisAngleToQuaternion } from "../../nexusgpu/math";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";
import { useState } from "react";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 220,
  maxDistance: 24,
  shadows: true,
  normalEpsilon: 0.0008,
  surfaceEpsilon: 0.0012,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    // Mandelbulbの累乗値。高いほど房が細かく鋭く分岐する。
    power: 8,
    // fractal iteration数。高いほど細部が増えるが、SDF評価コストも上がる。
    iterations: 11,
    // 発散判定半径。大きいほど外側の反復を長く追い、形と色の出方が変わる。
    bailout: 4,
    // 見た目の全体サイズ。WGSL側では評価点を割って、距離を掛け戻す。
    scale: 1.05,
    // distance estimatorへの補正倍率。小さいほど安全寄りで厚く、大きいほど細部へ攻める。
    detail: 0.92,
    // パレット補正。シアン/マゼンタ/オレンジの混ざり方をずらす。
    colorShift: 0.32,
    // カスタムパラメータ。色の調整に使用する。
    t1: 0., t2:0 
  },
  [
    { key: "power", name: "Power", min: 2, max: 12, step: 0.1 },
    { key: "iterations", name: "Iterations", min: 4, max: 16, step: 1 },
    { key: "bailout", name: "Bailout", min: 1.5, max: 8, step: 0.1 },
    { key: "scale", name: "Scale", min: 0.5, max: 1.8, step: 0.01 },
    { key: "detail", name: "Detail", min: 0.35, max: 1.35, step: 0.01 },
    { key: "colorShift", name: "Color shift", min: 0, max: 1, step: 0.01 },
    { key: "t1", name: "phase1", min: 0, max: 2, step: 0.01 },
    { key: "t2", name: "phase2", min: 0, max: 10, step: 0.1 },
  ],
);

export type MandelBulbSceneParameters = typeof initialParameters;

type MandelBulbSceneProps = {
  parameters: MandelBulbSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const MANDELBULB_SDF = /* wgsl */ `
// data0.x: power。Mandelbulbの角度変換に使う累乗値。
// data0.y: iterationLimit。実際の反復上限。for文の静的上限18以下で切る。
// data0.z: bailout。反復点がこの半径を超えたら発散として扱う。
// data0.w: detail。距離推定値への倍率。raymarchの攻め具合を調整する。
// data1.x: colorShift。orbit trap色と発散iteration色の混合をずらす。
// data1.y: modelScale。評価座標を拡大縮小し、最後に距離も同じ倍率で戻す。
let modelScale = max(data1.y, 0.05);
let samplePoint = point / modelScale;
let power = max(data0.x, 1.01);
let iterationLimit = max(data0.y, 1.0);
let bailout = max(data0.z, 1.01);
let detail = max(data0.w, 0.05);
let colorShift = data1.x;

var z = samplePoint;
var dr = 1.0;
var r = 0.0;
var trap = 1000.0;
var escapedAt = 0.0;

for (var i = 0; i < 18; i = i + 1) {
  if (f32(i) >= iterationLimit) {
    break;
  }

  r = length(z);
  trap = min(trap, r);
  if (r > bailout) {
    escapedAt = f32(i);
    break;
  }

  let safeR = max(r, 0.00001);
  // powerは球面座標の角度を何倍に折り返すかを決める。Mandelbulbらしい房の数に直結する。
  let theta = acos(clamp(z.z / safeR, -1.0, 1.0)) * power+ data2.x;
  let phi = atan2(z.y, z.x) * power ;
  let zr = pow(safeR, power);

  // drはdistance estimatorの導関数項。大きくなるほど推定距離は短くなり、細部へ寄る。
  dr = pow(safeR, power - 1.0) * data2.y*2. * dr  ;
  z = zr * vec3<f32>(
    sin(theta*1.) * cos(phi),
    sin(phi) * sin(theta) ,
    cos(theta),
  ) + samplePoint;
}

r = max(length(z), 0.00001);
// detailは最終距離だけに掛ける。形状式は変えず、raymarchの見た目の密度を調整する。
let distance = 0.5 * log(r) * r / dr * detail * modelScale;
// trapは反復中に原点へ最も近づいた距離。小さいほど内部の筋や谷を強く色づける。
let orbitBand = clamp(1.0 - trap * 0.55, 0.0, 1.0);
// escapedAtは発散した反復番号。外側の層ごとの色変化に使う。
let iterationBand = escapedAt / max(iterationLimit, 1.0);
let warm = vec3<f32>(1.0, 0.26 + colorShift * 0.35, 0.02);
let cool = vec3<f32>(0.02, 0.82, 1.0);
let accent = vec3<f32>(0.95, 0.05, 1.0);
let deep = vec3<f32>(0.02, 0.0, 0.13);
let chroma = mix(cool, accent, clamp(orbitBand * 0.72 + colorShift * 0.45, 0.0, 1.0));
let painted = mix(mix(deep, chroma, orbitBand), warm, iterationBand * 0.78 + colorShift * 0.2);

return SceneHit(distance, painted, smoothness, point);
`;


function MandelBulbContent({ parameters }: { parameters: MandelBulbSceneParameters }) {
let [phase, setPhase] = useState(0);
useFrame(({ elapsed }) => {
  setPhase(elapsed*parameters.t1);
});

  return (
    <SdfFunction
      sdfFunction={MANDELBULB_SDF}
      // data0は形状の数式と距離推定に効く値をまとめる。
      data0={[parameters.power, parameters.iterations, parameters.bailout, parameters.detail]}
      // data1は見た目寄りの補助値。xが色、yが全体スケール。
      data1={[parameters.colorShift, parameters.scale, 0, 0]}
      data2={[phase*Math.PI, parameters.t2, 0, 0]}
      rotation={axisAngleToQuaternion([0, 1, 0], -0.35)}
      color={[0.08, 0.86, 1.0]}
      smoothness={0.03}
      material="pbr"
      materialUniform={[0.0, 0.42, 0.65, 0.18]}
      bounds={{ radius: 2.4 }}
    />
  );
}

export function Scene({ parameters, canvasProps }: MandelBulbSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [3.0, 1.9, 3.45], target: [0, 0.05, 0], fov: 42 }}
      lighting={{ direction: [-0.38, 0.86, 0.34], color: [1.0, 0.95, 0.88], intensity: 1.25 }}
      background={{ yPositive: [0.015, 0.018, 0.028], yNegative: [0.085, 0.06, 0.09] }}
      orbitControls
    >
      <MandelBulbContent parameters={parameters} />
    </NexusCanvas>
  );
}
