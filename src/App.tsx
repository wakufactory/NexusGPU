import { useState } from "react";
import { Box, Cpu, Gauge, RotateCcw, Sparkles } from "lucide-react";
import { NexusCanvas, SdfBox, SdfSphere, useFrame } from "./nexusgpu";
import type { Vec3 } from "./nexusgpu";

/** NexusGPUの現在のAPIを触るためのデモアプリ。デバッグUIもここで管理する。 */
export function App() {
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [resolutionScale, setResolutionScale] = useState(0.65);
  const [maxSteps, setMaxSteps] = useState(64);
  const [maxDistance, setMaxDistance] = useState(42);
  const [shadows, setShadows] = useState(false);
  const [normalEpsilon, setNormalEpsilon] = useState(0.0025);
  const [surfaceEpsilon, setSurfaceEpsilon] = useState(0.0025);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Sparkles size={24} />
          <div>
            <h1>NexusGPU</h1>
            <p>React driven SDF renderer for WebGPU.</p>
          </div>
        </div>

        <section className="panel">
          <h2>Phase 1</h2>
          <div className="metric">
            <Cpu size={18} />
            <span>React props sync directly into GPU storage buffers.</span>
          </div>
          <div className="metric">
            <Box size={18} />
            <span>Sphere and box primitives are raymarched in WGSL.</span>
          </div>
          <div className="metric">
            <RotateCcw size={18} />
            <span>Scene updates are incremental and frame-safe.</span>
          </div>
        </section>

        <section className="panel debug-panel">
          <div className="panel-title">
            <Gauge size={18} />
            <h2>Debug</h2>
          </div>

          <label className="control-row">
            <span>Resolution</span>
            <output>{Math.round(resolutionScale * 100)}%</output>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={resolutionScale}
              onChange={(event) => setResolutionScale(Number(event.target.value))}
            />
          </label>

          <label className="control-row">
            <span>Ray steps</span>
            <output>{maxSteps}</output>
            <input
              type="range"
              min="16"
              max="160"
              step="4"
              value={maxSteps}
              onChange={(event) => setMaxSteps(Number(event.target.value))}
            />
          </label>

          <label className="control-row">
            <span>Max distance</span>
            <output>{maxDistance}</output>
            <input
              type="range"
              min="12"
              max="90"
              step="2"
              value={maxDistance}
              onChange={(event) => setMaxDistance(Number(event.target.value))}
            />
          </label>

          <label className="control-row">
            <span>Normal epsilon</span>
            <output>{normalEpsilon.toFixed(4)}</output>
            <input
              type="range"
              min="0.001"
              max="0.01"
              step="0.0005"
              value={normalEpsilon}
              onChange={(event) => setNormalEpsilon(Number(event.target.value))}
            />
          </label>

          <label className="control-row">
            <span>Surface epsilon</span>
            <output>{surfaceEpsilon.toFixed(4)}</output>
            <input
              type="range"
              min="0.001"
              max="0.02"
              step="0.0005"
              value={surfaceEpsilon}
              onChange={(event) => setSurfaceEpsilon(Number(event.target.value))}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={shadows}
              onChange={(event) => setShadows(event.target.checked)}
            />
            <span>Shadows</span>
          </label>
        </section>

        <section className="code-sample">
          <pre>{`<NexusCanvas>
  <SdfSphere radius={1.1} />
  <SdfBox size={[1.2, 0.7, 1.2]} />
</NexusCanvas>`}</pre>
        </section>
      </aside>

      <section className="viewport">
        {/* renderSettingsを変えると、シェーダのステップ数や解像度が即座に変わる。 */}
        <NexusCanvas
          camera={{ position: [0, 0.7, 5.2], target: [0, 0, 0], fov: 48 }}
          renderSettings={{
            resolutionScale,
            maxSteps,
            maxDistance,
            shadows,
            normalEpsilon,
            surfaceEpsilon,
          }}
        >
          <AnimatedSdfScene />
        </NexusCanvas>
      </section>
    </main>
  );
}

/** useFrameでSDFオブジェクトのposition propsを更新するデモシーン。 */
function AnimatedSdfScene() {
  const [spherePosition, setSpherePosition] = useState<Vec3>([-1.25, 0.1, 0]);
  const [boxPosition, setBoxPosition] = useState<Vec3>([1.25, 0.05, 0]);
  const [accentPosition, setAccentPosition] = useState<Vec3>([0.05, -0.95, -0.2]);

  useFrame(({ elapsed }) => {
    setSpherePosition([
      -1.25 + Math.sin(elapsed * 1.15) * 0.42,
      0.1 + Math.cos(elapsed * 1.7) * 0.14,
      Math.sin(elapsed * 0.9) * 0.18,
    ]);

    setBoxPosition([
      1.25 + Math.cos(elapsed * 0.95) * 0.32,
      0.05 + Math.sin(elapsed * 1.4) * 0.16,
      Math.cos(elapsed * 0.8) * 0.22,
    ]);

    setAccentPosition([
      Math.sin(elapsed * 1.35) * 0.35,
      -0.95 + Math.sin(elapsed * 2.1) * 0.1,
      -0.2 + Math.cos(elapsed * 1.2) * 0.2,
    ]);
  });

  return (
    <>
      <SdfSphere
        position={spherePosition}
        radius={1.05}
        color={[0.05, 0.74, 0.7]}
        smoothness={0.2}
      />
      <SdfBox
        position={boxPosition}
        size={[1.35, 1.35, 1.35]}
        color={[0.95, 0.55, 0.18]}
        smoothness={0.12}
      />
      <SdfSphere
        position={accentPosition}
        radius={0.55}
        color={[0.9, 0.18, 0.38]}
        smoothness={0.08}
      />
    </>
  );
}
