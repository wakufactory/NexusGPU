import {
  NexusCanvas,
  SdfBox,
  SdfCylinder,
  SdfEllipsoid,
  SdfGroup,
  SdfSphere,
  SdfSubtract,
  SdfTorus,
} from "../../../nexusgpu";
import { axisAngleToQuaternion } from "../../../nexusgpu/math";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 170,
  maxDistance: 38,
  shadows: true,
  normalEpsilon: 0.0009,
  surfaceEpsilon: 0.0018,
  hitInteriorSurfaces: true,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    cutRadius: 0.72,
    metalness: 0.55,
    roughness: 0.28,
    smooth: 0.09,
  },
  [
    { key: "cutRadius", name: "Cut radius", min: 0.35, max: 1.05, step: 0.01 },
    { key: "metalness", name: "Metalness", min: 0, max: 1, step: 0.02 },
    { key: "roughness", name: "Roughness", min: 0.08, max: 0.9, step: 0.02 },
    { key: "smooth", name: "Join smooth", min: 0, max: 0.4, step: 0.01 },
  ],
);

export type ShowcaseCrystalReliquarySceneParameters = typeof initialParameters;

type ShowcaseCrystalReliquarySceneProps = {
  parameters: ShowcaseCrystalReliquarySceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

function CrystalReliquaryContent({ parameters }: { parameters: ShowcaseCrystalReliquarySceneParameters }) {
  const pbrUniform = [parameters.metalness, parameters.roughness, 0.82, 0.2] as const;

  return (
    <>
      <SdfBox
        position={[0, -1.24, 0]}
        size={[7.4, 0.16, 5.8]}
        color={[0.08, 0.075, 0.068]}
        material="pbr"
        materialUniform={[0.05, 0.64, 0.25, 0.24]}
      />
      <SdfGroup op="or" smoothness={parameters.smooth} material="pbr" materialUniform={pbrUniform}>
        <SdfSubtract>
          <SdfBox position={[0, 0.08, 0]} size={[1.8, 2.45, 1.8]} color={[0.78, 0.9, 0.96]} />
          <SdfSphere position={[0, 0.28, 0]} radius={parameters.cutRadius} />
          <SdfCylinder
            position={[0, 0.08, 0]}
            rotation={axisAngleToQuaternion([0, 0, 1], Math.PI * 0.5)}
            radius={0.38}
            height={2.3}
          />
          <SdfCylinder
            position={[0, 0.08, 0]}
            rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5)}
            radius={0.38}
            height={2.3}
          />
        </SdfSubtract>
        <SdfTorus
          position={[0, 0.18, 0]}
          rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5)}
          majorRadius={1.22}
          minorRadius={0.08}
          color={[0.98, 0.64, 0.18]}
        />
        <SdfTorus position={[0, 0.18, 0]} majorRadius={1.22} minorRadius={0.08} color={[0.98, 0.64, 0.18]} />
        <SdfEllipsoid position={[0, 1.64, 0]} radii={[0.46, 0.72, 0.46]} color={[0.34, 0.92, 0.98]} />
        <SdfSphere position={[0, -1.0, 0]} radius={0.34} color={[0.9, 0.16, 0.4]} />
      </SdfGroup>
      <SdfGroup op="or" smoothness={0.08} material="pbr" materialUniform={[0.8, 0.22, 0.9, 0.18]}>
        <SdfCylinder position={[-1.7, -0.52, -1.55]} radius={0.18} height={1.25} color={[0.86, 0.7, 0.42]} />
        <SdfCylinder position={[1.7, -0.52, -1.55]} radius={0.18} height={1.25} color={[0.86, 0.7, 0.42]} />
        <SdfCylinder position={[-1.7, -0.52, 1.55]} radius={0.18} height={1.25} color={[0.86, 0.7, 0.42]} />
        <SdfCylinder position={[1.7, -0.52, 1.55]} radius={0.18} height={1.25} color={[0.86, 0.7, 0.42]} />
      </SdfGroup>
    </>
  );
}

export function Scene({ parameters, canvasProps }: ShowcaseCrystalReliquarySceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [3.6, 2.35, 4.25], target: [0, 0.12, 0], fov: 43 }}
      lighting={{
        direction: [-0.26, 0.84, 0.48],
        color: [1, 0.92, 0.82],
        intensity: 1.28,
      }}
      background={{ yPositive: [0.028, 0.032, 0.04], yNegative: [0.16, 0.12, 0.095] }}
      orbitControls
    >
      <CrystalReliquaryContent parameters={parameters} />
    </NexusCanvas>
  );
}
