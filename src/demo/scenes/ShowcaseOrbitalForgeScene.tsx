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
    orbitRadius: 1.55,
    pulse: 0.18,
    shell: 0.055,
    speed: 0.7,
  },
  [
    { key: "orbitRadius", name: "Orbit radius", min: 0.8, max: 2.4, step: 0.02 },
    { key: "pulse", name: "Core pulse", min: 0, max: 0.42, step: 0.01 },
    { key: "shell", name: "Shell thickness", min: 0.01, max: 0.16, step: 0.005, precision: 3 },
    { key: "speed", name: "Speed", min: 0, max: 2.5, step: 0.05 },
  ],
);

export type ShowcaseOrbitalForgeSceneParameters = typeof initialParameters;

type ShowcaseOrbitalForgeSceneProps = {
  parameters: ShowcaseOrbitalForgeSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const GYROID_CORE_SDF = /* wgsl */ `
let scale = data0.x;
var p = point * scale;
p.x = abs(p.x) ;
p.z = abs(p.z) ;
p.y = abs(p.y) ;
let gyroid = sin(p.x) * cos(p.y) + sin(p.y) * cos(p.z) + sin(p.z) * cos(p.x);
let sphere = length(point) - data0.y;
let web = abs(gyroid) / scale - data0.z;
let distance = max(sphere, web);
let stripe = 0.5 + 0.5 * sin((point.x + point.y + point.z) * 8.0 + data0.w);
let painted = mix(color, vec3<f32>(1.0, 0.46, 0.14), stripe);
return SceneHit(distance, painted, smoothness, point);
`;

function OrbitalForgeContent({ parameters }: { parameters: ShowcaseOrbitalForgeSceneParameters }) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.speed);
  });

  const satellites = Array.from({ length: 8 }, (_, index) => {
    const angle = phase + (index / 8) * Math.PI * 2;
    const lift = Math.sin(angle * 1.7) * 0.32;
    return {
      key: index,
      position: [Math.cos(angle) * parameters.orbitRadius, lift, Math.sin(angle) * parameters.orbitRadius] as const,
      radius: 0.18 + (index % 3) * 0.035,
      color: index % 2 === 0 ? ([0.22, 0.84, 1.0] as const) : ([1.0, 0.42, 0.2] as const),
    };
  });

  return (
    <>
      <SdfBox
        position={[0, -1.25, 0]}
        size={[6.2, 0.16, 6.2]}
        color={[0.045, 0.05, 0.055]}
        material="pbr"
        materialUniform={[0.18, 0.58, 0.4, 0.2]}
      />
      <SdfModifier preset="postOnion" data0={[parameters.shell, 0, 0, 0]}>
        <SdfFunction
          rotation={axisAngleToQuaternion([0, 1, 0], phase * 0.22)}
          sdfFunction={GYROID_CORE_SDF}
          data0={[4.7, 0.86 + Math.sin(phase * 2.0) * parameters.pulse, 0.055, phase]}
          color={[0.3, 0.9, 0.96]}
          smoothness={0.04}
          material="pbr"
          materialUniform={[0.0, 0.18, 0.9, 0.24]}
          bounds={{ radius: 1.2 }}
        />
      </SdfModifier>
      <SdfGroup op="or" smoothness={0.12} material="pbr" materialUniform={[0.62, 0.2, 0.85, 0.16]}>
        <SdfTorus
          rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5)}
          majorRadius={parameters.orbitRadius}
          minorRadius={0.035}
          color={[0.96, 0.68, 0.22]}
        />
        <SdfTorus
          rotation={axisAngleToQuaternion([0, 0, 1], Math.PI * 0.5)}
          majorRadius={parameters.orbitRadius * 0.78}
          minorRadius={0.03}
          color={[0.28, 0.86, 1.0]}
        />
        <SdfCylinder
          rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5)}
          radius={0.045}
          height={parameters.orbitRadius * 3.0}
          color={[0.85, 0.78, 0.62]}
        />
      </SdfGroup>
      <SdfGroup op="or" smoothness={0.16} material="pbr" materialUniform={[0.18, 0.3, 0.65, 0.18]}>
        {satellites.map((satellite) => (
          <SdfSphere
            key={satellite.key}
            position={satellite.position}
            radius={satellite.radius}
            color={satellite.color}
          />
        ))}
      </SdfGroup>
    </>
  );
}

export function Scene({ parameters, canvasProps }: ShowcaseOrbitalForgeSceneProps) {
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
