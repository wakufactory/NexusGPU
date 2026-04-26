export const lightingShader = /* wgsl */ `
// 距離場の勾配から法線を近似する。epsilonはデバッグUIから調整できる。
fn estimateNormal(point: vec3<f32>) -> vec3<f32> {
  let e = vec2<f32>(camera.renderInfo.w, 0.0);
  let normal = vec3<f32>(
    mapScene(point + e.xyy).distance - mapScene(point - e.xyy).distance,
    mapScene(point + e.yxy).distance - mapScene(point - e.yxy).distance,
    mapScene(point + e.yyx).distance - mapScene(point - e.yyx).distance
  );

  return normalize(normal);
}

// 未ヒット時に表示する簡易背景。
fn background(direction: vec3<f32>) -> vec3<f32> {
  let t = 0.5 * (direction.y + 1.0);
  let horizon = vec3<f32>(0.12, 0.16, 0.17);
  let zenith = vec3<f32>(0.02, 0.025, 0.028);
  return mix(horizon, zenith, t);
}
`;
