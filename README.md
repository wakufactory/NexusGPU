# NexusGPU

NexusGPU is a WebGPU-first experiment for rendering SDF primitives from declarative React components.

This repository implements phase 1 of the roadmap in `NexusGPU_Framework_Roadmap.md`:

- React components for `<NexusCanvas>`, `<SdfSphere>`, and `<SdfBox>`
- A `useFrame` hook for driving React-side SDF animations
- A scene store that syncs React props into GPU-friendly storage-buffer records
- A WGSL fragment raymarcher for smooth sphere and box primitives
- A Vite demo app that exercises the first framework API

## Run

```bash
npm install
npm run dev
```

Open the printed local URL in a browser with WebGPU support.

## API Sketch

```tsx
import { useState } from "react";
import { NexusCanvas, SdfBox, SdfSphere, useFrame } from "./nexusgpu";
import type { Vec3 } from "./nexusgpu";

export function Scene() {
  return (
    <NexusCanvas camera={{ position: [0, 0.7, 5], target: [0, 0, 0], fov: 48 }}>
      <AnimatedSphere />
      <SdfBox position={[1, 0, 0]} size={[1.2, 1.2, 1.2]} color={[0.95, 0.55, 0.18]} />
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

## Next Framework Steps

1. Replace component registration with a dedicated `react-reconciler` host once the primitive contract is stable.
2. Add dirty-range buffer writes so prop updates upload only changed object records.
3. Move spatial indexing and culling into compute passes.
4. Add an intermediate schema/DSL layer for AI-generated scenes.
