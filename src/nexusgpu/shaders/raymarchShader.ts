export const raymarchShader = /* wgsl */ `
// レイを少しずつ進め、距離場にヒットするまで探索する。
fn raymarch(origin: vec3<f32>, direction: vec3<f32>) -> SceneHit {
  var depth = 0.0;
  var color = vec3<f32>(0.0);
  var previousDepth = 0.0;
  var previousDistance = camera.renderInfo.y;
  let maxSteps = i32(clamp(camera.renderInfo.x, 1.0, f32(MAX_STEPS_CAP)));
  let maxDistance = camera.renderInfo.y;
  let surfaceEpsilon = camera.objectInfo.y;

  for (var i = 0; i < MAX_STEPS_CAP; i = i + 1) {
    if (i >= maxSteps) {
      break;
    }

    let point = origin + direction * depth;
    let hit = mapScene(point);

    if (abs(hit.distance) < surfaceEpsilon) {
      color = hit.color;
      return SceneHit(depth, color);
    }

    // CSGのnot/subtractでは距離符号が反転しやすい。負距離へ踏み込んだら直前区間を戻ってゼロ交差を探す。
    if (hit.distance < 0.0 && previousDistance > 0.0) {
      var low = previousDepth;
      var high = depth;
      var refinedHit = hit;

      for (var j = 0; j < 6; j = j + 1) {
        let mid = (low + high) * 0.5;
        let midHit = mapScene(origin + direction * mid);

        if (midHit.distance > 0.0) {
          low = mid;
        } else {
          high = mid;
          refinedHit = midHit;
        }
      }

      color = refinedHit.color;
      return SceneHit(high, color);
    }

    previousDepth = depth;
    previousDistance = hit.distance;
    depth = depth + max(hit.distance, surfaceEpsilon * 0.5);
    if (depth > maxDistance) {
      break;
    }
  }

  return SceneHit(-1.0, color);
}
`;
