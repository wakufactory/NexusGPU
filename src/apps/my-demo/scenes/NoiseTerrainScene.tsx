import { NexusCanvas, SdfFunction } from "../../../nexusgpu";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 220,
  maxDistance: 110,
  shadows: true,
  normalEpsilon: 0.015,
  surfaceEpsilon: 0.004,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    halfSize: 20,
    heightScale: 3.4,
    baseFrequency: 0.11,
    roughness: 0.52,
    ridgeMix: 0.65,
    terraceStrength: 0.18,
    slopeGuard: 1.35,
    lightElevation: 52,
    lightAzimuth: 128,
    surface: 0,
  },
  [
    {
      key: "halfSize",
      name: "Terrain half size",
      min: 8,
      max: 36,
      step: 0.5,
      precision: 1,
    },
    {
      key: "heightScale",
      name: "Height scale",
      min: 0.2,
      max: 8,
      step: 0.05,
      precision: 2,
    },
    {
      key: "baseFrequency",
      name: "Base frequency",
      min: 0.02,
      max: 0.35,
      step: 0.005,
      precision: 3,
    },
    {
      key: "roughness",
      name: "Roughness",
      min: 0.2,
      max: 0.82,
      step: 0.01,
      precision: 2,
    },
    {
      key: "ridgeMix",
      name: "Ridge mix",
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
    },
    {
      key: "terraceStrength",
      name: "Terrace strength",
      min: 0,
      max: 0.75,
      step: 0.01,
      precision: 2,
    },
    {
      key: "slopeGuard",
      name: "Slope guard",
      min: 1,
      max: 20,
      step: 0.25,
      precision: 2,
    },
    {
      key: "lightElevation",
      name: "Light elevation",
      min: 0,
      max: 90,
      step: 1,
    },
    {
      key: "lightAzimuth",
      name: "Light azimuth",
      min: 0,
      max: 360,
      step: 1,
    },
    {
      key: "surface",
      name: "surface mode",
      min: 0,
      max: 1,
      step: 1,
    },
  ],
);

export type NoiseTerrainSceneParameters = typeof initialParameters;

type NoiseTerrainSceneProps = {
  parameters: NoiseTerrainSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const NOISE_TERRAIN_SDF = /* wgsl */ `
// data0:
//   x = terrain half size. XZ spans -halfSize .. +halfSize.
//   y = heightScale. Multiplies the generated normalized terrain height.
//   z = baseDepth. Adds thickness under the terrain surface.
//   w = slopeGuard. Lower bound for conservative height-field marching.
// data1:
//   x = baseFrequency. Low values make broad terrain; high values make small terrain features.
//   y = roughness. Per-octave amplitude retention for fBm.
//   z = ridgeMix. 0: normal fBm, 1: folded/ridged noise.
//   w = surface mode. 0: natural colors, 1: contour-tinted colors.
// data2:
//   x = terraceLevels. Number of quantization bands used when terracing.
//   y = terraceStrength. 0 disables terrace blending, 1 uses hard terraces.
//   z = seed. Offsets the noise domain.
let halfSize = data0.x;
let heightScale = data0.y;
let baseDepth = data0.z;
let slopeGuard = data0.w;
let baseFrequency = max(data1.x, 0.001);
let roughness = data1.y;
let ridgeMix = data1.z;
let surfaceMode = data1.w;
let terraceLevels = max(data2.x, 1.0);
let terraceStrength = data2.y;
let seed = data2.z;

let gradientStep = max(0.035, 0.08 / baseFrequency);
let xzCenter = point.xz;
let xzX = point.xz + vec2<f32>(gradientStep, 0.0);
let xzZ = point.xz + vec2<f32>(0.0, gradientStep);

var centerSum = 0.0;
var xSum = 0.0;
var zSum = 0.0;
var amplitude = 1.0;
var frequency = baseFrequency;
var amplitudeSum = 0.0;

for (var octave = 0; octave < 6; octave = octave + 1) {
  let octaveIndex = f32(octave);
  let offset = vec2<f32>(37.17, -19.41) * (octaveIndex + seed);
  let noiseZ = seed * 9.37 + octaveIndex * 13.19;

  let nCenter = simplexNoise3d(vec3<f32>(xzCenter * frequency + offset, noiseZ));
  let nX = simplexNoise3d(vec3<f32>(xzX * frequency + offset, noiseZ));
  let nZ = simplexNoise3d(vec3<f32>(xzZ * frequency + offset, noiseZ));

  let ridgeCenter = 1.0 - abs(nCenter);
  let ridgeX = 1.0 - abs(nX);
  let ridgeZ = 1.0 - abs(nZ);

  centerSum += mix(nCenter, ridgeCenter * 2.0 - 1.0, ridgeMix) * amplitude;
  xSum += mix(nX, ridgeX * 2.0 - 1.0, ridgeMix) * amplitude;
  zSum += mix(nZ, ridgeZ * 2.0 - 1.0, ridgeMix) * amplitude;

  amplitudeSum += amplitude;
  amplitude *= roughness;
  frequency *= 2.03;
}

let normalizedCenter = clamp(centerSum / amplitudeSum * 0.5 + 0.5, 0.0, 1.0);
let normalizedX = clamp(xSum / amplitudeSum * 0.5 + 0.5, 0.0, 1.0);
let normalizedZ = clamp(zSum / amplitudeSum * 0.5 + 0.5, 0.0, 1.0);

// Radial falloff keeps the finite height field from ending with a vertical mountain wall.
let radialCenter = pow(clamp(1.0 - length(xzCenter) / (halfSize * 1.16), 0.0, 1.0), 0.82);
let radialX = pow(clamp(1.0 - length(xzX) / (halfSize * 1.16), 0.0, 1.0), 0.82);
let radialZ = pow(clamp(1.0 - length(xzZ) / (halfSize * 1.16), 0.0, 1.0), 0.82);

let shapedCenter = smoothstep(0.18, 0.92, normalizedCenter) * radialCenter;
let shapedX = smoothstep(0.18, 0.92, normalizedX) * radialX;
let shapedZ = smoothstep(0.18, 0.92, normalizedZ) * radialZ;

let terracedCenter = floor(shapedCenter * terraceLevels) / terraceLevels;
let terracedX = floor(shapedX * terraceLevels) / terraceLevels;
let terracedZ = floor(shapedZ * terraceLevels) / terraceLevels;

let terrainCenter = mix(shapedCenter, terracedCenter, terraceStrength);
let terrainX = mix(shapedX, terracedX, terraceStrength);
let terrainZ = mix(shapedZ, terracedZ, terraceStrength);

let height = terrainCenter * heightScale;
let heightX = terrainX * heightScale;
let heightZ = terrainZ * heightScale;
let heightGradient = vec2<f32>((heightX - height) / gradientStep, (heightZ - height) / gradientStep);

let localSlopeGuard = max(slopeGuard, sqrt(1.0 + dot(heightGradient, heightGradient)));
let topDistance = (point.y - height) / localSlopeGuard;
let bottomDistance = -point.y - baseDepth;
let edgeDistance = max(abs(point.x) - halfSize, abs(point.z) - halfSize);
let distance = max(max(topDistance, bottomDistance), edgeDistance);

var grad = vec3<f32>(-heightGradient.x / localSlopeGuard, 1.0 / localSlopeGuard, -heightGradient.y / localSlopeGuard);
if (bottomDistance > topDistance && bottomDistance > edgeDistance) {
  grad = vec3<f32>(0.0, -1.0, 0.0);
} else if (edgeDistance > topDistance && edgeDistance > bottomDistance) {
  if (abs(point.x) > abs(point.z)) {
    grad = vec3<f32>(select(-1.0, 1.0, point.x >= 0.0), 0.0, 0.0);
  } else {
    grad = vec3<f32>(0.0, 0.0, select(-1.0, 1.0, point.z >= 0.0));
  }
}

let valleyColor = vec3<f32>(0.10, 0.28, 0.22);
let grassColor = vec3<f32>(0.34, 0.50, 0.22);
let rockColor = vec3<f32>(0.54, 0.48, 0.39);
let peakColor = vec3<f32>(0.88, 0.84, 0.74);
let snowColor = vec3<f32>(0.95, 0.96, 0.92);
let slopeAmount = clamp(length(heightGradient) * 0.65, 0.0, 1.0);
let heightBand = clamp(terrainCenter, 0.0, 1.0);
let baseColor = mix(
  mix(valleyColor, grassColor, smoothstep(0.07, 0.34, heightBand)),
  mix(rockColor, peakColor, smoothstep(0.44, 0.72, heightBand)),
  smoothstep(0.28, 0.64, heightBand)
);
let slopeColor = mix(baseColor, rockColor, slopeAmount * 0.52);
let snowMask = smoothstep(0.74, 0.92, heightBand) * (1.0 - slopeAmount * 0.35);
let naturalColor = mix(slopeColor, snowColor, snowMask);

let contour = smoothstep(0.02, 0.04, abs(fract(height * 2.25) - 0.5));
let contourColor = mix(vec3<f32>(0.12, 0.18, 0.19), naturalColor * 1.16, contour);
let finalColor = select(naturalColor, contourColor, surfaceMode > 0.5);

return SceneEval(
  distance,
  finalColor,
  smoothness,
  point,
  vec4<f32>(grad, 1.0),
  2.0,
  vec4<f32>(0.0, 0.96, 0.0, 0.32)
);
`;

function NoiseTerrainSceneContent({ parameters }: { parameters: NoiseTerrainSceneParameters }) {
  return (
    <SdfFunction
      sdfFunction={NOISE_TERRAIN_SDF}
      data0={[parameters.halfSize, parameters.heightScale, 0.2, parameters.slopeGuard]}
      data1={[
        parameters.baseFrequency,
        parameters.roughness,
        parameters.ridgeMix,
        parameters.surface,
      ]}
      data2={[9, parameters.terraceStrength, 0.37, 0]}
      color={[1, 1, 1]}
      material="pbr"
      materialUniform={[0.0, 0.96, 0.0, 0.32]}
      bounds={{ radius: Math.hypot(parameters.halfSize, parameters.heightScale + 0.2, parameters.halfSize) }}
    />
  );
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getLightDirection(elevationDegrees: number, azimuthDegrees: number): [number, number, number] {
  const elevation = degreesToRadians(elevationDegrees);
  const azimuth = degreesToRadians(azimuthDegrees);
  const horizontal = Math.cos(elevation);

  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ];
}

export function Scene({ parameters, canvasProps }: NoiseTerrainSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [10.5, 7.0, 13.5], target: [0, 1.35, 0], fov: 45 }}
      lighting={{
        direction: getLightDirection(parameters.lightElevation, parameters.lightAzimuth),
        color: [1.0, 0.96, 0.88],
        intensity: 1.0,
      }}
      background={{ yPositive: [0.56, 0.72, 0.88], yNegative: [0.17, 0.23, 0.25] }}
      orbitControls
    >
      <NoiseTerrainSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
