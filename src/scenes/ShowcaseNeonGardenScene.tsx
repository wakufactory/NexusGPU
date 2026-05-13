import { useState } from "react";
import {
  NexusCanvas,
  SdfBox,
  SdfCylinder,
  SdfEllipsoid,
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
  maxSteps: 150,
  maxDistance: 46,
  shadows: true,
  normalEpsilon: 0.001,
  surfaceEpsilon: 0.002,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    twist: 0.85,
    repeatCell: 2.45,
    bloom: 0.22,
    speed: 0.32,
  },
  [
    { key: "twist", name: "Twist", min: 0, max: 2.4, step: 0.02 },
    { key: "repeatCell", name: "Repeat cell", min: 1.7, max: 3.5, step: 0.05 },
    { key: "bloom", name: "Shell glow", min: 0, max: 0.45, step: 0.01 },
    { key: "speed", name: "Rotation speed", min: 0, max: 1.2, step: 0.02 },
  ],
);

export type ShowcaseNeonGardenSceneParameters = typeof initialParameters;

type ShowcaseNeonGardenSceneProps = {
  parameters: ShowcaseNeonGardenSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const NEON_STRIPE_MATERIAL = /* wgsl */ `
fn neonStripeMaterial(input: MaterialInput) -> vec3<f32> {
  let lightDirection = normalize(camera.lightInfo.xyz);
  let diffuse = max(dot(input.normal, lightDirection), 0.0);
  let rim = pow(1.0 - clamp(dot(input.normal, -input.rayDirection), 0.0, 1.0), 2.5);
  let bands = 0.5 + 0.5 * sin((input.localPoint.y + input.localPoint.x * 0.35) * input.materialUniform.x);
  let accent = mix(vec3<f32>(0.05, 0.95, 0.78), vec3<f32>(1.0, 0.24, 0.62), bands);
  return input.color * (0.18 + diffuse * 0.74) + accent * rim * input.materialUniform.y;
}
`;

function NeonGardenContent({ parameters }: { parameters: ShowcaseNeonGardenSceneParameters }) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.speed);
  });

  return (
    <>
      <SdfBox
        position={[0, -1.42, 0]}
        size={[11, 0.12, 11]}
        color={[0.055, 0.06, 0.075]}
        material="pbr"
        materialUniform={[0.25, 0.72, 0.35, 0.2]}
      />
      <SdfModifier preset="preRepeat" data0={[parameters.repeatCell, 100, parameters.repeatCell, 0]}>
        <SdfModifier
          preset="twistY"
          postModifierFunction={/* wgsl */ `
            let glowBand = 0.5 + 0.5 * sin(point.y * 8.0 + point.x * 2.0);
            let painted = mix(hit.color, vec3<f32>(0.0, 0.92, 0.95), glowBand * data0.y);
            let radial = length(point.xz);
            let stretch = sqrt(1.0 + data0.x * data0.x * radial * radial);
            return SceneHit(hit.distance / max(stretch, 1.0) - data0.y * 0.2, painted, hit.smoothness, hit.localPoint);
          `}
          data0={[parameters.twist, parameters.bloom, 0, 0]}
          bounds={{ radius: 8 }}
        >
          <SdfGroup
            op="or"
            smoothness={0.18}
            rotation={axisAngleToQuaternion([0, 1, 0], phase * Math.PI)}
            material={{ key: "neon-stripe", wgsl: NEON_STRIPE_MATERIAL }}
            materialUniform={[14, 1.45, 0, 0]}
          >
            <SdfCylinder position={[0, -0.42, 0]} radius={0.12} height={1.55} color={[0.04, 0.68, 0.78]} />
            <SdfEllipsoid position={[0, 0.38, 0]} radii={[0.42, 0.7, 0.42]} color={[0.82, 0.18, 0.48]} />
            <SdfSphere position={[0.54, 0.4, 0]} radius={0.23} color={[1.0, 0.78, 0.18]} />
            <SdfTorus
              position={[0, 0.18, 0]}
              rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5)}
              majorRadius={0.55}
              minorRadius={0.045}
              color={[0.1, 0.95, 0.8]}
            />
          </SdfGroup>
        </SdfModifier>
      </SdfModifier>
    </>
  );
}

export function Scene({ parameters, canvasProps }: ShowcaseNeonGardenSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [4.4, 3.1, 5.6], target: [0, -0.05, 0], fov: 48 }}
      lighting={{
        direction: [0.3, 0.78, 0.46],
        color: [0.85, 0.95, 1],
        intensity: 1.15,
      }}
      background={{ yPositive: [0.015, 0.022, 0.04], yNegative: [0.08, 0.09, 0.11] }}
      orbitControls
    >
      <NeonGardenContent parameters={parameters} />
    </NexusCanvas>
  );
}
