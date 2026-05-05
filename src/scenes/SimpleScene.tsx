import {
  NexusCanvas,
  SdfBox,
  SdfCylinder,
  SdfEllipsoid,
  SdfFunction,
  SdfGroup,
  SdfSphere,
  SdfTorus,
} from "../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const { initialParameters, parameterControls } = defineSceneParameterControls({}, []);

type SimpleSceneProps = {
  canvasProps: NexusSceneCanvasProps;
};

export function Scene({ canvasProps }: SimpleSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 1.4, 5], target: [0, 0, 0], fov: 48 }}
        background={{
            yPositive: [0.02, 0.025, 0.528],
            yNegative: [0.32, 0.86, 0.57],
        }}
      orbitControls
    >
      <SdfGroup op="or" smoothness={0.2}>
        <SdfSphere position={[-0.9, 0, 0]} radius={0.7} color={[0.05, 0.74, 0.7]} />
        <SdfBox position={[0.9, 0, 0]} size={[1.1, 1.1, 1.1]} color={[0.95, 0.55, 0.18]} />
        <SdfCylinder position={[0, 0, -0.9]} radius={0.35} height={1.4} color={[0.25, 0.55, 0.95]} />
        <SdfTorus position={[0, 0, 0.9]} rotation={[1,0,0,Math.cos(Math.PI)]} majorRadius={0.55} minorRadius={0.14} color={[0.9, 0.18, 0.38]} />
        <SdfEllipsoid position={[0, 0.55, 0]} radii={[0.7, 0.35, 0.45]} color={[0.7, 0.45, 0.95]} />
      </SdfGroup>
      <SdfFunction
        position={[0, -0.95, 0]}
        sdfFunction="return length(point.xz) - data0.x;"
        data0={[0.5, 0, 0, 0]}
        color={[0.7, 0.45, 0.95]}
      />
    </NexusCanvas>
  );
}
