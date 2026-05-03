import { useState } from "react";
import { SdfFunction, useFrame } from "../nexusgpu";
import { defineSceneSettings } from "./types";

export type SdfExperimentSceneParameters = {
  experimentAmplitude: number;
  experimentFrequency: number;
  experimentSpeed: number;
  experimentThickness: number;
};

export const sceneSettings = defineSceneSettings<SdfExperimentSceneParameters>({
  camera: {
    position: [0, 3.2, 7.4],
    target: [0, 0, 0],
    fov: 46,
  },
  lighting: {
    direction: [0.18, 0.9, 0.32],
  },
  initialParameters: {
    experimentAmplitude: 0.42,
    experimentFrequency: 3.6,
    experimentSpeed: 1.2,
    experimentThickness: 0.025,
  },
  parameterControls: [
    {
      key: "experimentAmplitude",
      name: "Amplitude",
      min: 0,
      max: 1.2,
      step: 0.02,
    },
    {
      key: "experimentFrequency",
      name: "Frequency",
      min: 0.2,
      max: 9,
      step: 0.1,
    },
    {
      key: "experimentSpeed",
      name: "Speed",
      min: 0,
      max: 5,
      step: 0.1,
    },
    {
      key: "experimentThickness",
      name: "Thickness",
      min: 0.005,
      max: 0.12,
      step: 0.005,
      precision: 3,
    },
  ],
});

const EXPERIMENT_SDF = /* wgsl */ `
// SDF実験用テンプレート。
// data0: xy = half size, z = amplitude, w = half thickness.
// data1: x = x frequency, y = z frequency, z = animated phase.
// data2: 自由に使える追加パラメータ。必要に応じてregistryのsliderも増やす。
let halfSize = data0.xy;
let amplitude = data0.z;
let halfThickness = data0.w;
let phase = data1.z;

// ここを差し替えると、別の高さ場SDFをすぐ試せる。
// pointはSdfFunctionのlocal space上の評価点。
let radial = length(point.xz);
let ripple = sin(radial * data1.x - phase);
let crossWave = sin((point.x + point.z) * data1.y + phase * 0.5) * 0.35;
let height = amplitude * (ripple + crossWave);

// 高さ場の距離は勾配が大きいとraymarchが飛び越えやすい。
// 実験しやすさを優先して、frequency/amplitudeから保守的な補正をかける。
let maxGradient = sqrt(1.0 + pow(max(abs(data1.x), abs(data1.y)) * amplitude * 1.35, 2.0));
let heightDistance = (point.y - height) / maxGradient;
let slabDistance = abs(heightDistance) - halfThickness;

// 無限平面ではなく有限矩形にして、実験対象の境界を見やすくする。
let edgeDistance = max(abs(point.x) - halfSize.x, abs(point.z) - halfSize.y);
let outsideDistance = length(max(vec2<f32>(edgeDistance, slabDistance), vec2<f32>(0.0)));
let insideDistance = min(max(edgeDistance, slabDistance), 0.0);
return outsideDistance + insideDistance;
`;

type SdfExperimentSceneProps = {
  parameters: SdfExperimentSceneParameters;
};

/** SdfFunctionのWGSLを書き換えて試すための実験用テンプレートscene。 */
export function SdfExperimentScene({ parameters }: SdfExperimentSceneProps) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.experimentSpeed);
  });

  return (
    <SdfFunction
      sdfFunction={EXPERIMENT_SDF}
      // data0は形状の大きさ、変形量、厚みを渡す。
      data0={[12, 12, parameters.experimentAmplitude, parameters.experimentThickness]}
      // data1は主に周期性とアニメーション位相を渡す。
      data1={[parameters.experimentFrequency, parameters.experimentFrequency * 0.72, phase, 0]}
      // data2はWGSL実験時の予備スロットとして空けておく。
      data2={[0, 0, 0, 0]}
      position={[0, 0, 0]}
      color={[0.18, 0.62, 0.95]}
      smoothness={0}
      bounds={{ radius: 18 }}
    />
  );
}

// scenes.jsonのmodule解決では、各sceneファイルのScene exportを共通エントリとして使う。
export const Scene = SdfExperimentScene;
