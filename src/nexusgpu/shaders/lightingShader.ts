export const lightingShader = /* wgsl */ `
// 距離場の勾配から法線を近似する。epsilonはデバッグUIから調整できる。
fn estimateNormal(point: vec3<f32>) -> vec3<f32> {
  let sceneEval = mapSceneEval(point);
  return estimateNormalFromGradInfo(point, sceneEval.gradInfo);
}

fn estimateNormalFromHit(hit: RaymarchHit, point: vec3<f32>) -> vec3<f32> {
  return estimateNormalFromGradInfo(point, hit.gradInfo);
}

fn estimateNormalFromGradInfo(point: vec3<f32>, gradInfo: vec4<f32>) -> vec3<f32> {
  if (gradInfo.w > 0.5 && length(gradInfo.xyz) > 0.000001) {
    return normalize(gradInfo.xyz);
  }

  let e = camera.renderInfo.w;
  let k1 = vec3<f32>(1.0, -1.0, -1.0);
  let k2 = vec3<f32>(-1.0, -1.0, 1.0);
  let k3 = vec3<f32>(-1.0, 1.0, -1.0);
  let k4 = vec3<f32>(1.0, 1.0, 1.0);
  let normal =
    k1 * mapSceneDistance(point + k1 * e).distance +
    k2 * mapSceneDistance(point + k2 * e).distance +
    k3 * mapSceneDistance(point + k3 * e).distance +
    k4 * mapSceneDistance(point + k4 * e).distance;

  return normalize(normal);
}

// 未ヒット時に表示する簡易背景。
fn background(direction: vec3<f32>) -> vec3<f32> {
  let t = 0.5 * (direction.y + 1.0);
  return mix(camera.backgroundYNegative.rgb, camera.backgroundYPositive.rgb, t);
}
`;
