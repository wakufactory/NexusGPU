# AppからSceneまでのReact構成

このドキュメントは、NexusGPUのデモアプリをReactの使い方の視点で説明します。対象は`src/App.tsx`から`src/scenes/AnimatedSdfScene2.tsx`までの組み立て方です。

WebGPU、WGSL、シェーダーの詳細は扱いません。sceneをReactコンポーネントとして作り、stateとpropsで画面に反映する流れを中心にします。

## 全体像

NexusGPUの画面は、通常のReactアプリと同じように上から下へpropsを渡して組み立てます。

```tsx
createRoot(...)
  -> <App />
    -> <NexusCanvas camera={...} lighting={...} renderSettings={...}>
      -> <AnimatedSdfScene parameters={...} />
    -> <SceneParametersPanel ... />
    -> <RenderSettingsPanel ... />
```

重要なのは、sceneもReactコンポーネントだという点です。`<AnimatedSdfScene />`は特別なファイル形式ではなく、`props`を受け取り、`<SdfBox />`や`<SdfSphere />`を返す通常のReact componentです。

## main.tsx

`src/main.tsx`はReactアプリの入口です。

```tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

ここでは`App`をDOMへマウントするだけです。WebGPUの初期化やsceneの中身はここには置きません。

## App.tsxの役割

`src/App.tsx`はアプリ全体の組み立てとstateの配線を担当します。

主な責務:

- 画面レイアウトを作る
- render settingsのstateを持つ
- scene固有パラメータのstateを持つ
- `NexusCanvas`へcamera、lighting、render settingsを渡す
- scene componentへscene固有パラメータを渡す
- sidebarのpanelへ現在値と更新関数を渡す

現在の`App`は大きく分けると、viewportとsidebarの2領域を返します。

```tsx
return (
  <main>
    <section className="viewport">
      <NexusCanvas>
        <AnimatedSdfScene />
      </NexusCanvas>
    </section>
    <aside className="sidebar">
      <SceneParametersPanel />
      <RenderSettingsPanel />
    </aside>
  </main>
);
```

実際のコードでは、ここにフルスクリーンボタン、カメラ、ライト、state、更新関数が加わります。

## Appが持つstate

`App.tsx`は2種類のstateを持ちます。

```tsx
const [renderSettings, setRenderSettings] = useState(INITIAL_RENDER_SETTINGS);
const [sceneParameters, setSceneParameters] = useState(INITIAL_SCENE_PARAMETERS);
```

`renderSettings`はレンダリング品質や表示方式のような、`NexusCanvas`全体に関わる値です。これは`NexusCanvas`と`RenderSettingsPanel`へ渡します。

```tsx
<NexusCanvas renderSettings={renderSettings}>
  ...
</NexusCanvas>

<RenderSettingsPanel settings={renderSettings} onChange={setRenderSettings} />
```

`sceneParameters`は現在表示しているsceneのための値です。現在のsceneでは、球同士のなめらかな結合具合を表す`sphereSmoothness`を持ちます。

```tsx
<AnimatedSdfScene parameters={sceneParameters} />

<SceneParametersPanel
  parameters={sceneParameters}
  onChange={updateSceneParameters}
/>
```

Reactの考え方としては、UI panelが直接sceneを書き換えるのではありません。panelは更新関数を呼び、`App`のstateが変わり、そのstateがpropsとしてsceneへ渡り直されます。

## partial updateの形

scene固有パラメータの更新は、patchを受け取って現在値にmergeする形です。

```tsx
const updateSceneParameters = (patch: Partial<AnimatedSdfSceneParameters>) => {
  setSceneParameters((current) => ({ ...current, ...patch }));
};
```

この形にしておくと、scene parametersに項目が増えてもpanel側は変更したい値だけを渡せます。

```tsx
onChange({ sphereSmoothness: 0.4 });
```

Reactでは、親がstateを持ち、子はpropsとcallbackを受け取る形にすると、データの流れが一方向になります。NexusGPUのデモアプリもこの形です。

## NexusCanvasの使い方

`NexusCanvas`は、Reactツリーの中でsceneを表示するための領域です。

```tsx
<NexusCanvas
  camera={SCENE_CAMERA}
  lighting={SCENE_LIGHTING}
  orbitControls
  renderSettings={renderSettings}
>
  <AnimatedSdfScene parameters={sceneParameters} />
</NexusCanvas>
```

React視点では、`NexusCanvas`はchildrenを受け取るcomponentです。childrenに置いたscene componentは、`NexusCanvas`の内側で実行されます。

`camera`と`lighting`はsceneファイルからimportします。

```tsx
import {
  AnimatedSdfScene,
  INITIAL_SCENE_PARAMETERS,
  SCENE_CAMERA,
  SCENE_LIGHTING,
} from "./scenes/AnimatedSdfScene2";
```

sceneごとの見え方はscene側で定義し、`App`はそれを`NexusCanvas`へ渡すだけにします。こうすると、sceneを差し替えるときに`App`へプリミティブ配置の知識を持ち込まずに済みます。

## SceneはReact component

`src/scenes/AnimatedSdfScene2.tsx`のscene componentは、通常のReact componentとして定義されています。

```tsx
type AnimatedSdfSceneProps = {
  parameters: AnimatedSdfSceneParameters;
};

export function AnimatedSdfScene({ parameters }: AnimatedSdfSceneProps) {
  return (
    <>
      <SdfBox ... />
      <SdfSphere ... />
    </>
  );
}
```

scene componentはDOM要素を返す代わりに、`SdfBox`や`SdfSphere`のようなNexusGPUのprimitive componentを返します。

```tsx
<SdfBox
  position={[0, -0.06, 0]}
  size={[4.4, 0.12, 3.2]}
  color={[0.2, 0.23, 0.28]}
  smoothness={0.2}
/>
```

```tsx
<SdfSphere
  position={sphereProps.position}
  radius={sphereProps.radius}
  color={sphereProps.color}
  smoothness={sphereProps.smoothness}
/>
```

`SdfBox`や`SdfSphere`はReact componentなので、propsが変わればReactの通常の再レンダー対象になります。scene作者は、座標、色、半径、なめらかさをpropsとして組み立てればよいです。

## Scene固有の初期値をexportする

sceneファイルは、component本体だけでなく、sceneに必要な初期値もexportします。

```tsx
export const SCENE_CAMERA: Required<NexusCamera> = {
  position: [0, 3.7, 5.2],
  target: [0, 0, 0],
  fov: 48,
};

export const SCENE_LIGHTING: Required<NexusLighting> = {
  direction: [0.25, 0.85, 0.35],
};

export const INITIAL_SCENE_PARAMETERS: AnimatedSdfSceneParameters = {
  sphereSmoothness: 0.7,
};
```

この形にすると、`App.tsx`は「どのsceneを表示するか」と「そのsceneの初期値を使う」ことだけを知っていればよくなります。

sceneを追加する場合も、次のようなセットを用意するのが基本です。

- `SCENE_CAMERA`
- `SCENE_LIGHTING`
- `INITIAL_SCENE_PARAMETERS`
- `SceneComponent`

## AnimationもReact stateで扱う

`AnimatedSdfScene`では、球の位置を毎フレーム変えるために`useState`と`useFrame`を使います。

```tsx
const [spherePropsList, setSpherePropsList] = useState(() =>
  getSpherePropsList(0, parameters),
);

useFrame(({ elapsed }) => {
  setSpherePropsList(getSpherePropsList(elapsed, parameters));
});
```

`useFrame`は毎フレーム呼ばれるcallbackを登録するhookです。callback内では、経過時間から新しいpropsを計算し、React stateを更新します。

そのstateを使ってprimitiveを描画します。

```tsx
{spherePropsList.map((sphereProps, index) => (
  <SdfSphere
    key={index}
    position={sphereProps.position}
    radius={sphereProps.radius}
    color={sphereProps.color}
    smoothness={sphereProps.smoothness}
  />
))}
```

ここでも考え方はReactのままです。

1. 時間やUI入力から次のstateを作る
2. stateをpropsへ変換する
3. propsをprimitive componentへ渡す

GPU objectを直接操作する命令型APIとして考えるより、Reactのstateからsceneを再宣言する形で考えると分かりやすくなります。

## Scene内の計算を分ける

現在のsceneでは、球の軌道設定とprops生成をcomponentの外側に分けています。

```tsx
const ORBITING_SPHERES = [
  ...
];

function getOrbitPosition(...) {
  ...
}

function getSphereProps(...) {
  ...
}

function getSpherePropsList(...) {
  ...
}
```

これはReact componentを読みやすくするためです。component本体には、state、hook、returnするJSXを残し、座標計算や配列変換は通常の関数に逃がします。

sceneが大きくなった場合も、次のように分けると整理しやすくなります。

- 固定のscene設定
- 時間から座標を作る関数
- scene parametersからprimitive propsを作る関数
- JSXとしてprimitiveを並べるcomponent

## Panelとの接続

`SceneParametersPanel`は、registryの`parameterControls`からscene固有パラメータを編集するsliderを描画するUIです。

`App`からは現在値、slider定義、更新関数を渡します。

```tsx
<SceneParametersPanel
  parameters={sceneParameters}
  controls={activeScene.parameterControls ?? []}
  onChange={updateSceneParameters}
/>
```

panel側は、ユーザー操作に応じて定義された`key`の値を`onChange`へ渡します。

```tsx
onChange({ sphereSmoothness: nextValue });
```

その結果、`App`の`sceneParameters`が更新され、`AnimatedSdfScene`へ新しい`parameters`が渡されます。

流れは次の通りです。

```text
SceneParametersPanel
  -> onChange({ sphereSmoothness })
  -> AppのsceneParameters更新
  -> <AnimatedSdfScene parameters={sceneParameters} />
  -> <SdfSphere smoothness={parameters.sphereSmoothness} />
```

## Sceneを差し替えるときの考え方

新しいsceneを作るときは、まずsceneファイルにcomponentと初期値をまとめます。

```tsx
export const SCENE_CAMERA = ...;
export const SCENE_LIGHTING = ...;
export const INITIAL_SCENE_PARAMETERS = ...;

export function MyScene({ parameters }: MySceneProps) {
  return (
    <>
      <SdfBox ... />
      <SdfSphere ... />
    </>
  );
}
```

次に`App.tsx`のimportとJSXを差し替えます。

```tsx
import {
  MyScene,
  INITIAL_SCENE_PARAMETERS,
  SCENE_CAMERA,
  SCENE_LIGHTING,
} from "./scenes/MyScene";
```

```tsx
<NexusCanvas camera={SCENE_CAMERA} lighting={SCENE_LIGHTING}>
  <MyScene parameters={sceneParameters} />
</NexusCanvas>
```

このとき、`App`に直接`<SdfSphere />`や`<SdfBox />`を置かないのが基本です。`App`は画面の器とstate配線に集中し、sceneの中身はscene componentへ閉じ込めます。

## 実装時の目安

React視点でNexusGPUのsceneを作るときは、次の順で考えると組み立てやすいです。

1. sceneで使う値を`parameters`として型定義する
2. `INITIAL_SCENE_PARAMETERS`を用意する
3. sceneに合う`SCENE_CAMERA`と`SCENE_LIGHTING`を用意する
4. `parameters`と時間からprimitive propsを作る
5. JSXで`SdfBox`や`SdfSphere`を並べる
6. `App.tsx`でstateを持ち、`NexusCanvas`、scene、panelへ渡す

シェーダー側のことを意識する必要があるのは、新しいprimitiveの種類そのものを追加するときです。既存の`SdfBox`や`SdfSphere`でsceneを組む範囲では、React component、state、props、childrenの組み合わせとして考えれば十分です。
