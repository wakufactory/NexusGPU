# XR Support

NexusGPU の初期 XR 対応は、完全な per-eye WebXR レンダリングではなく、既存の Side-by-Side stereo rendering を WebXR の左右 eye に分配する方式で実装している。

## 方針

通常表示と既存 SBS 表示の描画経路は維持する。XR モードでは `WebGpuSdfRenderer` が SBS の中間 `GPUTexture` を作り、WebXR/WebGPU binding の projection layer に対して左 eye には SBS 左半分、右 eye には SBS 右半分を blit する。

この方式では SDF raymarch shader の camera model は変更しない。`stereoSbs`, `stereoBase`, `stereoSwapEyes` は設定パネルの値に従う。XR 専用に `stereoBase` を補正しない。

## WebXR / WebGPU Binding

WebXR と WebGPU の連携は `XRGPUBinding` を優先して使う。古い実装名に備えて `XRWebGPUBinding` は fallback として残している。

初期化時の前提は以下。

- `navigator.xr` が存在する
- `navigator.gpu` が存在する
- `XRGPUBinding` または `XRWebGPUBinding` が存在する
- `navigator.xr.isSessionSupported("immersive-vr")` が true
- WebGPU adapter は `requestAdapter({ xrCompatible: true })` で取得する
- XR session は `requestSession("immersive-vr", { requiredFeatures: ["webgpu"] })` で開始する

XR projection layer の color format は `binding.getPreferredColorFormat()` を優先する。XR 用 blit pipeline は通常 canvas の preferred format ではなく、この XR color format に合わせて作る。

## 描画の流れ

1. 通常の `WebGpuSdfRenderer` が scene snapshot を保持する。
2. XR frame で `frame.getViewerPose(referenceSpace)` を取得する。
3. 最初の `XRView` の subImage から eye viewport size を取得する。
4. `eyeWidth * 2` x `eyeHeight` の SBS 中間 texture に既存 SDF renderer で描画する。
5. 各 `XRView` について `binding.getViewSubImage(projectionLayer, view)` を取得する。
6. `subImage.colorTexture.createView(subImage.getViewDescriptor?.())` を render target にする。
7. left/right eye に応じて SBS texture の左半分または右半分を blit する。

XR subImage は texture atlas 内の viewport を持つことがある。そのため blit shader では fullscreen triangle の `input.uv` をそのまま使わず、`@builtin(position)` と `subImage.viewport` から viewport-local UV を計算する。

```wgsl
let localUv = (input.position.xy - blitRect.viewport.xy) / blitRect.viewport.zw;
let uv = blitRect.source.xy + vec2<f32>(localUv.x, 1.0 - localUv.y) * blitRect.source.zw;
```

この viewport-local UV によって、左 eye と右 eye の画像枠が XR 空間で同じ位置に見える。

## 座標と向き

XR projection layer への blit では、最初の実機確認で上下が反転していた。そのため XR blit shader では Y を反転して sampling する。

通常 canvas と通常 SBS の描画はこの反転処理を通らないため、既存表示には影響しない。

## アニメーション

通常モードでは `NexusCanvas` の `requestAnimationFrame` が `SceneStore.advanceFrame()` を呼び、`useFrame` 登録済み callback を進める。

XR モード中は通常 rAF ではなく `XRSession.requestAnimationFrame` の時刻で `SceneStore.advanceFrame()` を呼ぶ。通常 rAF 側は `renderer.isXrPresenting()` を見て更新を止めるため、XR 中の二重更新を避ける。

## 参考にしたサンプル

`wgpu_xr.html` と `test/compute.html` を基準に、以下を合わせている。

- `XRGPUBinding`
- `requestAdapter({ xrCompatible: true })`
- `requestSession(..., { requiredFeatures: ["webgpu"] })`
- `binding.getPreferredColorFormat()`
- `createProjectionLayer({ colorFormat, depthStencilFormat: "depth24plus" })`
- `subImage.colorTexture.createView(subImage.getViewDescriptor())`
- `subImage.viewport` を `setViewport()` に渡す

`test/compute.html` の compute pass は、現時点の NexusGPU XR SBS 経路では使っていない。将来 compute prepass を追加する場合は、同一 command encoder 内で compute pass を先に実行し、その後 XR subImage への render pass を実行する構成にできる。

## 既知の制約

- これは true per-eye WebXR SDF rendering ではなく、SBS texture を左右 eye に分配する初期対応である。
- XR pose は SDF camera にまだ反映していない。
- controller input、hand tracking、AR passthrough は未対応。
- XR 対応は WebXR/WebGPU binding を実装したブラウザ環境を前提にしている。
