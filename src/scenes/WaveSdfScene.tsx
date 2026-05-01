import { useState } from "react";
import { SdfFunction, useFrame } from "../nexusgpu";
import type { NexusCamera, NexusLighting } from "../nexusgpu";

export const SCENE_CAMERA: Required<NexusCamera> = {
  position: [0, 2.45, 5.6],
  target: [0, 0, 0],
  fov: 46,
};

export const SCENE_LIGHTING: Required<NexusLighting> = {
  direction: [0.1, 0.9, 0.35],
};

export type WaveSdfSceneParameters = {
  waveAmplitude: number;
  waveFrequency: number;
  waveSpeed: number;
};

export const INITIAL_SCENE_PARAMETERS: WaveSdfSceneParameters = {
  waveAmplitude: 0.36,
  waveFrequency: 5.2,
  waveSpeed: 1.6,
};

const WAVE_PLANE_SDF = /* wgsl */ `
// data0: xy = half size, z = wave amplitude, w = half thickness.
// data1: x = primary x frequency, y = primary z frequency, z = animated phase.
// data2: x = secondary frequency, y = secondary amplitude ratio.
let halfSize = data0.xy;
let amplitude = data0.z;
let halfThickness = data0.w;

// Build the wave height from two sine waves moving through phase.
// point is already transformed into this object's local space.
let phase = data1.z;
let primaryWave = sin(point.x * data1.x + point.z * data1.y + phase);
let secondaryArgument = (point.x - point.z) * data2.x + phase * 0.7;
let secondaryWave = sin(secondaryArgument) * data2.y;
let height = amplitude * (primaryWave + secondaryWave);

// A raw height-field distance can overestimate distance on steep slopes.
// Divide by a conservative max gradient so ray marching does not skip the thin surface.
let maxSecondarySlope = abs(data2.x * data2.y);
let maxDx = amplitude * (abs(data1.x) + maxSecondarySlope);
let maxDz = amplitude * (abs(data1.y) + maxSecondarySlope);
let maxGradient = sqrt(1.0 + maxDx * maxDx + maxDz * maxDz);
let heightDistance = (point.y - height) / maxGradient;

// Give the height field a small slab thickness so it renders as a visible plane.
let slabDistance = abs(heightDistance) - halfThickness;

// Limit the plane to a finite rectangle on XZ instead of an infinite wave field.
let edgeDistance = max(abs(point.x) - halfSize.x, abs(point.z) - halfSize.y);

// Combine the edge and slab distances into a rectangular thin sheet SDF.
let outsideDistance = length(max(vec2<f32>(edgeDistance, slabDistance), vec2<f32>(0.0)));
let insideDistance = min(max(edgeDistance, slabDistance), 0.0);
return outsideDistance + insideDistance;
`;

type WaveSdfSceneProps = {
  parameters: WaveSdfSceneParameters;
};

/** SdfFunctionでサイン波の高さ場を有限サイズの薄い平面として描くシーン。 */
export function WaveSdfScene({ parameters }: WaveSdfSceneProps) {
  const [phase, setPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setPhase(elapsed * parameters.waveSpeed);
  });

  return (
    <SdfFunction
      sdfFunction={WAVE_PLANE_SDF}
      // data0 controls the sheet bounds and thickness: [halfWidth, halfDepth, amplitude, halfThickness].
      data0={[30.7, 20.25, parameters.waveAmplitude, 0.005]}
      // data1 controls the main diagonal wave and animation phase: [xFrequency, zFrequency, phase, unused].
      data1={[parameters.waveFrequency, parameters.waveFrequency * 0.65, phase, 0]}
      // data2 controls the weaker crossing wave: [frequency, amplitudeRatio, unused, unused].
      data2={[parameters.waveFrequency * 0.82, 0.35, 0, 0]}
      position={[0, 0, 0]}
      color={[0.78, 0.26, 0.26]}
      smoothness={0}
    />
  );
}
