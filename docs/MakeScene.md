# Scene作成ガイド

このドキュメントは、NexusGPUでsceneを作るユーザ向けのガイドです。内部構造の詳細は扱わず、既存のSDF primitiveを使ってsceneを組み立てる方法と、新しいSDF primitiveを追加して使えるようにする手順を説明します。

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
import type { NexusSceneCanvasProps } from "./types";

type SimpleSceneProps = {
  canvasProps: NexusSceneCanvasProps;
};

export function Scene({ canvasProps }: SimpleSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 1.4, 5], target: [0, 0, 0], fov: 48 }}
      background={{ yPositive: [0.02, 0.025, 0.028], yNegative: [0.12, 0.16, 0.17] }}
      orbitControls
    >
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

sceneファイルは通常`src/scenes/`に置きます。現在のデモでは、scene本体、`NexusCanvas`のカメラ、ライト、背景、必要ならscene固有パラメータを1つのファイルにまとめています。

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
| `SdfModifier` | 子SDFの評価前後にWGSL modifierを差し込む | `preset`, `preModifierFunction`, `postModifierFunction`, `data0`, `data1`, `data2`, `bounds`, `children` |

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
- `SdfModifier.preset`: `"twistY"`、`"preRepeat"`、`"postInflate"`、`"postOnion"`、またはそれらの配列
- `SdfModifier.preModifierFunction`: 子SDFを評価する前に`point`を加工するWGSL
- `SdfModifier.postModifierFunction`: 子SDFを評価した後に`hit.distance`や`hit.color`を加工するWGSL
- `SdfModifier.data0`, `data1`, `data2`: modifier関数へ渡す`vec4<f32>`相当の追加データ
- `SdfModifier.bounds`: modifier nodeに保持する`{ radius, center }`。現状はGPU枝刈りには使わない

## SdfFunctionでWGSLを直接使う

`SdfFunction`は、専用componentを追加せずにscene内でSDFを試すためのprimitiveです。`sdfFunction`にはWGSL文字列を渡します。関数body / 式として渡す場合、関数内で使える引数は次の6つです。

```wgsl
point: vec3<f32>
data0: vec4<f32>
data1: vec4<f32>
data2: vec4<f32>
color: vec3<f32>
smoothness: f32
```

`point`はオブジェクトの`position`と`rotation`を適用済みのローカル座標です。つまりSDF関数内では、原点中心の形状として距離を計算します。`color`と`smoothness`は`SdfFunction`の同名propから渡されます。

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

色もWGSL内で決めたい場合は、`SceneHit(distance, color, smoothness)`を返します。

```tsx
<SdfFunction
  sdfFunction={/* wgsl */ `
    let distance = length(point) - data0.x;
    let stripe = 0.5 + 0.5 * sin(point.y * data1.x);
    let painted = mix(color, data2.rgb, stripe);
    return SceneHit(distance, painted, smoothness);
  `}
  data0={[0.8, 0, 0, 0]}
  data1={[18, 0, 0, 0]}
  data2={[0.1, 0.35, 1.0, 0]}
  color={[0.9, 0.18, 0.38]}
/>
```

WGSL関数全体を渡す場合は、`sdfFunction`という名前で定義できます。レンダラ内部では安全に別名へ差し替えられます。既存の4引数で`f32`を返す形式もそのまま使えます。ベース色を受け取りたい場合は5番目の引数に`color`、smoothnessも受け取りたい場合は6番目の引数に`smoothness`を追加し、色つきの結果を返したい場合は戻り値を`SceneHit`にします。

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

## SdfModifierでpointやdistanceを加工する

`SdfModifier`は、childrenのSDF評価前後にWGSL関数を差し込むcomponentです。childrenはprimitiveでも`SdfGroup`でも構いません。pre modifierは子ツリーへ渡す`point`を加工し、post modifierは子ツリー全体を評価した後の`hit`を加工します。

pre modifierの関数body / 式では、次の引数を使えます。

```wgsl
point: vec3<f32>
data0: vec4<f32>
data1: vec4<f32>
data2: vec4<f32>
```

pre modifierは`vec3<f32>`を返します。

```tsx
import { SdfModifier, SdfSphere } from "../nexusgpu";

export function WavySphereScene() {
  return (
    <SdfModifier
      preModifierFunction={/* wgsl */ `
        let wave = sin(point.y * data0.x) * data0.y;
        return point + vec3<f32>(wave, 0.0, 0.0);
      `}
      data0={[8.0, 0.12, 0, 0]}
    >
      <SdfSphere radius={0.8} />
    </SdfModifier>
  );
}
```

post modifierの関数body / 式では、次の引数を使えます。

```wgsl
hit: SceneHit
point: vec3<f32>
data0: vec4<f32>
data1: vec4<f32>
data2: vec4<f32>
```

post modifierは`f32`または`SceneHit`を返します。`f32`を返す場合、色とsmoothnessは元の`hit`から引き継がれます。

```tsx
<SdfModifier
  postModifierFunction={/* wgsl */ `
    return hit.distance - data0.x;
  `}
  data0={[0.08, 0, 0, 0]}
>
  <SdfBox size={[1, 1, 1]} />
</SdfModifier>
```

色も変えたい場合は`SceneHit`を返します。

```tsx
<SdfModifier
  postModifierFunction={/* wgsl */ `
    let stripe = 0.5 + 0.5 * sin(point.y * data0.y);
    let painted = mix(hit.color, data1.rgb, stripe);
    return SceneHit(hit.distance - data0.x, painted, hit.smoothness);
  `}
  data0={[0.04, 18.0, 0, 0]}
  data1={[1.0, 0.2, 0.1, 0]}
>
  <SdfSphere radius={0.8} />
</SdfModifier>
```

preとpostは同じ`SdfModifier`で同時に指定できます。評価順はpre、children、postです。

```tsx
<SdfModifier
  preModifierFunction="return point + vec3<f32>(sin(point.y * data0.x) * data0.y, 0.0, 0.0);"
  postModifierFunction="return hit.distance - data1.x;"
  data0={[8.0, 0.12, 0, 0]}
  data1={[0.05, 0, 0, 0]}
>
  <SdfSphere radius={0.8} />
</SdfModifier>
```

WGSL関数全体を渡すこともできます。preの関数全体は次のシグネチャにします。

```wgsl
fn bendX(
  point: vec3<f32>,
  data0: vec4<f32>,
  data1: vec4<f32>,
  data2: vec4<f32>
) -> vec3<f32> {
  return vec3<f32>(point.x, point.y + sin(point.x * data0.x) * data0.y, point.z);
}
```

postの関数全体は次のシグネチャにします。

```wgsl
fn shell(
  hit: SceneHit,
  point: vec3<f32>,
  data0: vec4<f32>,
  data1: vec4<f32>,
  data2: vec4<f32>
) -> SceneHit {
  return SceneHit(abs(hit.distance) - data0.x, hit.color, hit.smoothness);
}
```

組み込みpresetは次の4つです。presetはpre/postの片方だけでなく、両方を持つ場合があります。

| preset | 種類 | 内容 | 主なdata |
| --- | --- | --- | --- |
| `"twistY"` | pre + post | Y軸方向にtwistし、postで距離を変形率に合わせて補正する | `data0.x`: twist強度 |
| `"preRepeat"` | pre | 空間を繰り返す | `data0.xyz`: cellサイズ |
| `"postInflate"` | post | 距離を外側へ膨らませる | `data0.x`: 膨張量 |
| `"postOnion"` | post | 表面を殻状にする | `data0.x`: 厚み |

`"twistY"`のpost補正は、元の評価点のXZ半径と`data0.x`から局所的な伸びを見積もり、`hit.distance`を割ってレイマーチングが表面を飛び越えにくいようにします。

```wgsl
let radial = length(point.xz);
let stretch = sqrt(1.0 + data0.x * data0.x * radial * radial);
return hit.distance / max(stretch, 1.0);
```

`preset`は配列でも指定できます。同じ位置に複数presetが関数を持つ場合は、先に指定したpresetが使われます。同じ位置に対して`preModifierFunction`や`postModifierFunction`を明示した場合は、明示関数がpresetより優先されます。

```tsx
<SdfModifier preset={["preRepeat", "postInflate"]} data0={[1.2, 1.2, 1.2, 0]}>
  <SdfGroup op="or">
    <SdfSphere radius={0.7} />
    <SdfBox position={[0.8, 0, 0]} size={[0.8, 0.8, 0.8]} />
  </SdfGroup>
</SdfModifier>
```

`"twistY"`は1つのpresetでpre/postの両方を持つため、通常は単体で指定します。

```tsx
<SdfModifier preset="twistY" data0={[0.5, 0, 0, 0]}>
  <SdfBox size={[1, 1, 1]} />
</SdfModifier>
```

`SdfModifier.bounds`はnodeに保持されますが、現在のrendererはboundsによるGPU枝刈りをまだ行っていません。将来の枝刈りや空間分割用のメタデータとして扱ってください。任意pre modifierは評価空間を曲げるため、将来bounds枝刈りを有効にする場合も自動推定せず、modifier側で保守的なboundsを指定する方針です。

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

sceneファイルは`Scene`という名前のReact component、初期パラメータ、slider定義をexportします。初期パラメータとslider定義は`defineSceneParameterControls`でまとめて定義できます。`Scene` componentは`NexusCanvas`を返し、そのpropsにscene固有のカメラ、ライト、背景、`orbitControls`を書きます。`App.tsx`は個別sceneを直接importせず、`src/scenes/scenes.json`に登録された`module`を`registry.ts`が解決して表示します。

```tsx
import { NexusCanvas, SdfBox, SdfSphere } from "../nexusgpu";
import { defineSceneParameterControls } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  { sphereSmoothness: 0.4 },
  [
    {
      key: "sphereSmoothness",
      name: "Sphere smoothness",
      min: 0,
      max: 1.5,
      step: 0.05,
    },
  ],
);

export type MySceneParameters = typeof initialParameters;

type MySceneProps = {
  parameters: MySceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

function SceneContent({ parameters }: { parameters: MySceneParameters }) {
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

export function Scene({ parameters, canvasProps }: MySceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [0, 2.8, 5.2], target: [0, 0, 0], fov: 48 }}
      lighting={{ direction: [0.25, 0.85, 0.35] }}
      background={{ yPositive: [0.03, 0.05, 0.08], yNegative: [0.16, 0.18, 0.2] }}
      orbitControls
    >
      <SceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
```

`background`は未ヒット時の背景色です。`yPositive`がレイ方向のY+側、`yNegative`がY-側の色で、レンダラはこの2色を`direction.y`に応じてグラデーションします。色はprimitiveの`color`と同じRGBの`[r, g, b]`で、各値はおおむね`0.0`から`1.0`で指定します。

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

`App.tsx`は`SCENES`の選択中定義から`Component`、`initialParameters`、`parameterControls`を読みます。sceneを差し替えるために`App.tsx`のimportやJSXを書き換える必要はありません。

## Sceneの動的な値

アニメーションやUI操作で値を変える場合も、考え方は通常のReactと同じです。`useFrame`やpanel入力からReact stateを更新し、そのstateをprimitiveのpropsへ渡します。GPU objectを直接変更する命令型APIとして扱う必要はありません。

```tsx
import { useState } from "react";
import { SdfSphere, useFrame } from "../nexusgpu";
import type { Vec3 } from "../nexusgpu";

function FloatingSphere() {
  const [position, setPosition] = useState<Vec3>([0, 0, 0]);

  useFrame(({ elapsed }) => {
    setPosition([0, Math.sin(elapsed * 1.5) * 0.35, 0]);
  });

  return <SdfSphere position={position} radius={0.7} color={[0.05, 0.74, 0.7]} />;
}
```

scene固有パラメータをsidebarから変更したい場合は、sceneファイルで`defineSceneParameterControls`を使って`initialParameters`と`parameterControls`をexportします。`key`は初期値objectに存在するnumber型のプロパティを指定します。

```ts
export const { initialParameters, parameterControls } = defineSceneParameterControls(
  { sphereSmoothness: 0.4 },
  [
    {
      key: "sphereSmoothness",
      name: "Sphere smoothness",
      min: 0,
      max: 1.5,
      step: 0.05,
    },
  ],
);

export type MySceneParameters = typeof initialParameters;
```

### useCamera / useLighting

カメラやライトをscene内のcomponentから動かしたい場合は、`NexusCanvas`の内側で`useCamera()`や`useLighting()`を使います。どちらも`set()`だけを持つ小さなAPIを返し、`SceneStore`へ新しい設定を反映します。

- `useCamera().set(camera)`: `position`、`target`、`fov`などを更新する
- `useLighting().set(lighting)`: `direction`などを更新する

`useFrame`と組み合わせると、時間に応じてカメラやライトを動かせます。

```tsx
import { SdfSphere, useCamera, useFrame, useLighting } from "../nexusgpu";

function MovingViewContent() {
  const camera = useCamera();
  const lighting = useLighting();

  useFrame(({ elapsed }) => {
    camera.set({
      position: [Math.sin(elapsed * 0.3) * 4, 1.4, Math.cos(elapsed * 0.3) * 4],
      target: [0, 0, 0],
      fov: 48,
    });

    lighting.set({
      direction: [Math.sin(elapsed * 0.6), 0.8, Math.cos(elapsed * 0.6)],
    });
  });

  return <SdfSphere radius={1} color={[0.05, 0.74, 0.7]} />;
}
```

`useCamera()`や`useLighting()`は`NexusCanvas`の外では使えません。`Scene` component自体で`NexusCanvas`を返す場合は、その内側に`SceneContent`のような子componentを置き、そこでhookを呼びます。

```tsx
export function Scene({ canvasProps }: MySceneProps) {
  return (
    <NexusCanvas {...canvasProps} orbitControls={false}>
      <MovingViewContent />
    </NexusCanvas>
  );
}
```

継続的にカメラを動かすsceneでは、ユーザー操作用の`orbitControls`と制御が競合しやすくなります。スクリプトでカメラを制御するsceneでは、基本的に`orbitControls={false}`にします。

`App.tsx`はscene定義を読み込んで、現在のパラメータと共通の`canvasProps`を`Scene` componentへ渡します。scene作者は基本的に、sceneファイル内で`Scene`、必要な初期パラメータ、slider定義を用意し、`scenes.json`へ登録すれば十分です。初期パラメータとslider定義は`defineSceneParameterControls`でまとめて書けます。

## 追加手順のまとめ

1. `src/scenes/MyScene.tsx`に`Scene` componentを作る
2. 必要なら同じファイルで`defineSceneParameterControls`を使い、`initialParameters`と`parameterControls`をexportする
3. `src/scenes/scenes.json`へscene定義を1件追加する
4. `npm run build`で型とbundleを確認する

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
