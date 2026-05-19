import { useState } from "react";
import {
  NexusCanvas,
  SdfBox,
  SdfCylinder,
  SdfFunction,
  SdfGroup,
  SdfModifier,
  SdfSphere,
  SdfTorus,
  useFrame,
} from "../nexusgpu";
import { axisAngleToQuaternion } from "../nexusgpu/math";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 175,
  maxDistance: 45,
  shadows: true,
  normalEpsilon: 0.001,
  surfaceEpsilon: 0.0018,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    orbitRadius: 2.74,
    pulse: 0.84,
    shell: 0.127,
    speed: 1.5,
  },
  [
    { key: "orbitRadius", name: "Frequency", min: 0.8, max: 30, step: 0.02 },
    { key: "pulse", name: "Radius", min: 0, max: 1., step: 0.01 },
    { key: "shell", name: "Shell thickness", min: 0.0, max: 0.2, step: 0.001, precision: 3 },
    { key: "speed", name: "Speed", min: 0, max: 2.5, step: 0.05 },
  ],
);

export type Gyroid1SceneParameters = typeof initialParameters;

type Gyroid1SceneProps = {
  parameters: Gyroid1SceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const GYROID_CORE_SDF = /* wgsl */ `
let scale = data0.x;
var po = point;
let repeatAxis = abs(data1.xyz) > vec3<f32>(0.0001);
let cell = select(vec3<f32>(1.0), abs(data1.xyz), repeatAxis);
let grid = floor((po - cell/2.) / cell);
po = po - cell * round(po / cell);
po = select(point, po, repeatAxis);
var p = po * scale;
//p.x = p.x * 0.1;
//p.z = abs(p.z) ;
//p.y = abs(p.y) ;
let ph = (grid.x + grid.z*3.) * 5. ;
let gyroid = sin(p.x) * cos(p.y) + 1.1*sin(data0.w+ph)*sin(p.y) * cos(p.z) + 1.2*sin(data0.w*1.123456+ph)*sin(p.z) * cos(p.x);
let sphere = length(po) - data0.y;
let web = abs(gyroid) / scale - data0.z;
let distance = max(sphere, web);
let stripe = 0.5 + 0.5 * sin((length(po)) * 8.0 + data0.w);
let painted = mix(color, vec3<f32>(1.0, 0.46, 0.14), stripe);
return SceneHit(distance, painted, smoothness, point);
`;

function OrbitalForgeContent({ parameters }: { parameters: Gyroid1SceneParameters }) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.speed);
  });

  return (
    <>

      <SdfGroup op="and" bounds={{radius:5.5}}>
        <SdfBox size={[7, 4, 7]} color={[0.2, 0.23, 0.28]} />
        <SdfGroup op="or" smoothness={0.1}>
          <SdfFunction 
            sdfFunction={`return dot(point,vec3(0,1.,0));`}
            position={[0, -1, 0]}
            color={[0.2, 0.23, 0.28]}
            smoothness={1}
          />
          <SdfFunction
            sdfFunction={GYROID_CORE_SDF}
            data0={[parameters.orbitRadius, parameters.pulse, parameters.shell, phase]}
            data1={[2.5,0,2.5,0]}
            color={[0.9, 0.2, 0.36]}
            smoothness={1}
            material="pbr"
            materialUniform={[0.1, 0.18, 0.1, 0.4]}
          />
        </SdfGroup>
      </SdfGroup>
    </>
  );
}

export function Scene({ parameters, canvasProps }: Gyroid1SceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [3.4, 5.3, 6.6], target: [0, 0, 0], fov: 45 }}
      lighting={{ direction: [-0.18, 0.92, 0.35], color: [0.94, 0.98, 1.0], intensity: 1.25 }}
      background={{ yPositive: [0.018, 0.022, 0.032], yNegative: [0.09, 0.075, 0.075] }}
      orbitControls
    >
      <OrbitalForgeContent parameters={parameters} />
    </NexusCanvas>
  );
}
