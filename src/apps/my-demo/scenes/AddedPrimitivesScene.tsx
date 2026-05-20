import {
  NexusCanvas,
  SdfCapsule,
  SdfCone,
  SdfDodecahedron,
  SdfIcosahedron,
  SdfOctahedron,
  SdfTetrahedron,
} from "../../../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const { initialParameters, parameterControls } = defineSceneParameterControls({}, []);

type AddedPrimitivesSceneProps = {
  canvasProps: NexusSceneCanvasProps;
};

const MATERIAL_UNIFORM = [0.12, 0.62, 0.38, 0.18] as const;

export function Scene({ canvasProps }: AddedPrimitivesSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 2.2, 7.2], target: [0, 0.1, 0], fov: 42 }}
      lighting={{
        type: "directional",
        direction: [0.45, 0.75, 0.35],
        color: [1, 0.96, 0.9],
        intensity: 1.35,
      }}
      background={{
        yPositive: [0.035, 0.045, 0.08],
        yNegative: [0.42, 0.5, 0.52],
      }}
      orbitControls
    >
      <SdfCone
        position={[-2.7, 0, -1.15]}
        topRadius={0.08}
        bottomRadius={0.58}
        height={1.35}
        color={[0.95, 0.43, 0.22]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
      <SdfCapsule
        position={[-0.9, 0, -1.15]}
        bottom={[-0.15, -0.55, 0]}
        top={[0.25, 0.65, 0]}
        radius={0.26}
        round={0.5}
        color={[0.16, 0.72, 0.78]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
      <SdfCapsule
        position={[0.9, 0, -1.15]}
        bottom={[0, -0.65, 0]}
        top={[0, 0.65, 0]}
        radius={0.32}
        round={1}
        color={[0.42, 0.58, 0.96]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
      <SdfTetrahedron
        position={[2.7, 0, -1.15]}
        radius={0.78}
        rotation={[0.18, 0.33, 0.08, 0.92]}
        color={[0.93, 0.78, 0.22]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
      <SdfOctahedron
        position={[-1.8, 0, 1.05]}
        radius={0.88}
        rotation={[0.18, 0.08, 0.28, 0.94]}
        color={[0.9, 0.28, 0.48]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
      <SdfDodecahedron
        position={[0, 0, 1.05]}
        radius={0.9}
        rotation={[0.12, 0.36, 0.16, 0.91]}
        color={[0.56, 0.86, 0.32]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
      <SdfIcosahedron
        position={[1.8, 0, 1.05]}
        radius={0.9}
        rotation={[0.28, 0.15, 0.21, 0.92]}
        color={[0.72, 0.48, 0.96]}
        material="pbr"
        materialUniform={MATERIAL_UNIFORM}
      />
    </NexusCanvas>
  );
}
