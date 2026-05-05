import { useState } from "react";
import { NexusCanvas, SdfFunction,SdfGroup,SdfBox, useFrame, SdfSphere } from "../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    freq: 5,
    edge: 0.5,
    experimentSpeed: 1.2,
    tick: 0.025,
  },
  [
    {
      key: "freq",
      name: "freq",
      min: 0.1,
      max: 20,
      step: 0.02,
    },
    {
      key: "edge",
      name: "edge",
      min: 0,
      max: 1.5,
      step: 0.01,
    },
    {
      key: "experimentSpeed",
      name: "Speed",
      min: 0,
      max: 5,
      step: 0.1,
    },
    {
      key: "tick",
      name: "Thickness",
      min: 0.001,
      max: 0.1,
      step: 0.001,
      precision: 3,
    },
  ],
);

export type Noise0SceneParameters = typeof initialParameters;

const EXPERIMENT_SDF = /* wgsl */ `
let freq = data0.x; // 周期性。大きいほど細かいノイズになる。;
let div = freq*6. ;
var ppoint = point ;
ppoint.z += -data0.z ;
var heightDistance = abs(-simplexNoise(ppoint*freq) - data0.y)/div-data0.w;

return heightDistance; // 高さ場単体で見たいときはこちらを有効に。
`;

type Noise0SceneProps = {
  parameters: Noise0SceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

type Noise0SceneContentProps = {
  parameters: Noise0SceneParameters;
};

function Noise0SceneContent({ parameters }: Noise0SceneContentProps) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.experimentSpeed);
  });

  return (
    <SdfGroup op="and" smoothness={0.5}>
    <SdfFunction
      sdfFunction={EXPERIMENT_SDF}
      // data0は形状の大きさ、変形量、厚みを渡す。
      data0={[parameters.freq, parameters.edge,phase,parameters.tick]}
      // data1は主に周期性とアニメーション位相を渡す。
      data1={[0, 0, phase, 0]}
      // data2はWGSL実験時の予備スロットとして空けておく。
      data2={[0, 0, 0, 0]}
      position={[0, -1.3, 0.1]}
      color={[0.18, 0.62, 0.95]}
      smoothness={0.5}
      bounds={{ radius: 18 }}
    />

    <SdfSphere position={[0, 0, 0]} radius={2} color={[0.95, 0.55, 0.18]} smoothness={0.9}/>
  
    </SdfGroup>
  );
}

/** SdfFunctionのWGSLを書き換えて試すための実験用テンプレートscene。 */
export function Scene({ parameters, canvasProps }: Noise0SceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 3.2, 3.4], target: [0, 0, 0], fov: 46 }}
      lighting={{ direction: [0.18, 0.9, 0.32] }}
      orbitControls
    >
      <Noise0SceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
