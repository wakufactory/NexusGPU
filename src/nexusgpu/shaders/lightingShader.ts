export const lightingShader = /* wgsl */ `
// 距離場の勾配から法線を近似する。epsilonはデバッグUIから調整できる。
fn estimateNormal(point: vec3<f32>) -> vec3<f32> {
  let e = camera.renderInfo.w;
  let k1 = vec3<f32>(1.0, -1.0, -1.0);
  let k2 = vec3<f32>(-1.0, -1.0, 1.0);
  let k3 = vec3<f32>(-1.0, 1.0, -1.0);
  let k4 = vec3<f32>(1.0, 1.0, 1.0);
  let normal =
    k1 * mapScene(point + k1 * e).distance +
    k2 * mapScene(point + k2 * e).distance +
    k3 * mapScene(point + k3 * e).distance +
    k4 * mapScene(point + k4 * e).distance;

  return normalize(normal);
}

// 未ヒット時に表示する簡易背景。
fn background(direction: vec3<f32>) -> vec3<f32> {
  let t = 0.5 * (direction.y + 1.0);
  return mix(camera.backgroundYNegative.rgb, camera.backgroundYPositive.rgb, t);
}
`;
