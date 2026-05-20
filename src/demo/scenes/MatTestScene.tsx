import { NexusCanvas, NexusTextureSource, SdfGroup, SdfSphere, useFrame } from "../../nexusgpu";
import { useState } from "react";
import { defineSceneParameterControls } from "./types";
import {axisAngleToQuaternion } from "../../nexusgpu/math";
import type { NexusSceneCanvasProps } from "./types";

type MatTestSceneProps = {
  parameters: MatTestSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

type MatTestSceneContentProps = {
  parameters: MatTestSceneParameters;
};
export type MatTestSceneParameters = typeof initialParameters;

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    smooth: 0.42,
    experimentSpeed: 0.1,
  },
  [
    {
      key: "smooth",
      name: "smoothness",
      min: 0,
      max: 1.,
      step: 0.02,
    },
    {
      key: "experimentSpeed",
      name: "speed",
      min: 0,
      max: 2,
      step: 0.05,
    },
  ],
);

const textures:NexusTextureSource[] = [
  { src: `${import.meta.env.BASE_URL}assets/mat0.png`, magFilter: "linear", addressModeU: "repeat", addressModeV: "repeat"  },
]

const GROUP_MATERIAL = /* wgsl */ `
fn texTestGroupMaterial(input: MaterialInput) -> vec3<f32> {
  let lightDirection = normalize(camera.lightInfo.xyz);
  let diffuse = max(dot(input.normal, lightDirection), 0.0);
  let p = normalize(input.localPoint);
  let uv = vec2(
    -atan2(p.z, p.x) * 0.15915494309 + 0.5,
    acos(clamp(p.y, -1.0, 1.0)) * 0.31830988618
  );
  let color1 = textureSampleLevel(texture0, sampler0, uv, 0.0).rgb;
  return (color1 * input.color) * (0.35 + diffuse * 0.85);
}
`;

function MatTestSceneContent({ parameters }: MatTestSceneContentProps) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.experimentSpeed);
  });

  return (
    <SdfGroup op="or" rotation={axisAngleToQuaternion([0, 1,0], phase*parameters.experimentSpeed * Math.PI)}
      smoothness={parameters.smooth} material={"pbr"} materialUniform={[0.1,0.5,0.0,0.2]} >
    <SdfSphere position={[-0.5, 0, 0]} radius={0.5} color={[0.95, 0.55, 0.2]} smoothness={1.}/>
    <SdfSphere position={[0.5, 0, 0]} radius={0.5} color={[0.95, 0.55, 0.98]} smoothness={1.}/>
    </SdfGroup>
  );
}

export function Scene({ parameters, canvasProps }: MatTestSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 2.2, 4.4], target: [0, 0, 0], fov: 46 }}
      lighting={{ direction: [0.18, 0.9, 0.32] }}
      orbitControls
      textures={textures}
    >
      <MatTestSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
