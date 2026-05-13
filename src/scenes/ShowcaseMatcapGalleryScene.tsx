import { useState } from "react";
import {
  NexusCanvas,
  NexusTextureSource,
  SdfBox,
  SdfEllipsoid,
  SdfFunction,
  SdfGroup,
  SdfSphere,
  SdfTorus,
  useCamera,
  useFrame,
  useLighting,
} from "../nexusgpu";
import { axisAngleToQuaternion } from "../nexusgpu/math";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 155,
  maxDistance: 42,
  shadows: true,
  normalEpsilon: 0.001,
  surfaceEpsilon: 0.002,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    cameraSpeed: 0.18,
    plinthSpread: 1.35,
    matcapScale: 1.0,
  },
  [
    { key: "cameraSpeed", name: "Camera speed", min: 0, max: 0.7, step: 0.01 },
    { key: "plinthSpread", name: "Spread", min: 0.8, max: 2.0, step: 0.02 },
    { key: "matcapScale", name: "Matcap tint", min: 0.35, max: 1.4, step: 0.01 },
  ],
);

export type ShowcaseMatcapGallerySceneParameters = typeof initialParameters;

type ShowcaseMatcapGallerySceneProps = {
  parameters: ShowcaseMatcapGallerySceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const textures: NexusTextureSource[] = [
  {
    src: `${import.meta.env.BASE_URL}assets/mat0.png`,
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  },
];

const GEM_SDF = /* wgsl */ `
let q = abs(point);
let oct = (q.x + q.y * 1.25 + q.z) * 0.58 - data0.x;
let core = length(point / vec3<f32>(0.72, 1.0, 0.72)) - 1.0;
let distance = max(oct, core);
let facet = 0.5 + 0.5 * sin((q.x + q.z + point.y) * data0.y);
let painted = mix(color, vec3<f32>(0.16, 0.9, 1.0), facet * 0.45);
return SceneHit(distance, painted, smoothness, point);
`;

function GalleryMotion({ parameters }: { parameters: ShowcaseMatcapGallerySceneParameters }) {
  const camera = useCamera();
  const lighting = useLighting();

  useFrame(({ elapsed }) => {
    const angle = elapsed * parameters.cameraSpeed;
    camera.set({
      position: [Math.sin(angle) * 4.8, 2.15 + Math.sin(angle * 1.7) * 0.18, Math.cos(angle) * 4.8],
      target: [0, 0.24, 0],
      fov: 43,
    });
    lighting.set({
      direction: [Math.sin(angle + 0.8) * 0.42, 0.84, Math.cos(angle + 0.8) * 0.42],
      color: [1.0, 0.96, 0.88],
      intensity: 1.22,
    });
  });

  return null;
}

function MatcapGalleryContent({ parameters }: { parameters: ShowcaseMatcapGallerySceneParameters }) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed);
  });

  const spread = parameters.plinthSpread;

  return (
    <>
      <GalleryMotion parameters={parameters} />
      <SdfBox
        position={[0, -1.05, 0]}
        size={[7.0, 0.18, 4.8]}
        color={[0.07, 0.07, 0.075]}
        material="pbr"
        materialUniform={[0.1, 0.5, 0.4, 0.22]}
      />
      <SdfGroup op="or" smoothness={0.04} material="texture0Matcap" materialUniform={[parameters.matcapScale, 0, 0, 0]}>
        <SdfSphere position={[-spread * 1.55, -0.55, 0]} radius={0.58} color={[0.75, 0.92, 1.0]} />
        <SdfEllipsoid
          position={[-spread * 0.5, -0.45, 0]}
          rotation={axisAngleToQuaternion([0, 1, 0], phase * 0.25)}
          radii={[0.48, 0.82, 0.48]}
          color={[1.0, 0.66, 0.36]}
        />
        <SdfFunction
          position={[spread * 0.55, -0.38, 0]}
          rotation={axisAngleToQuaternion([0, 1, 0], phase * 0.38)}
          sdfFunction={GEM_SDF}
          data0={[0.82, 12.0, 0, 0]}
          color={[0.74, 0.46, 1.0]}
          bounds={{ radius: 1.2 }}
        />
        <SdfTorus
          position={[spread * 1.58, -0.42, 0]}
          rotation={axisAngleToQuaternion([1, 0, 0], Math.PI * 0.5 + phase * 0.18)}
          majorRadius={0.56}
          minorRadius={0.16}
          color={[0.42, 1.0, 0.72]}
        />
      </SdfGroup>
      {[-spread * 1.55, -spread * 0.5, spread * 0.55, spread * 1.58].map((x) => (
        <SdfBox
          key={x}
          position={[x, -0.95, 0]}
          size={[0.92, 0.22, 0.92]}
          color={[0.13, 0.12, 0.12]}
          material="pbr"
          materialUniform={[0.22, 0.36, 0.55, 0.18]}
        />
      ))}
    </>
  );
}

export function Scene({ parameters, canvasProps }: ShowcaseMatcapGallerySceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 2.2, 4.8], target: [0, 0.2, 0], fov: 43 }}
      lighting={{ direction: [0.2, 0.85, 0.35], color: [1, 0.96, 0.9], intensity: 1.2 }}
      background={{ yPositive: [0.018, 0.02, 0.026], yNegative: [0.11, 0.1, 0.09] }}
      textures={textures}
      orbitControls={false}
    >
      <MatcapGalleryContent parameters={parameters} />
    </NexusCanvas>
  );
}
