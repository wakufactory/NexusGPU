import { useState } from "react";
import { Sparkles } from "lucide-react";
import { NexusCanvas, SdfBox, SdfSphere, useFrame } from "./nexusgpu";
import type { NexusRenderSettings, Vec3 } from "./nexusgpu";
import { RenderSettingsPanel } from "./RenderSettingsPanel";

type RenderSettings = Required<NexusRenderSettings>;

const INITIAL_RENDER_SETTINGS: RenderSettings = {
  resolutionScale: 0.4,
  maxSteps: 64,
  maxDistance: 42,
  shadows: true,
  normalEpsilon: 0.0025,
  surfaceEpsilon: 0.0025,
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

/** NexusGPUの現在のAPIを触るためのデモアプリ。デバッグUIもここで管理する。 */
export function App() {
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(INITIAL_RENDER_SETTINGS);

  return (
    <main className="app-shell">
      <section className="viewport">
        {/* renderSettingsを変えると、シェーダのステップ数や解像度が即座に変わる。 */}
        <NexusCanvas
          camera={{ position: [0, 0.7, 5.2], target: [0, 0, 0], fov: 48 }}
          lighting={{ direction: [0.25, 0.85, 0.35] }}
          orbitControls
          renderSettings={renderSettings}
        >
          <AnimatedSdfScene />
        </NexusCanvas>
      </section>
      <aside className="sidebar">
        <div className="brand">
          <Sparkles size={24} />
          <div>
            <h1>NexusGPU</h1>
            <p>React driven SDF renderer for WebGPU.</p>
          </div>
        </div>

        <RenderSettingsPanel settings={renderSettings} onChange={setRenderSettings} />
      </aside>
    </main>
  );
}

/** 薄い床の上で、4つの球が別々の軸と周期で周回するデモシーン。 */
function AnimatedSdfScene() {
  const [spherePositions, setSpherePositions] = useState<readonly Vec3[]>(
    ORBITING_SPHERES.map((sphere) => getOrbitPosition(sphere, 0)),
  );

  useFrame(({ elapsed }) => {
    setSpherePositions(ORBITING_SPHERES.map((sphere) => getOrbitPosition(sphere, elapsed)));
  });

  return (
    <>
      <SdfBox
        position={[0, -0.06, 0]}
        size={[4.4, 0.12, 3.2]}
        color={[0.2, 0.23, 0.28]}
        smoothness={0.2}
      />
      {ORBITING_SPHERES.map((sphere, index) => (
        <SdfSphere
          key={index}
          position={spherePositions[index]}
          radius={sphere.radius}
          color={sphere.color}
          smoothness={0.7}
        />
      ))}
    </>
  );
}
