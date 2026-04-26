import { useState } from "react";
import { Box, Cpu, RotateCcw, Sparkles } from "lucide-react";
import { NexusCanvas, SdfBox, SdfSphere, useFrame } from "./nexusgpu";
import type { NexusRenderSettings, Vec3 } from "./nexusgpu";
import { RenderSettingsPanel } from "./RenderSettingsPanel";

type RenderSettings = Required<NexusRenderSettings>;

const INITIAL_RENDER_SETTINGS: RenderSettings = {
  resolutionScale: 0.65,
  maxSteps: 64,
  maxDistance: 42,
  shadows: false,
  normalEpsilon: 0.0025,
  surfaceEpsilon: 0.0025,
};

/** NexusGPUの現在のAPIを触るためのデモアプリ。デバッグUIもここで管理する。 */
export function App() {
  // ここで持つstateはそのままNexusCanvasのrenderSettingsへ渡され、WebGPUのUniformへ反映される。
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(INITIAL_RENDER_SETTINGS);

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

        <RenderSettingsPanel settings={renderSettings} onChange={setRenderSettings} />
      </aside>

      <section className="viewport">
        {/* renderSettingsを変えると、シェーダのステップ数や解像度が即座に変わる。 */}
        <NexusCanvas
          camera={{ position: [0, 0.7, 5.2], target: [0, 0, 0], fov: 48 }}
          renderSettings={renderSettings}
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
