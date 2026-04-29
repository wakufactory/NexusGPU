# Scene作成ガイド

このドキュメントは、NexusGPUでsceneを作るユーザ向けのガイドです。内部構造の詳細は扱わず、既存のSDF primitiveを使ってsceneを組み立てる方法と、新しいSDF primitiveを追加して使えるようにする手順を説明します。

内部のレンダリングフローやStorage Bufferの詳細を知りたい場合は、`docs/architecture.md`を参照してください。

## 基本

NexusGPUのsceneはReactコンポーネントです。`<NexusCanvas>`のchildrenとして`<SdfSphere>`や`<SdfBox>`を並べると、WebGPUのSDF rendererに登録されて描画されます。

```tsx
import { NexusCanvas, SdfBox, SdfSphere } from "../nexusgpu";

export function SimpleScene() {
  return (
    <NexusCanvas camera={{ position: [0, 1.4, 5], target: [0, 0, 0], fov: 48 }}>
      <SdfSphere position={[-0.9, 0, 0]} radius={0.7} color={[0.05, 0.74, 0.7]} />
      <SdfBox position={[0.9, 0, 0]} size={[1.1, 1.1, 1.1]} color={[0.95, 0.55, 0.18]} />
    </NexusCanvas>
  );
}
```

sceneファイルは通常`src/scenes/`に置きます。現在のデモでは、scene本体、推奨カメラ、推奨ライト、scene固有パラメータを1つのファイルにまとめています。

## 既存のSDF Primitive

現在使えるprimitiveは次の2つです。

| Component | 用途 | 主なprops |
| --- | --- | --- |
| `SdfSphere` | 球 | `position`, `rotation`, `radius`, `color`, `smoothness` |
| `SdfBox` | 箱 | `position`, `rotation`, `size`, `color`, `smoothness` |

共通props:

- `position`: `[x, y, z]`。省略時は`[0, 0, 0]`
- `rotation`: quaternionの`[x, y, z, w]`。省略時は回転なし
- `color`: RGBの`[r, g, b]`。各値はおおむね`0.0`から`1.0`
- `smoothness`: 他のSDFと滑らかに結合する強さ。`0`なら通常のmin合成

primitive固有props:

- `SdfSphere.radius`: 球の半径
- `SdfBox.size`: 幅、高さ、奥行きのフルサイズ

## Sceneファイルの形

sceneごとの推奨カメラとライトは、scene側でexportして`App.tsx`から`NexusCanvas`へ渡します。

```tsx
import { SdfBox, SdfSphere } from "../nexusgpu";
import type { NexusCamera, NexusLighting } from "../nexusgpu";

export const SCENE_CAMERA: Required<NexusCamera> = {
  position: [0, 2.8, 5.2],
  target: [0, 0, 0],
  fov: 48,
};

export const SCENE_LIGHTING: Required<NexusLighting> = {
  direction: [0.25, 0.85, 0.35],
};

export function MyScene() {
  return (
    <>
      <SdfBox position={[0, -0.55, 0]} size={[4, 0.1, 3]} color={[0.2, 0.23, 0.28]} />
      <SdfSphere position={[0, 0.25, 0]} radius={0.75} color={[0.05, 0.74, 0.7]} smoothness={0.2} />
    </>
  );
}
```

`App.tsx`では次のように使います。

```tsx
import { NexusCanvas } from "./nexusgpu";
import { MyScene, SCENE_CAMERA, SCENE_LIGHTING } from "./scenes/MyScene";

export function App() {
  return (
    <NexusCanvas camera={SCENE_CAMERA} lighting={SCENE_LIGHTING} orbitControls>
      <MyScene />
    </NexusCanvas>
  );
}
```

## アニメーション

`useFrame`を使うと、`NexusCanvas`内で毎フレーム処理を実行できます。`useFrame`はGPU objectを直接変更するAPIではありません。React stateを更新し、そのstateをprimitiveのpropsへ渡します。

```tsx
import { useState } from "react";
import { SdfSphere, useFrame } from "../nexusgpu";
import type { Vec3 } from "../nexusgpu";

export function FloatingSphere() {
  const [position, setPosition] = useState<Vec3>([0, 0, 0]);

  useFrame(({ elapsed }) => {
    setPosition([0, Math.sin(elapsed * 1.5) * 0.35, 0]);
  });

  return <SdfSphere position={position} radius={0.7} color={[0.05, 0.74, 0.7]} />;
}
```

複数objectを動かす場合は、設定配列からprops配列を作ると見通しがよくなります。現在の`src/scenes/AnimatedSdfScene2.tsx`がこの形です。

## Scene固有パラメータ

UIからsceneの値を変える場合は、scene側でパラメータ型と初期値をexportします。

```tsx
export type MySceneParameters = {
  sphereSmoothness: number;
};

export const INITIAL_SCENE_PARAMETERS: MySceneParameters = {
  sphereSmoothness: 0.4,
};

type MySceneProps = {
  parameters: MySceneParameters;
};

export function MyScene({ parameters }: MySceneProps) {
  return <SdfSphere radius={0.8} smoothness={parameters.sphereSmoothness} />;
}
```

`App.tsx`で`useState(INITIAL_SCENE_PARAMETERS)`を持ち、サイドパネルからpartial updateする形にすると、パラメータが増えても呼び出し側を大きく変えずに済みます。

## 新しいSDF Primitiveを追加する

ここからは、scene作者が新しい形状を使いたいときの最小手順です。例として`SdfTorus`を追加します。

### 1. kind IDを追加する

`src/nexusgpu/sdfKinds.ts`にprimitive名とIDを追加します。

```ts
export const SDF_PRIMITIVE_KIND_IDS = {
  sphere: 0,
  box: 1,
  torus: 2,
} as const;
```

IDは既存の値と重複しないようにします。

### 2. Props型を追加する

`src/nexusgpu/types.ts`にReact component用のpropsを追加します。

```ts
export type SdfTorusProps = SdfPrimitiveProps & {
  majorRadius?: number;
  minorRadius?: number;
};
```

SDFに渡す追加パラメータは、最終的に`SdfNode.data`の`data0`, `data1`, `data2`へ入ります。単純なprimitiveなら`data0`だけで足ります。

### 3. React componentを追加する

`src/nexusgpu/primitives.tsx`にcomponentを追加します。

```tsx
export function SdfTorus({
  position,
  rotation,
  majorRadius = 0.75,
  minorRadius = 0.2,
  color,
  smoothness = 0,
}: SdfTorusProps) {
  const store = useSceneStore();
  const id = useStableId();

  useEffect(() => {
    const node: SdfNode = {
      id,
      kind: "torus",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([Math.max(0.001, majorRadius), Math.max(0.001, minorRadius), 0, 0]),
      smoothness: clamp(smoothness, 0, 2),
    };

    store.upsertNode(node);
  }, [color, id, majorRadius, minorRadius, position, rotation, smoothness, store]);

  useEffect(() => {
    return () => store.removeNode(id);
  }, [id, store]);

  return null;
}
```

この例では`data0.x`にmajor radius、`data0.y`にminor radiusを入れています。GPU側のWGSLでも同じ意味で読みます。

### 4. WGSLのSDF関数を追加する

`src/nexusgpu/shaders/shaderLibrary.ts`にチャンクを追加します。

```ts
"sdf/torus": /* wgsl */ `
fn sdTorus(point: vec3<f32>, radii: vec2<f32>) -> f32 {
  let q = vec2<f32>(length(point.xz) - radii.x, point.y);
  return length(q) - radii.y;
}
`,
```

次に`src/nexusgpu/shaders/sdfPrimitivesShader.ts`でincludeします。

```wgsl
#include <sdf/torus>
```

### 5. mapSceneに分岐を追加する

`src/nexusgpu/shaders/sceneMappingShader.ts`で、kind IDに応じて新しいSDF関数を呼びます。

```ts
if (kind == ${SDF_PRIMITIVE_KIND_IDS.sphere}u) {
  distance = sdSphere(localPoint, object.data0.x);
} else if (kind == ${SDF_PRIMITIVE_KIND_IDS.box}u) {
  distance = sdBox(localPoint, object.data0.xyz);
} else if (kind == ${SDF_PRIMITIVE_KIND_IDS.torus}u) {
  distance = sdTorus(localPoint, object.data0.xy);
} else {
  distance = camera.renderInfo.y;
}
```

### 6. exportを追加する

`src/nexusgpu/index.ts`から新しいcomponentとprops型をexportします。

```ts
export { SdfBox, SdfSphere, SdfTorus } from "./primitives";

export type {
  SdfTorusProps,
} from "./types";
```

これでsceneから使えます。

```tsx
import { SdfTorus } from "../nexusgpu";

export function TorusScene() {
  return <SdfTorus position={[0, 0, 0]} majorRadius={0.8} minorRadius={0.18} color={[0.9, 0.18, 0.38]} />;
}
```

## SDF追加時のチェックリスト

- `sdfKinds.ts`に一意なkind IDを追加した
- `types.ts`にprops型を追加した
- `primitives.tsx`でpropsを正規化し、`SdfNode.data`へ必要な値を入れた
- `shaderLibrary.ts`にWGSL関数を追加した
- `sdfPrimitivesShader.ts`でWGSLチャンクをincludeした
- `sceneMappingShader.ts`でkind分岐と距離計算を追加した
- `index.ts`からcomponentと型をexportした
- scene内で新しいcomponentをimportして描画確認した

## 制限

- 現在のSDF object数上限は`MAX_SDF_OBJECTS = 128`
- 合成は全objectに対するsmooth minベース
- primitiveごとの追加データは`data0`, `data1`, `data2`の`vec4` 3本まで
- `rotation`はquaternionで指定する
- `SdfSphere`や`SdfBox`はDOMを描画しないため、CSSでは見た目を変更できない

