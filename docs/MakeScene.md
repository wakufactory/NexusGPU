# Scene作成ガイド

このドキュメントは、NexusGPUでsceneを作るユーザ向けのガイドです。内部構造の詳細は扱わず、既存のSDF primitiveを使ってsceneを組み立てる方法と、新しいSDF primitiveを追加して使えるようにする手順を説明します。

内部のレンダリングフローやStorage Bufferの詳細を知りたい場合は、`docs/architecture.md`を参照してください。

## 基本

NexusGPUのsceneはReactコンポーネントです。`<NexusCanvas>`のchildrenとして`<SdfSphere>`、`<SdfBox>`、`<SdfCylinder>`、`<SdfTorus>`、`<SdfEllipsoid>`、`<SdfFunction>`などを並べると、WebGPUのSDF rendererに登録されて描画されます。複数のSDFをCSG/boolean演算でまとめたい場合は`<SdfGroup>`、`<SdfNot>`、`<SdfSubtract>`を使います。

```tsx
import {
  NexusCanvas,
  SdfBox,
  SdfCylinder,
  SdfEllipsoid,
  SdfFunction,
  SdfGroup,
  SdfSphere,
  SdfTorus,
} from "../nexusgpu";

export function SimpleScene() {
  return (
    <NexusCanvas camera={{ position: [0, 1.4, 5], target: [0, 0, 0], fov: 48 }}>
      <SdfGroup op="or" smoothness={0.2}>
        <SdfSphere position={[-0.9, 0, 0]} radius={0.7} color={[0.05, 0.74, 0.7]} />
        <SdfBox position={[0.9, 0, 0]} size={[1.1, 1.1, 1.1]} color={[0.95, 0.55, 0.18]} />
        <SdfCylinder position={[0, 0, -0.9]} radius={0.35} height={1.4} color={[0.25, 0.55, 0.95]} />
        <SdfTorus position={[0, 0, 0.9]} majorRadius={0.55} minorRadius={0.14} color={[0.9, 0.18, 0.38]} />
        <SdfEllipsoid position={[0, 0.55, 0]} radii={[0.7, 0.35, 0.45]} color={[0.7, 0.45, 0.95]} />
      </SdfGroup>
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

現在使えるprimitiveと構成用componentは次の通りです。

| Component | 用途 | 主なprops |
| --- | --- | --- |
| `SdfSphere` | 球 | `position`, `rotation`, `radius`, `color`, `smoothness` |
| `SdfBox` | 箱 | `position`, `rotation`, `size`, `color`, `smoothness` |
| `SdfCylinder` | 円柱 | `position`, `rotation`, `radius`, `height`, `color`, `smoothness` |
| `SdfTorus` | トーラス | `position`, `rotation`, `majorRadius`, `minorRadius`, `color`, `smoothness` |
| `SdfEllipsoid` | 楕円球 | `position`, `rotation`, `radii`, `color`, `smoothness` |
| `SdfFunction` | WGSL文字列で定義する汎用SDF | `position`, `rotation`, `sdfFunction`, `data0`, `data1`, `data2`, `bounds`, `color`, `smoothness` |
| `SdfGroup` | 子SDFのboolean合成 | `op`, `smoothness`, `children` |
| `SdfNot` | 子SDFの内外反転 | `children` |
| `SdfSubtract` | 1つ目の子から後続の子を差し引く | `children` |

共通props:

- `position`: `[x, y, z]`。省略時は`[0, 0, 0]`
- `rotation`: quaternionの`[x, y, z, w]`。省略時は回転なし
- `color`: RGBの`[r, g, b]`。各値はおおむね`0.0`から`1.0`
- `smoothness`: 他のSDFと滑らかに結合する強さ。`0`なら通常のmin合成

primitive固有props:

- `SdfSphere.radius`: 球の半径
- `SdfBox.size`: 幅、高さ、奥行きのフルサイズ
- `SdfCylinder.radius`: 円柱の半径
- `SdfCylinder.height`: Y軸方向のフル高さ
- `SdfTorus.majorRadius`: 原点からチューブ中心までの半径
- `SdfTorus.minorRadius`: チューブ自体の半径
- `SdfEllipsoid.radii`: X/Y/Z各軸の半径
- `SdfFunction.sdfFunction`: WGSLのSDF関数文字列、または関数body / 式
- `SdfFunction.data0`, `data1`, `data2`: WGSL側へそのまま渡す`vec4<f32>`相当の追加データ
- `SdfFunction.bounds`: グループbounds計算用の`{ radius, center }`。任意WGSLの形状推定が必要な場合に指定する
- `SdfGroup.op`: `"or"`、`"and"`、`"subtract"`、`"not"`のいずれか。省略時は`"or"`

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

同じ`sdfFunction`文字列を複数objectで使う場合は、同じGPU側関数が共有されます。異なる`sdfFunction`文字列が増えると、シェーダの再生成と`mapScene()`内の直接呼び出し先が増えるため、頻繁に変わる値は関数文字列に埋め込まず`data0-2`で渡してください。

## SdfGroupでSDFを組み合わせる

`SdfGroup`を使うと、子SDFを1つのCSG/boolean演算としてまとめられます。通常のなめらかな合成は`op="or"`です。

```tsx
import { SdfGroup, SdfSphere } from "../nexusgpu";

export function SmoothUnionScene() {
  return (
    <SdfGroup op="or" smoothness={0.25}>
      <SdfSphere position={[-0.35, 0, 0]} radius={0.7} color={[0.05, 0.74, 0.7]} />
      <SdfSphere position={[0.35, 0, 0]} radius={0.7} color={[0.9, 0.18, 0.38]} />
    </SdfGroup>
  );
}
```

`op`の意味は次の通りです。

| op | 意味 | SDF式のイメージ |
| --- | --- | --- |
| `"or"` | 和集合。どちらかの内側 | `min(a, b)` / smooth union |
| `"and"` | 積集合。両方の内側 | `max(a, b)` |
| `"subtract"` | 1つ目の子から後続の子を差し引く | `max(a, -b)` |
| `"not"` | 内外を反転 | `-a` |

球で箱をくり抜く場合は、`SdfSubtract`を使うのが一番読みやすいです。

```tsx
import { SdfBox, SdfSphere, SdfSubtract } from "../nexusgpu";

export function CutBoxScene() {
  return (
    <SdfSubtract>
      <SdfBox position={[0, 0, 0]} size={[2, 2, 2]} color={[0.95, 0.55, 0.18]} />
      <SdfSphere position={[0.45, 0.2, 0]} radius={0.75} />
    </SdfSubtract>
  );
}
```

`SdfNot`を明示的に使う場合は、`and`と組み合わせるのが基本です。`not`単体は「形状の外側すべて」を表すため、無限に広がる反転空間になります。

```tsx
import { SdfBox, SdfGroup, SdfNot, SdfSphere } from "../nexusgpu";

export function BoxAndNotSphereScene() {
  return (
    <SdfGroup op="and">
      <SdfBox position={[0, 0, 0]} size={[2, 2, 2]} color={[0.95, 0.55, 0.18]} />
      <SdfNot>
        <SdfSphere position={[0.45, 0.2, 0]} radius={0.75} />
      </SdfNot>
    </SdfGroup>
  );
}
```

グループはネストできます。

```tsx
<SdfGroup op="and">
  <SdfGroup op="or" smoothness={0.2}>
    <SdfSphere position={[-0.4, 0, 0]} radius={0.65} />
    <SdfSphere position={[0.4, 0, 0]} radius={0.65} />
  </SdfGroup>
  <SdfBox position={[0, 0, 0]} size={[1.4, 1.0, 1.4]} />
</SdfGroup>
```

現在の実装では、グループ構造はGPU上で命令列として解釈されず、レンダラがWGSLの`mapScene()`へ展開します。そのため数十object程度のsceneでは軽く動きますが、`op`やグループ構成、グループの`smoothness`を頻繁に変更するとShader Module / Render Pipelineの再生成が発生します。毎フレーム動かす値は、primitiveの`position`、`rotation`、`radius`、`size`、`color`、`data0-2`などにするのが安全です。

`SdfFunction`をグループに含める場合は、必要に応じて`bounds`を指定してください。現在はGPU側の枝刈りには使っていませんが、グループのbounding sphereメタデータとして保持されます。

```tsx
<SdfFunction
  sdfFunction="return length(point / data0.xyz) - 1.0;"
  data0={[0.7, 0.5, 0.25, 0]}
  bounds={{ radius: 0.8 }}
/>
```

## Sceneファイルの形

sceneファイルは`Scene`という名前のReact componentと、推奨カメラ、推奨ライト、初期パラメータ、slider定義をまとめた`sceneSettings`をexportします。`App.tsx`は個別sceneを直接importせず、`src/scenes/scenes.json`に登録された`module`を`registry.ts`が解決して`NexusCanvas`へ渡します。

```tsx
import { SdfBox, SdfSphere } from "../nexusgpu";
import { defineSceneSettings } from "./types";

export type MySceneParameters = {
  sphereSmoothness: number;
};

export const sceneSettings = defineSceneSettings<MySceneParameters>({
  camera: {
    position: [0, 2.8, 5.2],
    target: [0, 0, 0],
    fov: 48,
  },
  lighting: {
    direction: [0.25, 0.85, 0.35],
  },
  initialParameters: {
    sphereSmoothness: 0.4,
  },
  parameterControls: [
    {
      key: "sphereSmoothness",
      name: "Sphere smoothness",
      min: 0,
      max: 1.5,
      step: 0.05,
    },
  ],
});

export function Scene({ parameters }: { parameters: MySceneParameters }) {
  return (
    <>
      <SdfBox position={[0, -0.55, 0]} size={[4, 0.1, 3]} color={[0.2, 0.23, 0.28]} />
      <SdfSphere
        position={[0, 0.25, 0]}
        radius={0.75}
        color={[0.05, 0.74, 0.7]}
        smoothness={parameters.sphereSmoothness}
      />
    </>
  );
}
```

作成したsceneをアプリの切り替え対象にするには、`src/scenes/scenes.json`へ追加します。

```json
[
  {
    "id": "my-scene",
    "title": "My Scene",
    "description": "Short description shown in the sidebar.",
    "module": "./MyScene.tsx"
  }
]
```

`App.tsx`は`SCENES`の選択中定義から`camera`、`lighting`、`Component`、`parameterControls`を読みます。sceneを差し替えるために`App.tsx`のimportやJSXを書き換える必要はありません。

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

UIからsceneの値を変える場合は、scene側でパラメータ型を定義し、初期値は同じsceneファイルの`sceneSettings.initialParameters`へ書きます。

```tsx
export type MySceneParameters = {
  sphereSmoothness: number;
};

type MySceneProps = {
  parameters: MySceneParameters;
};

export function Scene({ parameters }: MySceneProps) {
  return <SdfSphere radius={0.8} smoothness={parameters.sphereSmoothness} />;
}
```

パラメータをsidebarから変更したい場合は、`sceneSettings.parameterControls`にslider定義を追加します。`key`は`initialParameters`に存在するnumber型のプロパティを指定します。

```ts
export const sceneSettings = defineSceneSettings<MySceneParameters>({
  camera: {
    position: [0, 2.8, 5.2],
    target: [0, 0, 0],
    fov: 48,
  },
  lighting: {
    direction: [0.25, 0.85, 0.35],
  },
  initialParameters: {
    sphereSmoothness: 0.4,
  },
  parameterControls: [
    {
      key: "sphereSmoothness",
      name: "Sphere smoothness",
      min: 0,
      max: 1.5,
      step: 0.05,
    },
  ],
});
```

この形にすると、パラメータが増えてもscene componentの型と`sceneSettings`を更新するだけで済みます。sceneごとのpanel componentは不要です。

## Scene Registry

`src/scenes/scenes.json`は、アプリで選べるsceneの薄い一覧です。各JSON定義は次の項目だけを持ちます。`src/scenes/registry.ts`はJSONを読み、`module`に対応するtsxファイルを`import.meta.glob`で解決し、sceneファイルの`sceneSettings`と結合します。

- `id`: scene selector用の一意なID
- `title`: sidebarに表示する名前
- `description`: sidebarに表示する説明
- `module`: `Scene` componentをexportするsceneファイルへの相対パス

各sceneファイルは次をexportします。

- `Scene`: `parameters`を受け取るReact component
- `sceneSettings`: `camera`、`lighting`、`initialParameters`、任意の`parameterControls`

新しいsceneを追加するときの最小手順は次の通りです。

1. `src/scenes/MyScene.tsx`に`Scene` componentを作る
2. `src/scenes/scenes.json`へscene定義を1件追加する
3. `npm run build`で型とbundleを確認する

## 新しいSDF Primitiveを追加する

ここからは、scene作者が新しい形状を組み込みprimitiveとして追加したいときの最小手順です。試作だけなら、まず`SdfFunction`でWGSLを直接渡す方が少ない変更で済みます。例として`SdfTorus`を追加します。

### 1. kind IDとcustom ID開始値を更新する

`src/nexusgpu/sdfKinds.ts`にprimitive名とIDを追加します。`SdfFunction`用の動的kind IDは`CUSTOM_SDF_PRIMITIVE_KIND_START`以降を使うため、新しい組み込みprimitiveのIDと重ならないように開始値も更新します。

```ts
export const SDF_PRIMITIVE_KIND_IDS = {
  sphere: 0,
  box: 1,
  cylinder: 2,
  torus: 3,
  ellipsoid: 4,
} as const;

export const CUSTOM_SDF_PRIMITIVE_KIND_START = 5;
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
  const target = useSdfSceneNodeTarget();
  const id = useStableId();

  useEffect(() => {
    const normalizedMajorRadius = Math.max(0.001, majorRadius);
    const normalizedMinorRadius = Math.max(0.001, minorRadius);
    const node: SdfNode = {
      id,
      kind: "torus",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([normalizedMajorRadius, normalizedMinorRadius, 0, 0]),
      smoothness: clamp(smoothness, 0, 2),
      bounds: createTorusBounds(position, normalizedMajorRadius, normalizedMinorRadius),
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [color, id, majorRadius, minorRadius, position, rotation, smoothness, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return null;
}
```

この例では`data0.x`にmajor radius、`data0.y`にminor radiusを入れています。`bounds`はグループのbounding sphere計算に使うCPU側メタデータです。GPU側のWGSLでも同じ半径値を読みます。

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

### 5. mapScene生成に距離式を追加する

`src/nexusgpu/WebGpuSdfRenderer.ts`の`createPrimitiveDistanceExpression()`で、新しいprimitive種別に対応するSDF関数呼び出しを追加します。`mapScene()`はシーン木からリニアに展開されるため、WGSL側でkind ID分岐を追加する必要はありません。

```ts
if (node.kind === "sphere") {
  return `sdSphere(${localPointName}, ${objectName}.data0.x)`;
}

if (node.kind === "box") {
  return `sdBox(${localPointName}, ${objectName}.data0.xyz)`;
}

if (node.kind === "torus") {
  return `sdTorus(${localPointName}, ${objectName}.data0.xy)`;
}
```

`SdfFunction`の場合は、レンダラが関数文字列ごとに`customSdfFunction0`のような関数名を割り当て、展開済み`mapScene()`内から直接呼び出します。

### 6. exportを追加する

`src/nexusgpu/index.ts`から新しいcomponentとprops型をexportします。

```ts
export {
  SdfBox,
  SdfCylinder,
  SdfEllipsoid,
  SdfFunction,
  SdfGroup,
  SdfNot,
  SdfSphere,
  SdfSubtract,
  SdfTorus,
} from "./primitives";

export type {
  SdfCylinderProps,
  SdfEllipsoidProps,
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
- `primitives.tsx`でpropsを正規化し、`SdfNode.data`と`bounds`へ必要な値を入れた
- `primitives.tsx`で`upsertSceneNode(id, { type: "primitive", node, bounds })`と`removeSceneNode(id)`を使って登録・解除した
- `shaderLibrary.ts`にWGSL関数を追加した
- `sdfPrimitivesShader.ts`でWGSLチャンクをincludeした
- `WebGpuSdfRenderer.ts`の`createPrimitiveDistanceExpression()`で距離計算を追加した
- `index.ts`からcomponentと型をexportした
- scene内で新しいcomponentをimportして描画確認した

## 制限

- 現在のSDF object数上限は`MAX_SDF_OBJECTS = 128`
- `SdfGroup`を使わないフラットなsceneは全objectをunion評価する
- `SdfGroup`を使うsceneは、レンダラがシーン木をWGSLの`mapScene()`へ展開して`or`、`and`、`subtract`、`not`を評価する
- primitiveごとの追加データは`data0`, `data1`, `data2`の`vec4` 3本まで
- `SdfFunction`の関数文字列セットが変わるとShader Module / Render Pipelineを再生成する
- ユニークな`SdfFunction`が増えるほど生成されるGPU側関数と`mapScene()`内の直接呼び出しが増える
- `rotation`はquaternionで指定する
- SDF primitiveはDOMを描画しないため、CSSでは見た目を変更できない
