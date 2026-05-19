import { useState } from "react";
import { NexusCanvas, SdfFunction, useFrame } from "../nexusgpu";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 220,
  maxDistance: 18,
  shadows: true,
  normalEpsilon: 0.0008,
  surfaceEpsilon: 0.0012,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    radius: 0.07,
    xAmplitude: 1.1,
    yAmplitude: 0.82,
    zAmplitude: 0.7,
    xFrequency: 3,
    yFrequency: 4,
    zFrequency: 5,
    yPhase: 1.15,
    zPhase: 2.35,
    segments: 96,
    phaseSpeed: 0.18,
    safety: 0.82,
  },
  [
    { key: "radius", name: "Sweep radius", min: 0.025, max: 0.18, step: 0.005, precision: 3 },
    { key: "xAmplitude", name: "X amplitude", min: 0.35, max: 1.6, step: 0.01 },
    { key: "yAmplitude", name: "Y amplitude", min: 0.35, max: 1.6, step: 0.01 },
    { key: "zAmplitude", name: "Z amplitude", min: 0.15, max: 1.4, step: 0.01 },
    { key: "xFrequency", name: "X frequency", min: 1, max: 8, step: 1 },
    { key: "yFrequency", name: "Y frequency", min: 1, max: 8, step: 1 },
    { key: "zFrequency", name: "Z frequency", min: 1, max: 8, step: 1 },
    { key: "yPhase", name: "Y phase", min: 0, max: 6.28, step: 0.01 },
    { key: "zPhase", name: "Z phase", min: 0, max: 6.28, step: 0.01 },
    { key: "segments", name: "Segments", min: 24, max: 128, step: 1 },
    { key: "phaseSpeed", name: "Phase speed", min: 0, max: 1.5, step: 0.01 },
    { key: "safety", name: "Ray safety", min: 0.55, max: 1.0, step: 0.01 },
  ],
);

export type LissajousSweepSceneParameters = typeof initialParameters;

type LissajousSweepSceneProps = {
  parameters: LissajousSweepSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const LISSAJOUS_SWEEP_SDF = /* wgsl */ `
fn lissajousSweepPoint(t: f32, amplitude: vec3<f32>, frequency: vec3<f32>, phase: vec3<f32>) -> vec3<f32> {
  let tau = 6.28318530718;
  return vec3<f32>(
    amplitude.x * sin(tau * frequency.x * t + phase.x),
    amplitude.y * sin(tau * frequency.y * t + phase.y),
    amplitude.z * sin(tau * frequency.z * t + phase.z)
  );
}

fn sdfFunction(
  point: vec3<f32>,
  data0: vec4<f32>,
  data1: vec4<f32>,
  data2: vec4<f32>,
  color: vec3<f32>,
  smoothness: f32
) -> SceneHit {
  // data0.xyz = リサジュー曲線の各軸振幅。data0.w = sweepする円断面の半径。
  let amplitude = max(data0.xyz, vec3<f32>(0.001));
  let tubeRadius = max(data0.w, 0.001);

  // data1.xyz = 各軸の周波数。整数比にすると閉じた結び目状の軌跡になりやすい。
  let frequency = max(data1.xyz, vec3<f32>(0.001));
  let safety = clamp(data1.w, 0.55, 1.0);

  // data2.xy = Y/Z軸の位相。data2.z = polyline分割数。data2.w = animation phase。
  let animatedPhase = data2.w;
  let phase = vec3<f32>(animatedPhase * 0.37, data2.x + animatedPhase * 0.63, data2.y + animatedPhase * 0.91);
  let segmentLimit = clamp(data2.z, 8.0, 128.0);

  var distance = 1e6;
  var closestT = 0.0;
  var previous = lissajousSweepPoint(0.0, amplitude, frequency, phase);

  // 隣り合う曲線サンプルをcapsuleでつなぎ、曲線に沿って円断面をsweepしたtubeとして近似する。
  for (var i = 1; i <= 128; i = i + 1) {
    if (f32(i) > segmentLimit) {
      break;
    }

    let t = f32(i) / segmentLimit;
    let current = lissajousSweepPoint(t, amplitude, frequency, phase);
    let segmentDistance = sdCapsule(point, previous, current, tubeRadius, 1.0);

    if (segmentDistance < distance) {
      distance = segmentDistance;
      closestT = t;
    }

    previous = current;
  }

  let stripe = 0.5 + 0.5 * sin(closestT * 37.699112 + animatedPhase * 1.7);
  let cyan = vec3<f32>(0.04, 0.86, 1.0);
  let magenta = vec3<f32>(0.96, 0.12, 0.72);
  let gold = vec3<f32>(1.0, 0.62, 0.18);
  let painted = mix(mix(cyan, magenta, smoothstep(0.18, 0.82, stripe)), gold, smoothstep(0.72, 1.0, closestT) * 0.45);

  // capsule列による近似なので、距離は少し短く返してraymarchのすり抜けを抑える。
  return SceneHit(distance * safety, painted, smoothness, point);
}
`;

function LissajousSweepContent({ parameters }: { parameters: LissajousSweepSceneParameters }) {
  const [animatedPhase, setAnimatedPhase] = useState(0);

  useFrame(({ elapsed }) => {
    setAnimatedPhase(elapsed * parameters.phaseSpeed);
  });

  return (
    <SdfFunction
      sdfFunction={LISSAJOUS_SWEEP_SDF}
      // data0: x/y/z amplitude, swept circular profile radius.
      data0={[parameters.xAmplitude, parameters.yAmplitude, parameters.zAmplitude, parameters.radius]}
      // data1: x/y/z lissajous frequency, raymarch safety.
      data1={[parameters.xFrequency, parameters.yFrequency, parameters.zFrequency, parameters.safety]}
      // data2: y phase, z phase, segment count, animated phase.
      data2={[parameters.yPhase, parameters.zPhase, parameters.segments, animatedPhase]}
      color={[0.04, 0.86, 1.0]}
      smoothness={0.04}
      material="default"
      materialUniform={[0.2, 0.38, 0.58, 0.16]}
      bounds={{ center: [0, 0, 0], radius: 3.0 }}
    />
  );
}

export function Scene({ parameters, canvasProps }: LissajousSweepSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [2.75, 1.55, 4.25], target: [0, 0, 0], fov: 42 }}
      lighting={{ direction: [-0.42, 0.82, 0.38], color: [1.0, 0.94, 0.86], intensity: 1.35 }}
      background={{ yPositive: [0.01, 0.017, 0.028], yNegative: [0.06, 0.035, 0.07] }}
      orbitControls
    >
      <LissajousSweepContent parameters={parameters} />
    </NexusCanvas>
  );
}
