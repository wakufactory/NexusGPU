import { useState } from "react";
import { NexusCanvas, NexusTextureSource, SdfFunction, SdfGroup, SdfSphere, useFrame } from "../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";

type TexTestSceneProps = {
  parameters: TexTestSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

type TexTestSceneContentProps = {
  parameters: TexTestSceneParameters;
};
export type TexTestSceneParameters = typeof initialParameters;

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    smooth: 0.42,
    experimentSpeed: 1,
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
      max: 4,
      step: 0.1,
    },
  ],
);

const textures:NexusTextureSource[] = [
  { src: `${import.meta.env.BASE_URL}assets/tex1024.png`, magFilter: "linear", addressModeU: "repeat", addressModeV: "repeat"  },
]

const MATERIAL_SHADER = /* wgsl */ `
fn shadeMaterial(hit: RaymarchHit, rayOrigin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  const PI: f32 = 3.14159265359; 
  let point = rayOrigin + direction * hit.distance;
  let normal = estimateNormal(point);
  let lightDirection = normalize(camera.lightInfo.xyz);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let p = normalize(hit.localPoint) ;
  let uv = vec2(
    -atan2(p.z, p.x) * 0.15915494309 + 0.5,
    acos(clamp(p.y, -1.0, 1.0)) * 0.31830988618
  );
  let color1 = textureSampleLevel(texture0, sampler0, uv,0.0).rgb;
  return (color1*hit.color) * (0.35 + diffuse * 0.85) ;
}
`;

function TexTestSceneContent({ parameters }: TexTestSceneContentProps) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.experimentSpeed);
  });

  return (
    <SdfGroup op="or" smoothness={parameters.smooth}>
    <SdfSphere position={[-0.5, 0, 0]} radius={0.5} color={[0.95, 0.55, 0.2]} smoothness={1.}/>
    <SdfSphere position={[0.5, 0, 0]} radius={0.5} color={[0.95, 0.55, 0.98]} smoothness={1.}/>
    </SdfGroup>
  );
}

export function Scene({ parameters, canvasProps }: TexTestSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 2.2, 4.4], target: [0, 0, 0], fov: 46 }}
      lighting={{ direction: [0.18, 0.9, 0.32] }}
      orbitControls
      materialShader={MATERIAL_SHADER}
      textures={textures}
    >
      <TexTestSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
