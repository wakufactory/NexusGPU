import { useMemo, useRef, useState } from "react";
import { NexusCanvas, SdfCylinder, SdfGroup, SdfSphere, useFrame } from "../nexusgpu";
import type { Vec3 } from "../nexusgpu";
import { defineSceneParameters, defineSceneSliderParameters } from "./types";
import type { NexusSceneCanvasProps } from "./types";

type Boid = {
  position: Vec3;
  velocity: Vec3;
  color: Vec3;
  seed: number;
};

type SphereRenderProps = {
  position: Vec3;
  color: Vec3;
};

const BOID_COLORS: readonly Vec3[] = [
  [0.95, 0.22, 0.22],
  [0.98, 0.56, 0.18],
  [0.96, 0.82, 0.24],
  [0.36, 0.82, 0.32],
  [0.12, 0.76, 0.68],
  [0.16, 0.55, 0.95],
  [0.35, 0.36, 0.96],
  [0.68, 0.34, 0.94],
  [0.95, 0.3, 0.7],
  [0.82, 0.86, 0.92],
];

const BOID_COUNT = 10;
const BOUNDS_RADIUS = 2.9;
const SPHERE_RADIUS = 0.28;
const PERCEPTION_RADIUS = 1.15;
const SEPARATION_RADIUS = 0.48;

export const initialParameters = defineSceneParameters({
  speed: 1.45,
  flocking: 0.58,
  orbitRadius: 1.85,
  orbitStrength: 1.15,
  wanderStrength: 1.25,
  sphereSmoothness: 0.38,
});

export type BoidsSpheresSceneParameters = typeof initialParameters;

export const parameterControls = defineSceneSliderParameters(initialParameters, [
  {
    key: "speed",
    name: "Speed",
    min: 0.2,
    max: 2.6,
    step: 0.05,
    precision: 2,
  },
  {
    key: "flocking",
    name: "Flocking",
    min: 0,
    max: 1.6,
    step: 0.05,
    precision: 2,
  },
  {
    key: "orbitRadius",
    name: "Orbit radius",
    min: 0.8,
    max: 2.6,
    step: 0.05,
    precision: 2,
  },
  {
    key: "orbitStrength",
    name: "Orbit strength",
    min: 0,
    max: 2.4,
    step: 0.05,
    precision: 2,
  },
  {
    key: "wanderStrength",
    name: "Wander",
    min: 0,
    max: 3,
    step: 0.05,
    precision: 2,
  },
  {
    key: "sphereSmoothness",
    name: "Sphere smoothness",
    min: 0,
    max: 1,
    step: 0.02,
    precision: 2,
  },
]);

function createInitialBoids(): Boid[] {
  return Array.from({ length: BOID_COUNT }, (_, index) => {
    const angle = (index / BOID_COUNT) * Math.PI * 2;
    const vertical = ((index % 5) - 2) * 0.25;
    const radius = 1.35 + (index % 3) * 0.24;
    const tangent: Vec3 = [-Math.sin(angle), 0, Math.cos(angle)];

    return {
      position: [Math.cos(angle) * radius, vertical, Math.sin(angle) * radius],
      velocity: [tangent[0] * 1.05, Math.sin(index * 1.7) * 0.22, tangent[2] * 1.05],
      color: BOID_COLORS[index],
      seed: index * 11.73 + 3.19,
    };
  });
}

function stepBoids(
  boids: readonly Boid[],
  delta: number,
  elapsed: number,
  parameters: BoidsSpheresSceneParameters,
): Boid[] {
  const boundedDelta = Math.min(delta, 1 / 30);
  const targetSpeed = parameters.speed;
  const flocking = parameters.flocking;

  return boids.map((boid, index) => {
    let nearbyCount = 0;
    let center: Vec3 = [0, 0, 0];
    let averageVelocity: Vec3 = [0, 0, 0];
    let separation: Vec3 = [0, 0, 0];

    for (let otherIndex = 0; otherIndex < boids.length; otherIndex += 1) {
      if (otherIndex === index) {
        continue;
      }

      const other = boids[otherIndex];
      const offset = subtractVec3(other.position, boid.position);
      const distance = Math.max(lengthVec3(offset), 0.001);

      if (distance < PERCEPTION_RADIUS) {
        nearbyCount += 1;
        center = addVec3(center, other.position);
        averageVelocity = addVec3(averageVelocity, other.velocity);
      }

      if (distance < SEPARATION_RADIUS) {
        separation = addVec3(separation, scaleVec3(offset, -1 / distance));
      }
    }

    const horizontalPosition: Vec3 = [boid.position[0], 0, boid.position[2]];
    const horizontalDistance = Math.max(lengthVec3(horizontalPosition), 0.001);
    const radialDirection = scaleVec3(horizontalPosition, 1 / horizontalDistance);
    const tangentDirection: Vec3 = [-radialDirection[2], 0, radialDirection[0]];
    const orbitSteering = scaleVec3(tangentDirection, parameters.orbitStrength);
    const radiusSteering = scaleVec3(
      radialDirection,
      (parameters.orbitRadius - horizontalDistance) * (1.05 + parameters.orbitStrength * 0.22),
    );
    const wanderSteering = getWanderSteering(boid.seed, elapsed, parameters.wanderStrength);

    let steering: Vec3 = addVec3(orbitSteering, radiusSteering);
    steering = addVec3(steering, wanderSteering);
    steering = addVec3(steering, [0, -boid.position[1] * 0.24, 0]);

    if (nearbyCount > 0) {
      center = scaleVec3(center, 1 / nearbyCount);
      averageVelocity = scaleVec3(averageVelocity, 1 / nearbyCount);
      steering = addVec3(steering, scaleVec3(subtractVec3(center, boid.position), 0.34 * flocking));
      steering = addVec3(steering, scaleVec3(subtractVec3(averageVelocity, boid.velocity), 0.58 * flocking));
    }

    steering = addVec3(steering, scaleVec3(separation, 1.75 + flocking * 0.45));

    const distanceFromCenter = lengthVec3(boid.position);
    if (distanceFromCenter > BOUNDS_RADIUS * 0.86) {
      const homeForce = (distanceFromCenter - BOUNDS_RADIUS * 0.86) / BOUNDS_RADIUS;
      steering = addVec3(steering, scaleVec3(normalizeVec3(boid.position), -3.6 * homeForce));
    }

    const velocity = limitVec3(addVec3(boid.velocity, scaleVec3(steering, boundedDelta)), targetSpeed);
    const position = addVec3(boid.position, scaleVec3(velocity, boundedDelta));

    return {
      ...boid,
      position,
      velocity,
    };
  });
}

function BoidsSpheresSceneContent({ parameters }: { parameters: BoidsSpheresSceneParameters }) {
  const initialBoids = useMemo(createInitialBoids, []);
  const boidsRef = useRef<readonly Boid[]>(initialBoids);
  const [spheres, setSpheres] = useState<readonly SphereRenderProps[]>(() => toSphereProps(initialBoids));

  useFrame(({ delta, elapsed }) => {
    const nextBoids = stepBoids(boidsRef.current, delta, elapsed, parameters);
    boidsRef.current = nextBoids;
    setSpheres(toSphereProps(nextBoids));
  });

  return (
    <SdfGroup op="or" smoothness={parameters.sphereSmoothness}>
      {spheres.map((sphere, index) => (
        <SdfSphere
          key={index}
          position={sphere.position}
          radius={SPHERE_RADIUS}
          color={sphere.color}
          smoothness={parameters.sphereSmoothness}
        />
      ))}
    </SdfGroup>
  );
}

export function Scene({
  parameters,
  canvasProps,
}: {
  parameters: BoidsSpheresSceneParameters;
  canvasProps: NexusSceneCanvasProps;
}) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 2.7, 5.2], target: [0, 0, 0], fov: 48 }}
      lighting={{ direction: [0.3, 0.86, 0.32] }}
      orbitControls
    >
    <SdfGroup op="or" smoothness={0.2} >
      <BoidsSpheresSceneContent parameters={parameters} />
      <SdfCylinder position={[0, 0, 0]} radius={0.3} height={5.} color={[0.18, 0.62, 0.95]} />
    </SdfGroup>
    </NexusCanvas>
  );
}

function toSphereProps(boids: readonly Boid[]): SphereRenderProps[] {
  return boids.map((boid) => ({
    position: boid.position,
    color: boid.color,
  }));
}

function getWanderSteering(seed: number, elapsed: number, strength: number): Vec3 {
  const slow = elapsed * (1.35 + (seed % 0.7));
  const fast = elapsed * (2.1 + (seed % 1.1));

  return scaleVec3(
    [
      Math.sin(slow + seed) + Math.sin(fast * 0.73 + seed * 0.37) * 0.55,
      Math.sin(slow * 1.21 + seed * 1.9) * 0.46,
      Math.cos(slow * 0.91 + seed * 0.63) + Math.sin(fast + seed * 0.21) * 0.5,
    ],
    strength,
  );
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec3(value: Vec3, scale: number): Vec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function lengthVec3(value: Vec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = lengthVec3(value);
  return length <= 0.0001 ? [0, 0, 0] : scaleVec3(value, 1 / length);
}

function limitVec3(value: Vec3, maxLength: number): Vec3 {
  const length = lengthVec3(value);
  return length <= maxLength ? value : scaleVec3(value, maxLength / length);
}
