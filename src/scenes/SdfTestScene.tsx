import { useState } from "react";
import { NexusCanvas, SdfBox, SdfFunction, SdfGroup, useFrame } from "../nexusgpu";
import { defineSceneParameters, defineSceneSliderParameters } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialParameters = defineSceneParameters({
  experimentAmplitude: 0.42,
  experimentFrequency: 3.6,
  experimentSpeed: 1.2,
  experimentThickness: 0.025,
});

export type SdfTestSceneParameters = typeof initialParameters;

type SdfTestSceneProps = {
  parameters: SdfTestSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

type SdfTestSceneContentProps = {
  parameters: SdfTestSceneParameters;
};

export const parameterControls = defineSceneSliderParameters(initialParameters, [
  {
    key: "experimentAmplitude",
    name: "Amplitude",
    min: 0,
    max: 5,
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
    max: 5,
    step: 0.05,
    precision: 3,
  },
]);

const EXPERIMENT_SDF = /* wgsl */ `
// SDF実験用テンプレート。
let gs = 2.;
let cell = vec3<f32>(gs);
let div = floor(point / gs)  ;
var ppoint = fract((point.xyz + cell * 0.5) / cell) * cell - cell * 0.5;
//if(div.x %2.==0.&& div.y%2.==0.) {ppoint.x += gs/2.;ppoint.y+=gs/2.;} ;
var slabDistance = length(ppoint) - data0.z+sin(data1.z)*0.5;
let halfSize = data0.xy;
slabDistance = abs(slabDistance) - data0.w ;
slabDistance = abs(slabDistance) - data0.w/2. ;
slabDistance = abs(slabDistance) - data0.w/4. ;
slabDistance = abs(slabDistance) - data0.w/8. ;
slabDistance = abs(slabDistance) - data0.w/16. ;
slabDistance = abs(slabDistance) - data0.w/32. ;
/*
// 無限平面ではなく有限矩形にして、実験対象の境界を見やすくする。
let edgeDistance = max(abs(point.x) - halfSize.x, abs(point.z) - halfSize.y);
let outsideDistance = length(max(vec2<f32>(edgeDistance, slabDistance), vec2<f32>(0.0)));
let insideDistance = min(max(edgeDistance, slabDistance), 0.0);
return outsideDistance + insideDistance;
*/
//return slabDistance; 
return SceneHit(slabDistance, vec3<f32>(abs(ppoint)/gs), smoothness, ppoint);
`;


function SdfTestSceneContent({ parameters }: SdfTestSceneContentProps) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.experimentSpeed);
  });

  return (
    <SdfGroup op="and" smoothness={0.}>
    <SdfFunction
      sdfFunction={EXPERIMENT_SDF}
      // data0は形状の大きさ、変形量、厚みを渡す。
      data0={[0.5, 0.5, parameters.experimentAmplitude, parameters.experimentThickness]}
      // data1は主に周期性とアニメーション位相を渡す。
      data1={[parameters.experimentFrequency, parameters.experimentFrequency * 0.72, phase, 0]}
      // data2はWGSL実験時の予備スロットとして空けておく。
      data2={[0, 0, 0, 0]}
      position={[0, -1.3, 0.1]}
      color={[0.18, 0.62, 0.95]}
      smoothness={0.5}
      bounds={{ radius: 18 }}
    />

    <SdfBox position={[0, -1.3, 0]} size={[50, 50, 50]} color={[0.95, 0.55, 0.18]} smoothness={0.1}/>
  
    </SdfGroup>
  );
}

/** SdfFunctionのWGSLを書き換えて試すための実験用テンプレートscene。 */
export function Scene({ parameters, canvasProps }: SdfTestSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 23.2, 27.4], target: [0, 0, 0], fov: 60 }}
      lighting={{ direction: [0.18, 0.9, 0.32] }}
      orbitControls
    >
      <SdfTestSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
