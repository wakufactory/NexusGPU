import { useState } from "react";
import {
  NexusCanvas,
  SdfBox,
  SdfCylinder,
  SdfFunction,
  SdfGroup,
  SdfSphere,
  SdfTorus,
  useFrame,
} from "../nexusgpu";
import { axisAngleToQuaternion } from "../nexusgpu/math";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 180,
  maxDistance: 52,
  shadows: true,
  normalEpsilon: 0.0012,
  surfaceEpsilon: 0.002,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    amplitude: 0.32,
    frequency: 2.15,
    ridge: 0.11,
    speed: 0.8,
  },
  [
    { key: "amplitude", name: "Wave height", min: 0, max: 0.75, step: 0.01 },
    { key: "frequency", name: "Frequency", min: 0.7, max: 4.5, step: 0.05 },
    { key: "ridge", name: "Foam ridge", min: 0.02, max: 0.32, step: 0.01 },
    { key: "speed", name: "Speed", min: 0, max: 2.4, step: 0.05 },
  ],
);

export type ShowcaseWaveTempleSceneParameters = typeof initialParameters;

type ShowcaseWaveTempleSceneProps = {
  parameters: ShowcaseWaveTempleSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const WAVE_FIELD_SDF = /* wgsl */ `
let r = length(point.xz);
let angleWave = sin(atan2(point.z, point.x) * 6.0 + data0.w);
let swell = sin(r * data0.y - data0.w * 1.7);
let cross = sin((point.x - point.z) * data0.y * 0.8 + data0.w * 0.9);
let height = (swell * 0.62 + cross * 0.28 + angleWave * 0.1) * data0.x;
let distance = point.y - height;
let foam = smoothstep(data0.z, 0.0, abs(distance)) * (0.45 + 0.55 * max(swell, 0.0));
let deep = vec3<f32>(0.02, 0.18, 0.28);
let shallow = vec3<f32>(0.08, 0.68, 0.72);
var painted = mix(deep, shallow, clamp(height * 1.6 + 0.42, 0.0, 1.0));
painted = mix(painted, vec3<f32>(0.9, 0.98, 0.9), foam);
return SceneHit(distance, painted, smoothness, point);
`;

function WaveTempleContent({ parameters }: { parameters: ShowcaseWaveTempleSceneParameters }) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.speed);
  });

  const columns = [-2.65, -0.95, 0.95, 2.65];

  return (
    <>
      <SdfGroup op="and">
        <SdfBox position={[0, -0.68, 0]} size={[7.5, 1.1, 7.5]} color={[0.05, 0.2, 0.24]} />
        <SdfFunction
          position={[0, -0.6, 0]}
          sdfFunction={WAVE_FIELD_SDF}
          data0={[parameters.amplitude, parameters.frequency, parameters.ridge, phase]}
          color={[0.08, 0.58, 0.68]}
          smoothness={0.08}
          material="pbr"
          materialUniform={[0.0, 0.22, 0.75, 0.28]}
          bounds={{ radius: 6 }}
        />
      </SdfGroup>
      <SdfBox
        position={[0, -0.98, 0]}
        size={[6.6, 0.22, 6.6]}
        color={[0.12, 0.105, 0.09]}
        material="pbr"
        materialUniform={[0.12, 0.55, 0.35, 0.24]}
      />
      {columns.map((x, index) => (
        <SdfGroup key={x} op="or" smoothness={0.06} material="pbr" materialUniform={[0.18, 0.42, 0.42, 0.22]}>
          <SdfCylinder position={[x, 0.03, -2.65]} radius={0.16} height={1.85} color={[0.82, 0.74, 0.58]} />
          <SdfCylinder position={[x, 0.03, 2.65]} radius={0.16} height={1.85} color={[0.82, 0.74, 0.58]} />
          <SdfSphere position={[x, 1.02, -2.65]} radius={0.24} color={index % 2 === 0 ? [0.96, 0.55, 0.22] : [0.22, 0.74, 0.96]} />
          <SdfSphere position={[x, 1.02, 2.65]} radius={0.24} color={index % 2 === 0 ? [0.22, 0.74, 0.96] : [0.96, 0.55, 0.22]} />
        </SdfGroup>
      ))}
      <SdfTorus
        position={[0, 0.32, 0]}
        rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5)}
        majorRadius={2.35}
        minorRadius={0.045}
        color={[0.94, 0.68, 0.24]}
        material="pbr"
        materialUniform={[0.65, 0.24, 0.7, 0.16]}
      />
    </>
  );
}

export function Scene({ parameters, canvasProps }: ShowcaseWaveTempleSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [3.9, 2.7, 5.2], target: [0, -0.08, 0], fov: 46 }}
      lighting={{ direction: [0.2, 0.92, 0.28], color: [0.86, 0.95, 1.0], intensity: 1.2 }}
      background={{ yPositive: [0.04, 0.07, 0.12], yNegative: [0.1, 0.17, 0.18] }}
      orbitControls
    >
      <WaveTempleContent parameters={parameters} />
    </NexusCanvas>
  );
}
