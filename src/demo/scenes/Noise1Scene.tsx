import { useState } from "react";
import { NexusCanvas, SdfFunction,SdfGroup,SdfBox, useCamera, useFrame, SdfModifier } from "../../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";
import { defineSceneRenderSettings } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 200,
  maxDistance: 200,
  shadows: false,
  normalEpsilon: 0.001,
  surfaceEpsilon: 0.0025,
  hitInteriorSurfaces: false,
});

export type Noise1SceneParameters = typeof initialParameters;

type Noise1SceneProps = {
  parameters: Noise1SceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

type Noise1SceneContentProps = {
  parameters: Noise1SceneParameters;
};

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    freq: 5,
    edge: 0.5,
    experimentSpeed: 1.2,
    camSpeed: 0.02,
    tick: 0.025,
  },
  [
    {
      key: "freq",
      name: "freq",
      min: 0.02,
      max: 10,
      step: 0.02,
    },
    {
      key: "edge",
      name: "edge",
      min: 0,
      max: 1.7,
      step: 0.01,
    },
    {
      key: "tick",
      name: "Thickness",
      min: 0.0,
      max: 0.1,
      step: 0.001,
      precision: 3,
    },
    {
      key: "experimentSpeed",
      name: "Speed",
      min: 0,
      max: 0.5,
      step: 0.01,
    },
    {
      key: "camSpeed",
      name: "CameraSpeed",
      min: 0,
      max: 0.1,
      step: 0.001,
    },
  ],
);

const EXPERIMENT_SDF = /* wgsl */ `
let freq = data0.x; // 周期性。大きいほど細かいノイズになる。;
let div = freq*6. ; 
var ppoint = vec4(point*freq,data0.z);  ;
ppoint.z += -data0.z ; // アニメーションのためにzを時間で動かす。
var noiseDistance = abs(simplexNoise4d(ppoint) - data0.y)/div-data0.w; 
//var noiseDistance = abs(-simplexNoise3d(ppoint.xyz) - data0.y)/div-data0.w; 

return noiseDistance; 
`;

function Noise1SceneContent({ parameters }: Noise1SceneContentProps) {
  const [phase, setPhase] = useState(0);
  const camera = useCamera();

  useFrame(({ elapsed }) => {
    const angle = -elapsed * parameters.camSpeed;
    const radius = 55;
    const height = 3;
    const lookAhead = 3;
    const position: [number, number, number] = [Math.sin(angle) * radius, height, Math.cos(angle) * radius];
    const target: [number, number, number] = [
      Math.sin(angle - lookAhead) * radius,
      height - 0.35,
      Math.cos(angle - lookAhead) * radius,
    ];

    camera.set({
      position,
      target,
      fov: 46,
    });
    setPhase(elapsed * parameters.experimentSpeed);
  });

  return (
    <SdfGroup op="and" smoothness={0.}>
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
    />
    <SdfModifier preset="preRepeat" data0={[10, 10, 10, 0]}>
    <SdfBox position={[0, 0, 0]} size={[5,5,5]} color={[0.95, 0.25, 0.18]} smoothness={0.9} />
    </SdfModifier>
    <SdfBox position={[0, 0, 0]} size={[50, 50, 50]} />
    </SdfGroup>
  );
}
export function Scene({ parameters, canvasProps }: Noise1SceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 3.2, 3.4], target: [0, 0, 0], fov: 46 }}
      lighting={{ direction: [0.18, 0.9, 0.32] }}
      orbitControls
    >
      <Noise1SceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
