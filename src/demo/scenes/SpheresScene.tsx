import { useState } from "react";
import { NexusCanvas, SdfBox, SdfEllipsoid, SdfFunction, SdfGroup, SdfSphere, useFrame } from "../../nexusgpu";
import type { SdfSphereProps, Vec3,NexusTextureSource } from "../../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";

type OrbitingSphereConfig = {
  center: Vec3;
  basisA: Vec3;
  basisB: Vec3;
  distance: number;
  period: number;
  phase: number;
  radius: number;
  color: Vec3;
};

const ORBITING_SPHERES: readonly OrbitingSphereConfig[] = [
  {
    center: [-1.15, 0.5, -0.15],
    basisA: [1, 0, 0],
    basisB: [0, 0, 1],
    distance: 0.56,
    period: 4.2,
    phase: 0,
    radius: 0.6,
    color: [0.05, 0.74, 0.7],
  },
  {
    center: [0.95, 0.72, -0.2],
    basisA: [0, 1, 0],
    basisB: [0, 0, 1],
    distance: 0.42,
    period: 5.6,
    phase: Math.PI * 0.35,
    radius: 0.5,
    color: [0.9, 0.18, 0.38],
  },
  {
    center: [0.05, 0.78, 0.65],
    basisA: [1, 0, 0],
    basisB: [0, 1, 0],
    distance: 0.5,
    period: 4.9,
    phase: Math.PI * 0.7,
    radius: 0.48,
    color: [0.92, 0.72, 0.18],
  },
  {
    center: [0.1, 0.85, -0.75],
    basisA: [0.78, 0.36, 0.51],
    basisB: [-0.28, 0.93, -0.24],
    distance: 0.45,
    period: 8.4,
    phase: Math.PI * 1.1,
    radius: 0.39,
    color: [0.5, 0.05, 0.98],
  },
];

function getOrbitPosition({ center, basisA, basisB, distance, period, phase }: OrbitingSphereConfig, elapsed: number): Vec3 {
  const angle = (elapsed / period) * Math.PI * 2 + phase;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;

  return [
    center[0] + basisA[0] * x + basisB[0] * y,
    center[1] + basisA[1] * x + basisB[1] * y,
    center[2] + basisA[2] * x + basisB[2] * y,
  ];
}

function getSphereProps(
  sphere: OrbitingSphereConfig,
  elapsed: number,
  parameters: SpheresSceneParameters,
): SphereRenderProps {
  return {
    position: getOrbitPosition(sphere, elapsed),
    radius: sphere.radius,
    color: sphere.color,
    smoothness: parameters.sphereSmoothness,
  };
}

function getSpherePropsList(elapsed: number, parameters: SpheresSceneParameters): readonly SphereRenderProps[] {
  return ORBITING_SPHERES.map((sphere) => getSphereProps(sphere, elapsed, parameters));
}

// SpheresSceneのパラメータは、球のスムーズさだけにしてみる。
type SphereRenderProps = Pick<Required<SdfSphereProps>, "position" | "radius" | "color" | "smoothness">;

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  { sphereSmoothness: 0.7 },
  [
    {
      key: "sphereSmoothness",
      name: "Sphere smoothness",
      min: 0,
      max: 1.5,
      step: 0.05,
    },
  ],
);

export type SpheresSceneParameters = typeof initialParameters;
type SpheresSceneProps = {
  parameters: SpheresSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};
const textures:NexusTextureSource[] = [
  { src: `${import.meta.env.BASE_URL}assets/tex1024.png`, magFilter: "linear", addressModeU: "repeat", addressModeV: "repeat"  },
]

/** 薄い床の上で、4つの球が別々の軸と周期で周回するデモシーン。 */
function SpheresSceneContent({ parameters }: { parameters: SpheresSceneParameters }) {
  const [spherePropsList, setSpherePropsList] = useState<readonly SphereRenderProps[]>(() =>
    getSpherePropsList(0, parameters),
  );

  useFrame(({ elapsed }) => {
    setSpherePropsList(getSpherePropsList(elapsed, parameters));
  });

  return (
    <>
      <SdfBox
        position={[0, -0.06, 0]}
        size={[4.4, 0.12, 3.2]}
        color={[0.2, 0.23, 0.28]}
        smoothness={0.}
      />
      <SdfGroup op="subtract" smoothness={parameters.sphereSmoothness}>
        <SdfGroup op="or" smoothness={parameters.sphereSmoothness} material={"pbr"} materialUniform={[0.1,0.5,0.5,0.2]} >
          {spherePropsList.map((sphereProps, index) => (
            <SdfSphere
              key={index}
              position={sphereProps.position}
              radius={sphereProps.radius}
              color={sphereProps.color}
              smoothness={sphereProps.smoothness}
            />
          ))}
        </SdfGroup>
      </SdfGroup>
    </>
  );
}

export function Scene({ parameters, canvasProps }: SpheresSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 3.7, 5.2], target: [0, 0, 0], fov: 48 }}
      lighting={{ direction: [0.25, 0.85, 0.35],color:[1,1,1]}}
      orbitControls
      textures={textures}
    >
      <SpheresSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
