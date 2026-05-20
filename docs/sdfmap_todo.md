# SDF Map / Height Field TODO

FujiHeightMapScene 系の height map 地形について、画像をそのまま raymarch 中に decode するのではなく、地図データ更新時だけ GPU/CPU で実 height へ変換して参照する方向のメモ。

## 現状の課題

- `FujiHeightMapScene` は SDF 評価のたびに `texture0` から 4 texel を `textureLoad` している。
- 各 texel の RGB を 24bit 高度値へ decode し、bilinear 補間して `heightMeters` を作っている。
- 勾配も同じ 4 texel から毎回計算している。
- raymarch 中は同じ地図データに対してこの処理が何十から何百 step も繰り返される。
- 地図データ自体はスクロール、ズーム、タイル差し替え時などにしか変わらないため、毎 step decode するのは効率が悪い。

## 改良方針

地図画像が変わったタイミングだけ前処理を行い、raymarch 側では decode 済みの height texture を参照する。

想定する派生 texture:

```text
rgba16float または rgba32float

r = heightSceneUnit
g = dheight/dx
b = dheight/dz
a = validMask
```

raymarch 側の参照は以下のような形に寄せる。

```wgsl
let terrain = textureSampleLevel(decodedHeightTexture, decodedHeightSampler, uv, 0.0);
let height = terrain.r;
let heightGradient = terrain.gb;
let alpha = terrain.a;
```

これにより、現状の `4 textureLoad + RGB decode + 高度差分計算` を raymarch の内側から外せる。

## Compute Shader 案

- 元の RGB height map texture を入力にする。
- compute pass で各 pixel の実 height を decode する。
- 近傍 height から `dheight/dx` / `dheight/dz` も同時に焼く。
- 出力 texture を SDF shader から読む。
- 地図データ、ズーム、タイル配置、heightScale など、派生 texture に影響する入力が dirty になった時だけ再生成する。

挿入候補:

- `renderer/sceneTextures.ts`
  - 元画像 texture と派生 height texture の lifecycle 管理。
- `WebGpuSdfRenderer.ts`
  - `encodeSdfPass()` の前に、dirty な場合だけ compute pass を encode。
- `shaders/shaderLayout.ts`
  - decoded height texture / sampler の binding を追加。
- `FujiHeightMapScene.tsx`
  - RGB decode 部分を消し、decoded height texture 参照へ置き換える。

## CPU Decode 案

更新頻度が低いだけなら、CPU 側で画像を `Float32Array` などへ decode して `queue.writeTexture()` で GPU texture に送る案もある。

- 実装は compute shader より単純。
- スクロールやタイル更新のたびに CPU decode が入る。
- タイル合成や派生 field 生成も GPU 側へ寄せたい場合は compute shader 案の方が拡張しやすい。

## Height Map 専用 Raymarcher 案

decode済み height texture へ置き換えても、現在の `FujiHeightMapScene` はまだ `SdfFunction` の point query 型評価に乗っている。

```wgsl
point -> distance / SceneEval
```

この方式では、height field を「近似SDF」として扱う必要があるため、`slopeGuard`、`surfaceEpsilon`、shadow bias の調整に依存しやすい。特に浅い角度の視線や shadow ray では、距離の過大評価による飛び越し、または自己遮蔽由来の偽影が出やすい。

height map 地形を安定させるには、汎用 SDF raymarcher ではなく、ray と height field の交差を直接解く専用 marcher を追加する。

```wgsl
ray origin + ray direction -> height map hit
```

### 追加する概念

`SdfFunction` の特殊なWGSL差し替えではなく、height map 専用の scene node / primitive として扱う。

例:

```tsx
<TerrainHeightMap
  size={[40, 40]}
  heightScale={parameters.heightScale}
  textureSlot={0}
  colorTextureSlot={1}
  photoTextureSlot={2}
/>
```

想定する責務:

- height map は通常の `mapSceneDistance(point)` には完全には押し込まない。
- fragment shader 内で通常 SDF hit と height map hit を別々に計算する。
- 両方がある場合は、ray origin から近い hit を採用する。
- shadow も通常 SDF shadow と height map shadow を別経路で評価する。

### Raymarch / Traversal 方針

height field では、レイ上の点 `p(t)` に対して次の符号を見る。

```wgsl
let p = origin + direction * t;
let terrainHeight = sampleHeight(p.xz);
let f = p.y - terrainHeight;
```

`f > 0` なら地形上、`f <= 0` なら地形面以下。レイを XZ 平面上の進行量に合わせて進め、`f` の符号が変わった区間を見つけたら二分探索で hit 位置を refinement する。

概念:

```wgsl
var previousT = tMin;
var previousF = evalHeightDifference(previousT);

for (...) {
  let currentT = previousT + stepByTexelFootprint;
  let currentF = evalHeightDifference(currentT);

  if (previousF > 0.0 && currentF <= 0.0) {
    return refineHeightHit(previousT, currentT);
  }

  previousT = currentT;
  previousF = currentF;
}
```

この方式では「距離場としてどれだけ進めるか」ではなく「height map 上をどれだけ進むか」で step を決めるため、`slopeGuard` への依存を減らせる。

### 通常 SDF との合成

既存の `raymarch()` を直接置き換えるのではなく、内部を分ける。

```wgsl
let sdfHit = raymarchSdf(origin, direction);
let terrainHit = raymarchHeightMap(origin, direction);
return chooseNearestHit(sdfHit, terrainHit);
```

必要な分離:

- 既存 `raymarch()` を `raymarchSdf()` にリネームまたは内部関数化する。
- `raymarchHeightMap()` を追加する。
- `RaymarchHit.distance < 0` を miss として、近い positive hit を選ぶ helper を追加する。
- height map scene node が存在しない場合は、`raymarchHeightMap()` を生成しない、または即 miss を返す。

### Shadow 専用経路

現在の `raymarchShadow()` は `mapSceneDistance()` を使うため、height field の自己影に弱い。height map 専用 marcher を入れる場合は shadow も分ける。

```wgsl
let sdfShadow = raymarchSdfShadow(shadowPoint, lightDirection, maxShadowDistance);
let terrainShadow = raymarchHeightMapShadow(shadowPoint, lightDirection, maxShadowDistance);
return min(sdfShadow, terrainShadow);
```

height map shadow では、表示用 hit と同じ `f = p.y - height(p.xz)` の符号変化で遮蔽を判定する。shadow 用には以下も必要。

- normal 方向 bias と light 方向 bias を分ける。
- 近接自己交差を避けるため、最初の数 cm / scene unit 分を skip する。
- alpha=0 の無効領域を遮蔽に含めるかどうかを明示する。

### 挿入候補

- `src/nexusgpu/types.ts`
  - `TerrainHeightMap` 用 scene node 型、props 型を追加する。
- `src/nexusgpu/primitives.tsx`
  - `<TerrainHeightMap />` component を追加し、SceneStore に専用 node として登録する。
- `src/nexusgpu/sceneTraversal.ts`
  - scene traversal helper が terrain node を扱えるようにする。
- `src/nexusgpu/renderer/sceneBuffers.ts`
  - height map node のサイズ、heightScale、texture slot、bounds などを GPU record 化する。
- `src/nexusgpu/renderer/sceneShaderCompiler.ts`
  - scene 内に height map node があるか検出し、height map marcher 用WGSLを生成する。
  - 通常 SDF tree からは height map node を除外するか、別 collection として扱う。
- `src/nexusgpu/shaders/raymarchShader.ts`
  - 既存 `raymarch()` を通常 SDF 用と統合用に分割する。
  - `raymarchHeightMap()` と `raymarchHeightMapShadow()` を追加する。
- `src/nexusgpu/shaders/fragmentShader.ts`
  - `raymarch()` の戻り値形式は維持しつつ、内部で SDF / height map の nearest hit を選ぶ。
- `src/demo/scenes/FujiHeightMapScene.tsx`
  - `SdfFunction` 版 height field を `<TerrainHeightMap />` へ置き換える。

### 実装順序案

1. `RaymarchHit` を返す `raymarchHeightMap()` を固定1枚の `texture0` 前提で試作する。
2. `FujiHeightMapScene` 限定の compile flag で height map marcher を有効化する。
3. 通常 SDF がない scene で、height map hit / normal / color / alpha mask を確認する。
4. `raymarchSdf()` と `raymarchHeightMap()` の nearest hit 合成を追加する。
5. `raymarchHeightMapShadow()` を追加し、既存 shadow と合成する。
6. `TerrainHeightMap` scene node / React component へ一般化する。
7. decoded height texture 案と統合し、height sample を `rgba16float` / `rgba32float` 参照へ置き換える。

### 注意点

- height map 専用 marcher は CSG 演算にはそのまま参加できない。通常 SDF との関係は「nearest surface 合成」から始める。
- `SdfGroup` の `subtract` や `and` に terrain を入れたい場合は、別途 terrain を distance field として扱う fallback が必要。
- 複数 height map tile を扱う場合、ray がどの tile に入っているかを解決する tile atlas / tile table が必要になる。
- stereo / XR では eye ごとに ray origin / direction が異なるが、fragment shader の ray 生成後に marcher を呼ぶ構成ならそのまま対応できる。
- height map marcher の step は texel footprint に依存するため、低解像度時は速いが地形の細部を飛ばしやすい。必要なら min step / max step / binary refinement 回数を設定化する。
- alpha=0 の領域を「水面としてhitさせる」のか「地形なしとして透過/missにする」のかを scene 仕様として決める。

## Texture Format

### rgba16float

- filterable texture として扱いやすい。
- `r/g/b/a` を一枚にまとめやすい。
- float16 の有効桁は 10 進で約 3.3 桁。
- meter のまま大きい値を入れると高高度側で数 m 単位の量子化が出る可能性がある。
- scene unit に正規化して持つ方が扱いやすい。

### rgba32float

- 精度は十分。
- 自動補間に `float32-filterable` feature が必要。
- 未対応環境では filterable な `sampleType: "float"` として bind できない。
- 未対応 fallback は `sampleType: "unfilterable-float"` + `textureLoad` + 手動 bilinear。

確認方法:

```ts
const adapter = await navigator.gpu.requestAdapter();
const canFilterFloat32 = adapter?.features.has("float32-filterable") ?? false;

const device = await adapter.requestDevice({
  requiredFeatures: canFilterFloat32 ? ["float32-filterable"] : [],
});
```

## Binding 上の注意

現状の scene texture binding は filterable float texture 前提。

```ts
sampler: { type: "filtering" }
texture: { sampleType: "float", viewDimension: "2d" }
```

この layout に `rgba32float` を bind するには `float32-filterable` が必要。未対応 fallback を入れるなら、binding layout 自体を分ける必要がある。

fallback 例:

```ts
sampler: { type: "non-filtering" }
texture: { sampleType: "unfilterable-float", viewDimension: "2d" }
```

## 実装 TODO

1. `float32-filterable` の有無を renderer 初期化時に検出する。
2. 派生 height texture の format 方針を決める。
   - first step は `rgba16float` が無難。
   - 精度が足りない場合に `rgba32float` + feature check を追加する。
3. 元 height map texture から decoded height texture を作る lifecycle を追加する。
4. dirty flag を導入し、地図データ変更時だけ再生成する。
5. compute shader で RGB height decode と gradient bake を行う。
6. `FujiHeightMapScene` の WGSL を decoded texture 参照へ置き換える。
7. 現状の RGB decode path は fallback または比較用として一時的に残す。
8. `rgba16float` で見た目の量子化、normal、marching stability を確認する。
9. 必要なら `rgba32float` path と `textureLoad` fallback を追加する。

## 期待する効果

- raymarch inner loop から height map RGB decode を外せる。
- height と gradient を 1 回の texture sample で取得できる。
- `SceneEval.gradInfo` へ焼いた gradient をそのまま渡せるため、hit 後 normal 計算との相性がよい。
- 地図スクロールやタイル更新のような低頻度イベントに前処理コストを寄せられる。
