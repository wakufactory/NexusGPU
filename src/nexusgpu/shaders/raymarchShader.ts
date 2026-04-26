export const raymarchShader = /* wgsl */ `
// レイを少しずつ進め、距離場にヒットするまで探索する。
fn raymarch(origin: vec3<f32>, direction: vec3<f32>) -> SceneHit {
  var depth = 0.0;
  var color = vec3<f32>(0.0);
  let maxSteps = i32(clamp(camera.renderInfo.x, 1.0, f32(MAX_STEPS_CAP)));
  let maxDistance = camera.renderInfo.y;
  let surfaceEpsilon = camera.objectInfo.y;

  for (var i = 0; i < MAX_STEPS_CAP; i = i + 1) {
    if (i >= maxSteps) {
      break;
    }

    let point = origin + direction * depth;
    let hit = mapScene(point);

    if (hit.distance < surfaceEpsilon) {
      color = hit.color;
      return SceneHit(depth, color);
    }

    depth = depth + hit.distance;
    if (depth > maxDistance) {
      break;
    }
  }

  return SceneHit(-1.0, color);
}
`;
