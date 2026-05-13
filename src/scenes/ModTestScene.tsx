import { useState } from "react";
import { NexusCanvas, SdfBox, SdfDodecahedron, SdfEllipsoid, SdfFunction, SdfGroup, SdfIcosahedron, SdfMix, SdfModifier, SdfOctahedron, SdfSphere, SdfTorus, useFrame } from "../nexusgpu";
import type { SdfSphereProps, Vec3,NexusTextureSource } from "../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";
import { axisAngleToQuaternion } from "../nexusgpu/math";

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  { sphereSmoothness: 0.7,
    mixratio: 0.5,
    mixratio2: 0.5,
   },
  [
    {
      key: "sphereSmoothness",
      name: "Sphere smoothness",
      min: 0,
      max: 1.,
      step: 0.05,
    },
    {
      key: "mixratio",
      name: "Mix ratio",
      min: 0,
      max: 1,
      step: 0.02,
    },
    {
      key: "mixratio2",
      name: "Mix ratio 2",
      min: 0,
      max: 1,
      step: 0.02,
    },
  ],
);


export type ModTestSceneParameters = typeof initialParameters;
type ModTestSceneProps = {
  parameters: ModTestSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};
const textures:NexusTextureSource[] = [
  { src: `${import.meta.env.BASE_URL}assets/tex1024.png`, magFilter: "linear", addressModeU: "repeat", addressModeV: "repeat"  },
]

/** 薄い床の上で、4つの球が別々の軸と周期で周回するデモシーン。 */
function ModTestSceneContent({ parameters }: { parameters: ModTestSceneParameters }) {

  useFrame(({ elapsed }) => {

  });

  return (
    <>
    <SdfGroup op="and" >
      <SdfBox size={[10,4,10]} color={[0.2, 0.23, 0.28]} />
      <SdfGroup op="or" smoothness={parameters.sphereSmoothness}>
      <SdfFunction 
        sdfFunction={`return dot(point,vec3(0,1.,0));`}
        position={[0, -0.6, 0]}
        color={[0.2, 0.23, 0.28]}
        smoothness={1}
      />
      <SdfModifier preset="preRepeat" data0={[2, 0, 2, 0]} active={true}>
        <SdfMix ratio={parameters.mixratio2} active={true}>
        <SdfMix ratio={parameters.mixratio} active={true}>
          <SdfOctahedron smoothness={1} active={true}
            position={[0, 0., 0]}
            radius={0.6}
            color={[0.8, 0.3, 0.3]} 
          />
          <SdfBox
            position={[0, 0., 0]}
            size={[1.2, 1.2, 1.2]}
            color={[0.3, 0.8, 0.3]}
          />  
          </SdfMix>
          <SdfTorus active={true}
            position={[0, 0, 0]}
            majorRadius={0.6}
            minorRadius={0.2}
            color={[0.3, 0.3, 0.8]}
            rotation={axisAngleToQuaternion([1, 0, 0], Math.PI / 2)}
          />
        </SdfMix>

      </SdfModifier>  
      </SdfGroup>
    </SdfGroup>
    </>
  );
}

export function Scene({ parameters, canvasProps }: ModTestSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 3.7, 4.2], target: [0, 0, 0], fov: 48 }}
      lighting={{ direction: [0.25, 0.85, 0.35],color:[1,1,1]}}
      orbitControls
      textures={textures}
    >
      <ModTestSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
