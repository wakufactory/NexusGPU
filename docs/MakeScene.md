# Scene作成ガイド

このドキュメントは、NexusGPUでsceneを作るユーザ向けのガイドです。内部構造の詳細は扱わず、既存のSDF primitiveを使ってsceneを組み立てる方法を説明します。新しい組み込みSDF primitiveを追加する実装手順は`docs/architecture.md`にまとめています。

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
| `SdfSphere` | 球 | `active`, `position`, `rotation`, `radius`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfBox` | 箱 | `active`, `position`, `rotation`, `size`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfCylinder` | 円柱 | `active`, `position`, `rotation`, `radius`, `height`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfCone` | 円錐・円錐台 | `active`, `position`, `rotation`, `topRadius`, `bottomRadius`, `height`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfCapsule` | capsule・任意軸円柱 | `active`, `position`, `rotation`, `top`, `bottom`, `radius`, `round`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfTorus` | トーラス | `active`, `position`, `rotation`, `majorRadius`, `minorRadius`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfEllipsoid` | 楕円球 | `active`, `position`, `rotation`, `radii`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfTetrahedron` | 正四面体 | `active`, `position`, `rotation`, `radius`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfOctahedron` | 正八面体 | `active`, `position`, `rotation`, `radius`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfDodecahedron` | 正十二面体 | `active`, `position`, `rotation`, `radius`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfIcosahedron` | 正二十面体 | `active`, `position`, `rotation`, `radius`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfFunction` | WGSL文字列で定義する汎用SDF | `active`, `position`, `rotation`, `sdfFunction`, `data0`, `data1`, `data2`, `bounds`, `color`, `smoothness`, `material`, `materialUniform` |
| `SdfGroup` | 子SDFのboolean合成 | `active`, `op`, `position`, `rotation`, `smoothness`, `material`, `materialUniform`, `children` |
| `SdfNot` | 子SDFの内外反転 | `active`, `children` |
| `SdfSubtract` | 1つ目の子から後続の子を差し引く | `active`, `children` |
| `SdfModifier` | 子SDFの評価前後にWGSL modifierを差し込む | `active`, `preset`, `preModifierFunction`, `postModifierFunction`, `data0`, `data1`, `data2`, `bounds`, `children` |

共通props:

- `position`: `[x, y, z]`。省略時は`[0, 0, 0]`
- `active`: `false`を指定すると、そのprimitive / groupはscene graphへ登録されず、rendererやshader生成から完全に除外される。`SdfModifier`ではmodifier機能だけを停止し、子SDFを通常の`op="or"` groupとして扱う。省略時は`true`
- `rotation`: quaternionの`[x, y, z, w]`。省略時は回転なし
- `color`: RGBの`[r, g, b]`。各値はおおむね`0.0`から`1.0`
- `smoothness`: 他のSDFと滑らかに結合する強さ。`0`なら通常のmin合成
- `material`: primitiveまたはgroupに適用するmaterial。preset名またはcustom WGSLを指定する
- `materialUniform`: material WGSLへ渡す`vec4<f32>`相当の追加データ

primitive固有props:

- `SdfSphere.radius`: 球の半径
- `SdfBox.size`: 幅、高さ、奥行きのフルサイズ
- `SdfCylinder.radius`: 円柱の半径
- `SdfCylinder.height`: Y軸方向のフル高さ
- `SdfCone.topRadius`: 上端の半径
- `SdfCone.bottomRadius`: 下端の半径
- `SdfCone.height`: Y軸方向のフル高さ
- `SdfCapsule.top`: 上端中央のローカル座標
- `SdfCapsule.bottom`: 下端中央のローカル座標
- `SdfCapsule.radius`: capsuleまたは円柱の半径
- `SdfCapsule.round`: capの丸み。`0`なら平面キャップの円柱、`0.5`なら浅い丸み、`1`以上なら半球capのcapsule
- `SdfTorus.majorRadius`: 原点からチューブ中心までの半径
- `SdfTorus.minorRadius`: チューブ自体の半径
- `SdfEllipsoid.radii`: X/Y/Z各軸の半径
- `SdfTetrahedron.radius`, `SdfOctahedron.radius`, `SdfDodecahedron.radius`, `SdfIcosahedron.radius`: 中心から頂点までの半径
- `SdfFunction.sdfFunction`: WGSLのSDF関数文字列、または関数body / 式
- `SdfFunction.data0`, `data1`, `data2`: WGSL側へそのまま渡す`vec4<f32>`相当の追加データ
- `SdfFunction.bounds`: グループbounds計算用の`{ radius, center }`。任意WGSLの形状推定が必要な場合に指定する
- `SdfGroup.op`: `"or"`、`"and"`、`"subtract"`、`"not"`のいずれか。省略時は`"or"`
- `SdfGroup.position`, `rotation`: 子SDF全体の評価空間を移動・回転する。`rotation`省略時はprimitiveと同じくquaternion回転計算を生成しない
- `SdfGroup.material`: groupの合成結果全体に適用するmaterial。未指定なら子のmaterialを引き継ぐ
- `SdfModifier.preset`: `"twistY"`、`"preRepeat"`、`"preScale"`、`"postInflate"`、`"postOnion"`、`"postMix"`、またはそれらの配列
- `SdfModifier.preModifierFunction`: 子SDFを評価する前に`point`を加工するWGSL
- `SdfModifier.postModifierFunction`: 子SDFを評価した後に`hit.distance`や`hit.color`を加工するWGSL
- `SdfModifier.data0`, `data1`, `data2`: modifier関数へ渡す`vec4<f32>`相当の追加データ
- `SdfModifier.bounds`: modifier nodeに保持する`{ radius, center }`。現状はGPU枝刈りには使わない

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

現在の実装では、グループ構造はGPU上で命令列として解釈されず、レンダラがWGSLの`mapSceneDistance()` / `mapSceneEval()`へ展開します。そのため数十object程度のsceneでは軽く動きますが、`op`やグループ構成を変更するとShader Module / Render Pipelineの再生成が発生します。グループの`smoothness`はStorage Buffer上の動的値として扱われるため、primitiveの`position`、`rotation`、`radius`、`size`、`color`、`data0-2`などと同じく、値だけの変更なら再生成は不要です。

`SdfFunction`をグループに含める場合は、必要に応じて`bounds`を指定してください。現在はGPU側の枝刈りには使っていませんが、グループのbounding sphereメタデータとして保持されます。

```tsx
<SdfFunction
  sdfFunction="return length(point / data0.xyz) - 1.0;"
  data0={[0.7, 0.5, 0.25, 0]}
  bounds={{ radius: 0.8 }}
/>
```

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

色もWGSL内で決めたい場合は、`SceneHit(distance, color, smoothness, localPoint)`を返します。`localPoint`はmaterial shaderへ渡すローカル座標です。

```tsx
<SdfFunction
  sdfFunction={/* wgsl */ `
    let distance = length(point) - data0.x;
    let stripe = 0.5 + 0.5 * sin(point.y * data1.x);
    let painted = mix(color, data2.rgb, stripe);
    return SceneHit(distance, painted, smoothness, point);
  `}
  data0={[0.8, 0, 0, 0]}
  data1={[18, 0, 0, 0]}
  data2={[0.1, 0.35, 1.0, 0]}
  color={[0.9, 0.18, 0.38]}
/>
```

解析的なgradientを返せる場合は、`sceneEvalWithGrad(distance, color, smoothness, localPoint, grad, materialId, materialUniform)`を返します。`grad`はworld変換前の`SdfFunction`内ではローカル座標系のgradientです。通常はmaterial情報をprimitive propsから引き継ぐため、最後の2引数には`0.0`と`vec4<f32>(0.0)`を入れておけば十分です。これを返すと、最終hitがその評価結果を使う場合に法線計算の有限差分fallbackを避けられます。

```tsx
<SdfFunction
  sdfFunction={/* wgsl */ `
    let distance = length(point) - data0.x;
    let grad = normalize(point);
    return sceneEvalWithGrad(distance, color, smoothness, point, grad, 0.0, vec4<f32>(0.0));
  `}
  data0={[0.8, 0, 0, 0]}
/>
```

WGSL関数全体を渡す場合は、`sdfFunction`という名前で定義できます。レンダラ内部では安全に別名へ差し替えられます。既存の4引数で`f32`を返す形式もそのまま使えます。ベース色を受け取りたい場合は5番目の引数に`color`、smoothnessも受け取りたい場合は6番目の引数に`smoothness`を追加し、色つきの結果を返したい場合は戻り値を`SceneHit`、gradientつきの結果を返したい場合は戻り値を`SceneEval`にします。

`SdfFunction`の返却形式は次の3種類です。

| 戻り値 | 用途 | normal |
| --- | --- | --- |
| `f32` | 距離だけを返す最軽量形式 | 有限差分fallback |
| `SceneHit` | 距離、色、smoothness、material用`localPoint`を返す | 有限差分fallback |
| `SceneEval` | `SceneHit`相当の情報に加えてgradientを返す | `gradInfo`が有効なら解析的gradientを使用 |

raymarch中は軽量な`mapSceneDistance()`が使われ、hit後のmaterial/normal取得時だけ`mapSceneEval()`が使われます。ただし`SdfFunction`が`SceneEval`を返す場合、距離だけを取り出すためにdistance pathでもその関数を呼びます。重い数値微分gradientを`SceneEval`内に埋め込むとraymarch中にも走るため、`SceneEval`は安くgradientを出せる関数向けです。

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

同じ`sdfFunction`文字列を複数objectで使う場合は、同じGPU側関数が共有されます。異なる`sdfFunction`文字列が増えると、シェーダの再生成と展開済みscene map内の直接呼び出し先が増えるため、頻繁に変わる値は関数文字列に埋め込まず`data0-2`で渡してください。

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
    return SceneHit(hit.distance - data0.x, painted, hit.smoothness, hit.localPoint);
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
  return SceneHit(abs(hit.distance) - data0.x, hit.color, hit.smoothness, hit.localPoint);
}
```

組み込みpresetは次の6つです。presetはpre/postの片方だけでなく、両方を持つ場合があります。

| preset | 種類 | 内容 | 主なdata |
| --- | --- | --- | --- |
| `"twistY"` | pre + post | Y軸方向にtwistし、postで距離を変形率に合わせて補正する | `data0.x`: twist強度 |
| `"preRepeat"` | pre | 空間を繰り返す。cellサイズが0の軸は繰り返さない | `data0.xyz`: cellサイズ |
| `"preScale"` | pre + post | 子SDFへ渡す評価点をXYZ軸ごとにスケーリングし、postで距離を安全側に補正する | `data0.xyz`: scale |
| `"postInflate"` | post | 距離を外側へ膨らませる | `data0.x`: 膨張量 |
| `"postOnion"` | post | 表面を殻状にする | `data0.x`: 厚み |
| `"postMix"` | post | 先頭2 childrenのdistanceをratioで線形補間する | `data0.x`: ratio `0..1` |

`"preScale"`は`point / data0.xyz`で子SDFを評価します。たとえば`data0={[2, 1, 1, 0]}`ならX方向に2倍へ伸びた形状になります。uniform scaleではpost補正後の距離も厳密です。非一様scaleでは完全なSDF距離には戻らないため、postでは`min(abs(data0.x), abs(data0.y), abs(data0.z))`を掛けてレイマーチング安全側に補正します。

`"postMix"`はchildrenがちょうど2つ必要です。`data0.x`を`clamp(..., 0.0, 1.0)`したratioとして、distance pathでは`mix(child0.distance, child1.distance, ratio)`を返します。eval pathでは色とsmoothnessも同じratioでmixし、materialとlocalPointはratioが0.5未満なら1つ目、0.5以上なら2つ目を使います。

```tsx
<SdfModifier preset="postMix" data0={[0.35, 0, 0, 0]}>
  <SdfSphere radius={0.8} color={[1, 0.2, 0.1]} />
  <SdfBox size={[1.2, 1.2, 1.2]} color={[0.1, 0.5, 1]} />
</SdfModifier>
```

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

`SdfModifier.data0`、`data1`、`data2`はStorage Bufferへ入るため、値だけを変えた場合はShader Module / Render Pipelineを作り直しません。`preset`、`preModifierFunction`、`postModifierFunction`、children構造が変わった場合は、生成される`mapSceneDistance()` / `mapSceneEval()`やcustom WGSL関数が変わるためpipeline再生成が発生します。

## Materialを使う

materialはprimitiveまたは`SdfGroup`へ指定できます。primitiveに指定したmaterialはそのprimitiveがhitしたときに使われます。groupに指定したmaterialは、子SDFをboolean合成した後の結果全体に適用されます。groupの`material`を省略した場合は、hitした子のmaterialを引き継ぎます。

```tsx
<SdfGroup op="or" smoothness={0.2} material="normal">
  <SdfSphere position={[-0.4, 0, 0]} radius={0.7} color={[0.05, 0.74, 0.7]} />
  <SdfBox position={[0.4, 0, 0]} size={[1, 1, 1]} color={[0.95, 0.55, 0.18]} />
</SdfGroup>
```

使えるpresetは次の通りです。

| preset | 内容 |
| --- | --- |
| `"default"` | 標準のambient / diffuse / shadow material。`material`未指定時もこれを使う |
| `"normal"` | 法線をRGB色として表示するdebug material |
| `"pbr"` | 簡易Cook-Torrance PBR material。`materialUniform`でmetallic / roughness / specular / ambientを調整する |
| `"texture0Color"` | `texture0`を`localPoint.xz`でsampleし、primitiveの`color`と掛け合わせる |
| `"texture0Matcap"` | view-space normalから`texture0`をmatcapとしてsampleし、primitiveの`color`と掛け合わせる |

`"pbr"`では`materialUniform`を`[metallic, roughness, specular, ambient]`として使います。未指定または0の場合、roughnessは`0.48`、specularは`0.5`、ambientは`0.28`として扱います。

`"texture0Color"`では`materialUniform`をUV調整に使えます。`materialUniform.x`がscale、`materialUniform.yz`がoffsetです。

```tsx
<NexusCanvas
  {...canvasProps}
  textures={[
    {
      src: `${import.meta.env.BASE_URL}assets/tex1024.png`,
      addressModeU: "repeat",
      addressModeV: "repeat",
      magFilter: "linear",
      minFilter: "linear",
    },
  ]}
>
  <SdfSphere
    radius={0.8}
    color={[1, 0.8, 0.6]}
    material="texture0Color"
    materialUniform={[2.0, 0.1, 0.0, 0.0]}
  />
</NexusCanvas>
```

custom materialを直接WGSLで書く場合は、`material={{ wgsl }}`を指定します。WGSL側は任意の関数名で、`MaterialInput`を受け取り`vec3<f32>`を返します。レンダラ内部で関数名は自動的に差し替えられるため、同じscene内で関数名が重複しても問題ありません。安定した識別子を付けたい場合は`key`も指定できます。

```tsx
const STRIPE_MATERIAL = /* wgsl */ `
fn stripeMaterial(input: MaterialInput) -> vec3<f32> {
  let stripe = step(0.5, fract(input.localPoint.y * input.materialUniform.x));
  let base = mix(input.color, vec3<f32>(1.0, 0.95, 0.55), stripe);
  let lightDirection = normalize(camera.lightInfo.xyz);
  let diffuse = max(dot(input.normal, lightDirection), 0.0);
  return base * (0.35 + diffuse * 0.85);
}
`;

<SdfBox
  size={[1, 1, 1]}
  color={[0.1, 0.45, 0.95]}
  material={{ key: "stripe", wgsl: STRIPE_MATERIAL }}
  materialUniform={[12, 0, 0, 0]}
/>
```

`MaterialInput`で使える値は次の通りです。

| field | 内容 |
| --- | --- |
| `color` | primitiveまたは`SdfFunction`が返したhit color |
| `normal` | world space normal。解析的gradientがない場合は有限差分で推定される |
| `cam` | ray origin。通常はカメラ位置 |
| `localPoint` | hitしたprimitiveまたはSDF関数が返したlocalPoint |
| `worldPoint` | hitしたworld座標 |
| `rayDirection` | fragmentから飛ばしたray direction |
| `distance` | ray originからhit点までの深度 |
| `materialUniform` | React propsの`materialUniform` |

custom materialからtextureを参照する場合は、`NexusCanvas.textures`に画像を渡し、WGSL内で`texture0-3`と`sampler0-3`を使います。raymarch後の分岐内で動くため、sampleは`textureSampleLevel(..., 0.0)`を使ってください。

```wgsl
fn texturedMaterial(input: MaterialInput) -> vec3<f32> {
  let uv = fract(input.localPoint.xz * input.materialUniform.x + input.materialUniform.yz);
  let albedo = textureSampleLevel(texture0, sampler0, uv, 0.0).rgb;
  return albedo * input.color;
}
```

materialのWGSL文字列、preset種別、scene tree構造が変わるとShader Module / Render Pipelineを再生成します。`materialUniform`の値だけを変える場合はStorage Buffer更新だけで済みます。アニメーションやUI sliderで頻繁に変える値は、WGSL文字列へ埋め込まず`materialUniform`で渡してください。

## Textureを使う

sceneからWGSLへ画像を渡したい場合は、`NexusCanvas`の`textures`へ最大4枚まで指定します。シェーダ側では固定名の`texture0`、`texture1`、`texture2`、`texture3`と、対応する`sampler0`、`sampler1`、`sampler2`、`sampler3`を参照できます。

`public`フォルダ内の画像は、ビルド時に`assets`配下へ配置されます。たとえば`public/tex1024.png`は`${import.meta.env.BASE_URL}assets/tex1024.png`です。外部URLを使う場合は、必要に応じて`crossOrigin: "anonymous"`を指定します。ただし配信元がCORSを許可していない画像はブラウザ側で読み込めません。

```tsx
<NexusCanvas
  {...canvasProps}
  camera={{ position: [0, 2.8, 5.2], target: [0, 0, 0], fov: 48 }}
  textures={[
    {
      src: `${import.meta.env.BASE_URL}assets/tex1024.png`,
      addressModeU: "repeat",
      addressModeV: "repeat",
      magFilter: "linear",
      minFilter: "linear",
    },
    {
      src: "https://example.com/mask.png",
      crossOrigin: "anonymous",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "nearest",
      minFilter: "nearest",
    },
  ]}
>
  <SceneContent parameters={parameters} />
</NexusCanvas>
```

custom materialや`SdfFunction`内のWGSLでは、固定LODの`textureSampleLevel()`でsampleします。`textureSample()`は暗黙のmipmap level計算に画面上の微分を使うため、raymarchやhit分岐の中ではWGSLのuniform control flow制約に引っかかります。

```wgsl
let uv = fract(input.localPoint.xz * 0.25);
let albedo = textureSampleLevel(texture0, sampler0, uv, 0.0).rgb;
```

samplerはtextureごとに独立しています。`texture0`をlinear repeat、`texture1`をnearest clampにするような指定ができます。未指定のslotや読み込みに失敗したslotは白1pxのfallback textureになるため、`texture0-3`は常に参照可能です。

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

scene追加手順は次の通りです。

1. `src/scenes/MyScene.tsx`に`Scene` componentを作る
2. 必要なら同じファイルで`defineSceneParameterControls`を使い、`initialParameters`と`parameterControls`をexportする
3. `src/scenes/scenes.json`へscene定義を1件追加する
4. `npm run build`で型とbundleを確認する

## create-sceneスクリプトでsceneを追加する

新しいsceneは手作業でファイルと`scenes.json`を追加する代わりに、`scripts/create-scene.mjs`から作成できます。

```bash
npm run scene:create -- <scene-id-or-name> [title]
```

例:

```bash
npm run scene:create -- crystal-field "Crystal Field"
```

このコマンドは、既定では`sdf-experiment`をコピー元にして次の2つを行います。

1. `src/scenes/CrystalFieldScene.tsx`のようなsceneファイルを作成する
2. `src/scenes/scenes.json`へscene定義を追加する

コピー元sceneを指定したい場合は`--from`または`-f`を使います。指定値には`scenes.json`の`id`、`title`、`module`、ファイル名、component名ベースの名前を使えます。

```bash
npm run scene:create -- crystal-field "Crystal Field" --from simple-scene
npm run scene:create -- crystal-field "Crystal Field" --from SimpleScene.tsx
npm run scene:create -- crystal-field "Crystal Field" -f ./SimpleScene.tsx
```

コピー時には、コピー元ファイル名に含まれるscene名が新しいscene名へ置換されます。たとえば`SimpleScene.tsx`から`crystal-field`を作ると、`SimpleScene`という識別子は`CrystalFieldScene`へ置換されます。

既に同じscene idやmodule pathが`scenes.json`にある場合、または同名ファイルが存在する場合は失敗します。作成後は生成されたsceneファイルを編集し、必要に応じて`description`やparameter controlsを調整してください。

## 制限

- 現在のSDF object数上限は`MAX_SDF_OBJECTS = 128`
- `SdfGroup`を使わないフラットなsceneは全objectをunion評価する
- `SdfGroup`を使うsceneは、レンダラがシーン木をWGSLの`mapSceneDistance()` / `mapSceneEval()`へ展開して`or`、`and`、`subtract`、`not`を評価する
- primitiveごとの追加データは`data0`, `data1`, `data2`の`vec4` 3本まで
- `SdfFunction`の関数文字列セットが変わるとShader Module / Render Pipelineを再生成する
- ユニークな`SdfFunction`が増えるほど生成されるGPU側関数と展開済みscene map内の直接呼び出しが増える
- `rotation`はquaternionで指定する
