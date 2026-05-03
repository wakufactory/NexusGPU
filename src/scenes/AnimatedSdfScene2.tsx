import { useState } from "react";
import { SdfBox, SdfFunction, SdfGroup, SdfSphere, useFrame } from "../nexusgpu";
import type { NexusCamera, NexusLighting, SdfSphereProps, Vec3 } from "../nexusgpu";

export const SCENE_CAMERA: Required<NexusCamera> = {
  position: [0, 3.7, 5.2],
  target: [0, 0, 0],
  fov: 48,
};

export const SCENE_LIGHTING: Required<NexusLighting> = {
  direction: [0.25, 0.85, 0.35],
};

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
    radius: 0.52,
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
    period: 6.9,
    phase: Math.PI * 0.7,
    radius: 0.58,
    color: [0.92, 0.72, 0.18],
  },
  {
    center: [0.1, 0.85, -0.75],
    basisA: [0.78, 0.36, 0.51],
    basisB: [-0.28, 0.93, -0.24],
    distance: 0.45,
    period: 8.4,
    phase: Math.PI * 1.1,
    radius: 0.59,
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

type SphereRenderProps = Pick<Required<SdfSphereProps>, "position" | "radius" | "color" | "smoothness">;

export type AnimatedSdfSceneParameters = {
  sphereSmoothness: number;
};

export const INITIAL_SCENE_PARAMETERS: AnimatedSdfSceneParameters = {
  sphereSmoothness: 0.7,
};

function getSphereProps(
  sphere: OrbitingSphereConfig,
  elapsed: number,
  parameters: AnimatedSdfSceneParameters,
): SphereRenderProps {
  return {
    position: getOrbitPosition(sphere, elapsed),
    radius: sphere.radius,
    color: sphere.color,
    smoothness: parameters.sphereSmoothness,
  };
}

function getSpherePropsList(elapsed: number, parameters: AnimatedSdfSceneParameters): readonly SphereRenderProps[] {
  return ORBITING_SPHERES.map((sphere) => getSphereProps(sphere, elapsed, parameters));
}

type AnimatedSdfSceneProps = {
  parameters: AnimatedSdfSceneParameters;
};

/** 薄い床の上で、4つの球が別々の軸と周期で周回するデモシーン。 */
export function AnimatedSdfScene({ parameters }: AnimatedSdfSceneProps) {
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
      <SdfGroup op="and" smoothness={parameters.sphereSmoothness}>
      <SdfGroup op="or" smoothness={parameters.sphereSmoothness}>
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
      <SdfGroup op="not" >
        <SdfFunction
          sdfFunction="let k0 = length(point / data0.xyz); let k1 = length(point / (data0.xyz * data0.xyz)); return k0 * (k0 - 1.0) / k1;"
          data0={[1.7, 0.9, 0.4, 0.3]}
          position={[0, 1, 0]}
          color={[0.8, 0.8, 0.8]}
          smoothness={0.1}
          bounds={{ radius: 0.8 }}
        />
        </SdfGroup>
      </SdfGroup>
    </>
  );
}
