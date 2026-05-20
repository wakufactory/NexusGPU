# NexusGPU

NexusGPU is a WebGPU-first experiment for rendering signed distance field (SDF) scenes from declarative React components.

## API Overview

The public API is centered on `<NexusCanvas>`, which owns the WebGPU renderer and provides a scene context for SDF components.

- `<NexusCanvas>` renders the scene and accepts camera, lighting, background, texture, render-setting, and orbit-control props.
- Built-in primitives include `<SdfSphere>`, `<SdfBox>`, `<SdfCylinder>`, `<SdfCone>`, `<SdfCapsule>`, `<SdfTorus>`, `<SdfEllipsoid>`, and regular polyhedra except cube.
- `<SdfGroup>` combines child SDFs with boolean operations such as union, intersection, subtraction, and inversion.
- `<SdfModifier>` applies pre/post SDF transforms such as repeat, twist, onion, or custom WGSL snippets.
- `<SdfFunction>` lets a scene provide custom WGSL SDF code directly.
- `useFrame` runs a React-side animation callback from the canvas frame loop.
- `useCamera` and `useLighting` allow scene components to update camera and light state from inside the canvas tree.

The renderer expands the React scene tree into WGSL, uploads compact object records to WebGPU buffers, and raymarches the scene in a fragment shader.

## Demo App

The Vite demo app in `src/demo/App.tsx` is a small playground for the framework API. It loads scene modules from `src/demo/scenes/scenes.json`, lets you switch between demos, and exposes per-scene parameters through slider controls.

The sidebar also includes render controls for FPS, resolution scale, raymarch settings, shadows, stereo side-by-side output, and fullscreen/pause controls. Current scene parameters and render settings are saved in `localStorage` so experiments survive reloads.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL in a browser with WebGPU support.

## Scene Basic Sample

```tsx
import { useState } from "react";
import { NexusCanvas, SdfBox, SdfGroup, SdfSphere, useFrame } from "./nexusgpu";
import type { Vec3 } from "./nexusgpu";

export function Scene() {
  return (
    <NexusCanvas
      camera={{ position: [0, 0.7, 5], target: [0, 0, 0], fov: 48 }}
      orbitControls
    >
      <SdfGroup op="or" smoothness={0.2}>
        <AnimatedSphere />
        <SdfBox position={[1, 0, 0]} size={[1.2, 1.2, 1.2]} color={[0.95, 0.55, 0.18]} />
      </SdfGroup>
    </NexusCanvas>
  );
}

function AnimatedSphere() {
  const [position, setPosition] = useState<Vec3>([-1, 0, 0]);

  useFrame(({ elapsed }) => {
    setPosition([-1, Math.sin(elapsed * 1.5) * 0.35, 0]);
  });

  return <SdfSphere position={position} radius={1} color={[0.05, 0.74, 0.7]} />;
}
```
