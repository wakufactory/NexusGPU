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
} from "../../nexusgpu";
import { axisAngleToQuaternion } from "../../nexusgpu/math";
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
    orbitRadius: 4,
    pulse: 0.18,
    shell: 0.055,
    speed: 0.7,
  },
  [
    { key: "orbitRadius", name: "Orbit radius", min: 0.8, max: 30, step: 0.02 },
    { key: "pulse", name: "Core pulse", min: 0, max: 1.2, step: 0.01 },
    { key: "shell", name: "Shell thickness", min: 0.0, max: 0.1, step: 0.001, precision: 3 },
    { key: "speed", name: "Speed", min: 0, max: 2.5, step: 0.05 },
  ],
);

export type Gyroid0SceneParameters = typeof initialParameters;

type Gyroid0SceneProps = {
  parameters: Gyroid0SceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const GYROID_CORE_SDF = /* wgsl */ `
let scale = data0.x;
var p = point * scale;
//p.x = p.x * 0.1;
//p.z = abs(p.z) ;
//p.y = abs(p.y) ;
let gyroid = sin(p.x) * cos(p.y) + 1.1*sin(data0.w)*sin(p.y) * cos(p.z) + 1.2*sin(data0.w*1.123456)*sin(p.z) * cos(p.x);
let sphere = length(point) - data0.y;
let web = abs(gyroid) / scale - data0.z;
let distance = max(sphere, web);
let stripe = 0.5 + 0.5 * sin((length(point)) * 8.0 + data0.w);
let painted = mix(color, vec3<f32>(1.0, 0.46, 0.14), stripe);
return SceneHit(distance, painted, smoothness, point);
`;

function OrbitalForgeContent({ parameters }: { parameters: Gyroid0SceneParameters }) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.speed);
  });

  return (
    <>
      <SdfGroup 
        bounds={{ radius: 1.2}}
        rotation={axisAngleToQuaternion([0, 1, 0], phase * 0.1)}>

          <SdfFunction
            rotation={axisAngleToQuaternion([0, 1, 0], phase * 0.)}
            sdfFunction={GYROID_CORE_SDF}
            data0={[parameters.orbitRadius, parameters.pulse, parameters.shell, phase]}
            color={[0.9, 0.2, 0.36]}
            smoothness={0.04}
            material="pbr"
            materialUniform={[0.1, 0.18, 0.1, 0.4]}
          />

      </SdfGroup>
    </>
  );
}

export function Scene({ parameters, canvasProps }: Gyroid0SceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [3.4, 2.3, 4.6], target: [0, 0, 0], fov: 45 }}
      lighting={{ direction: [-0.18, 0.92, 0.35], color: [0.94, 0.98, 1.0], intensity: 1.25 }}
      background={{ yPositive: [0.018, 0.022, 0.032], yNegative: [0.09, 0.075, 0.075] }}
      orbitControls
    >
      <OrbitalForgeContent parameters={parameters} />
    </NexusCanvas>
  );
}
