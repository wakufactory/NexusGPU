# Scene作成ガイド

このドキュメントは、NexusGPUでsceneを作るユーザ向けのガイドです。内部構造の詳細は扱わず、既存のSDF primitiveを使ってsceneを組み立てる方法と、新しいSDF primitiveを追加して使えるようにする手順を説明します。

内部のレンダリングフローやStorage Bufferの詳細を知りたい場合は、`docs/architecture.md`を参照してください。

## 基本

NexusGPUのsceneはReactコンポーネントです。`<NexusCanvas>`のchildrenとして`<SdfSphere>`、`<SdfBox>`、`<SdfFunction>`などを並べると、WebGPUのSDF rendererに登録されて描画されます。

```tsx
import { NexusCanvas, SdfBox, SdfFunction, SdfSphere } from "../nexusgpu";

export function SimpleScene() {
  return (
    <NexusCanvas camera={{ position: [0, 1.4, 5], target: [0, 0, 0], fov: 48 }}>
      <SdfSphere position={[-0.9, 0, 0]} radius={0.7} color={[0.05, 0.74, 0.7]} />
      <SdfBox position={[0.9, 0, 0]} size={[1.1, 1.1, 1.1]} color={[0.95, 0.55, 0.18]} />
      <SdfFunction
        position={[0, -0.95, 0]}
        sdfFunction="return length(point.xz) - data0.x;"
        data0={[0.5, 0, 0, 0]}
        color={[0.7, 0.45, 0.95]}
      />
    </NexusCanvas>
  );
}
```

sceneファイルは通常`src/scenes/`に置きます。現在のデモでは、scene本体、推奨カメラ、推奨ライト、scene固有パラメータを1つのファイルにまとめています。

## 既存のSDF Primitive

現在使えるprimitiveは次の3つです。

| Component | 用途 | 主なprops |
| --- | --- | --- |
| `SdfSphere` | 球 | `position`, `rotation`, `radius`, `color`, `smoothness` |
| `SdfBox` | 箱 | `position`, `rotation`, `size`, `color`, `smoothness` |
| `SdfFunction` | WGSL文字列で定義する汎用SDF | `position`, `rotation`, `sdfFunction`, `data0`, `data1`, `data2`, `color`, `smoothness` |

共通props:

- `position`: `[x, y, z]`。省略時は`[0, 0, 0]`
- `rotation`: quaternionの`[x, y, z, w]`。省略時は回転なし
- `color`: RGBの`[r, g, b]`。各値はおおむね`0.0`から`1.0`
- `smoothness`: 他のSDFと滑らかに結合する強さ。`0`なら通常のmin合成

primitive固有props:

- `SdfSphere.radius`: 球の半径
- `SdfBox.size`: 幅、高さ、奥行きのフルサイズ
- `SdfFunction.sdfFunction`: WGSLのSDF関数文字列、または関数body / 式
- `SdfFunction.data0`, `data1`, `data2`: WGSL側へそのまま渡す`vec4<f32>`相当の追加データ

## SdfFunctionでWGSLを直接使う

`SdfFunction`は、専用componentを追加せずにscene内でSDFを試すためのprimitiveです。`sdfFunction`にはWGSL文字列を渡します。関数内で使える引数は次の4つです。

```wgsl
point: vec3<f32>
data0: vec4<f32>
data1: vec4<f32>
data2: vec4<f32>
```

`point`はオブジェクトの`position`と`rotation`を適用済みのローカル座標です。つまりSDF関数内では、原点中心の形状として距離を計算します。

短い式や関数bodyだけを渡せます。

```tsx
import { SdfFunction } from "../nexusgpu";

export function CustomSphereScene() {
  return (
    <SdfFunction
      sdfFunction="return length(point) - data0.x;"
      data0={[0.8, 0, 0, 0]}
      color={[0.9, 0.18, 0.38]}
    />
  );
}
```

WGSL関数全体を渡す場合は、`sdfFunction`という名前で定義できます。レンダラ内部では安全に別名へ差し替えられます。

```tsx
const roundedBoxSdf = /* wgsl */ `
fn sdfFunction(point: vec3<f32>, data0: vec4<f32>, data1: vec4<f32>, data2: vec4<f32>) -> f32 {
  let bounds = data0.xyz;
  let radius = data0.w;
  let q = abs(point) - bounds + vec3<f32>(radius);
  return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - radius;
}
`;

export function RoundedBoxScene() {
  return (
    <SdfFunction
      sdfFunction={roundedBoxSdf}
      data0={[0.7, 0.45, 0.35, 0.12]}
      color={[0.05, 0.74, 0.7]}
    />
  );
}
```

同じ`sdfFunction`文字列を複数objectで使う場合は、同じGPU側関数とkind IDが共有されます。異なる`sdfFunction`文字列が増えると、シェーダの再生成と`mapScene()`内のkind分岐が増えるため、頻繁に変わる値は関数文字列に埋め込まず`data0-2`で渡してください。

## Sceneファイルの形

sceneごとの推奨カメラとライトは、scene側でexportします。`App.tsx`は個別sceneを直接importせず、`src/scenes/registry.ts`に登録されたscene定義から`NexusCanvas`へ渡します。

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

作成したsceneをアプリの切り替え対象にするには、`src/scenes/registry.ts`の`SCENES`へ追加します。

```ts
import {
  MyScene,
  SCENE_CAMERA as MY_SCENE_CAMERA,
  SCENE_LIGHTING as MY_SCENE_LIGHTING,
} from "./MyScene";
import type { AnyNexusSceneDefinition } from "./types";

export const SCENES = [
  // existing scene definitions...
  {
    id: "my-scene",
    title: "My Scene",
    description: "Short description shown in the sidebar.",
    camera: MY_SCENE_CAMERA,
    lighting: MY_SCENE_LIGHTING,
    initialParameters: {},
    Component: MyScene,
  },
] satisfies readonly AnyNexusSceneDefinition[];
```

`App.tsx`は`SCENES`の選択中定義から`camera`、`lighting`、`Component`、`ParametersPanel`を読みます。sceneを差し替えるために`App.tsx`のimportやJSXを書き換える必要はありません。

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

パラメータをsidebarから変更したい場合は、`src/panels/`にscene用panelを作ります。panelは`parameters`と`onChange`を受け取り、変更した値だけをpartial updateとして渡します。

```tsx
import type { MySceneParameters } from "../scenes/MyScene";

type MySceneParametersPanelProps = {
  parameters: MySceneParameters;
  onChange: (patch: Partial<MySceneParameters>) => void;
};

export function MySceneParametersPanel({ parameters, onChange }: MySceneParametersPanelProps) {
  return (
    <label className="control-row">
      <span>Sphere smoothness</span>
      <output>{parameters.sphereSmoothness.toFixed(2)}</output>
      <input
        type="range"
        min="0"
        max="1.5"
        step="0.05"
        value={parameters.sphereSmoothness}
        onChange={(event) => onChange({ sphereSmoothness: Number(event.target.value) })}
      />
    </label>
  );
}
```

registryには`initialParameters`と`ParametersPanel`をセットで登録します。

```ts
import { MySceneParametersPanel } from "../panels/MySceneParametersPanel";
import {
  MyScene,
  INITIAL_SCENE_PARAMETERS as MY_SCENE_INITIAL_PARAMETERS,
  SCENE_CAMERA as MY_SCENE_CAMERA,
  SCENE_LIGHTING as MY_SCENE_LIGHTING,
} from "./MyScene";

{
  id: "my-scene",
  title: "My Scene",
  description: "Short description shown in the sidebar.",
  camera: MY_SCENE_CAMERA,
  lighting: MY_SCENE_LIGHTING,
  initialParameters: MY_SCENE_INITIAL_PARAMETERS,
  Component: MyScene,
  ParametersPanel: MySceneParametersPanel,
}
```

この形にすると、パラメータが増えてもscene componentとpanelの型を更新し、registryの1件を保つだけで済みます。

## Scene Registry

`src/scenes/registry.ts`は、アプリで選べるsceneの一覧です。各scene定義は次の項目を持ちます。

- `id`: scene selector用の一意なID
- `title`: sidebarに表示する名前
- `description`: sidebarに表示する説明
- `camera`: scene側でexportした推奨カメラ
- `lighting`: scene側でexportした推奨ライト
- `initialParameters`: scene固有パラメータの初期値
- `Component`: `parameters` propsを受け取るscene component
- `ParametersPanel`: 任意のscene固有パラメータUI

新しいsceneを追加するときの最小手順は次の通りです。

1. `src/scenes/MyScene.tsx`にscene component、`SCENE_CAMERA`、`SCENE_LIGHTING`、必要なら`INITIAL_SCENE_PARAMETERS`を作る
2. 必要なら`src/panels/MySceneParametersPanel.tsx`に操作UIを作る
3. `src/scenes/registry.ts`でscene本体とpanelをimportする
4. `SCENES`へscene定義を1件追加する
5. `npm run build`で型とbundleを確認する

## 新しいSDF Primitiveを追加する

ここからは、scene作者が新しい形状を組み込みprimitiveとして追加したいときの最小手順です。試作だけなら、まず`SdfFunction`でWGSLを直接渡す方が少ない変更で済みます。例として`SdfTorus`を追加します。

### 1. kind IDとcustom ID開始値を更新する

`src/nexusgpu/sdfKinds.ts`にprimitive名とIDを追加します。`SdfFunction`用の動的kind IDは`CUSTOM_SDF_PRIMITIVE_KIND_START`以降を使うため、新しい組み込みprimitiveのIDと重ならないように開始値も更新します。

```ts
export const SDF_PRIMITIVE_KIND_IDS = {
  sphere: 0,
  box: 1,
  torus: 2,
} as const;

export const CUSTOM_SDF_PRIMITIVE_KIND_START = 3;
```

IDは既存の値と重複しないようにします。組み込みprimitiveを増やしたら、`CUSTOM_SDF_PRIMITIVE_KIND_START`は「組み込みkind IDの最大値 + 1」にします。

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

- `sdfKinds.ts`に一意なkind IDを追加し、`CUSTOM_SDF_PRIMITIVE_KIND_START`を組み込みkind IDの最大値 + 1 に更新した
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
- `SdfFunction`の関数文字列セットが変わるとShader Module / Render Pipelineを再生成する
- ユニークな`SdfFunction`が増えるほど`mapScene()`のkind分岐が長くなる
- `rotation`はquaternionで指定する
- SDF primitiveはDOMを描画しないため、CSSでは見た目を変更できない
