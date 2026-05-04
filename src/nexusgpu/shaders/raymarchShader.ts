export const raymarchShader = /* wgsl */ `
// レイを少しずつ進め、距離場にヒットするまで探索する。
fn raymarch(origin: vec3<f32>, direction: vec3<f32>) -> SceneHit {
  var depth = 0.0;
  var color = vec3<f32>(0.0);
  let initialHit = mapScene(origin);
  var previousDepth = 0.0;
  var previousDistance = initialHit.distance;
  let maxSteps = i32(clamp(camera.renderInfo.x, 1.0, f32(MAX_STEPS_CAP)));
  let maxDistance = camera.renderInfo.y;
  let surfaceEpsilon = camera.objectInfo.y;
  let hitInteriorSurfaces = camera.objectInfo.z > 0.5;

  for (var i = 0; i < MAX_STEPS_CAP; i = i + 1) {
    if (i >= maxSteps) {
      break;
    }

    let point = origin + direction * depth;
    let hit = mapScene(point);

    if (abs(hit.distance) < surfaceEpsilon) {
      if (!hitInteriorSurfaces && previousDistance < 0.0) {
        depth = depth + surfaceEpsilon * 2.0;
        previousDepth = depth;
        previousDistance = mapScene(origin + direction * depth).distance;
        continue;
      }

      color = hit.color;
      return SceneHit(depth, color, hit.smoothness);
    }

    // 符号が変わったら直前区間を戻ってゼロ交差を探す。
    if (
      (hit.distance < 0.0 && previousDistance > 0.0) ||
      (hitInteriorSurfaces && hit.distance > 0.0 && previousDistance < 0.0)
    ) {
      var low = previousDepth;
      var high = depth;
      var refinedHit = hit;
      let enteringSurface = hit.distance < 0.0;

      if (enteringSurface || hitInteriorSurfaces) {
        for (var j = 0; j < 6; j = j + 1) {
          let mid = (low + high) * 0.5;
          let midHit = mapScene(origin + direction * mid);

          if ((midHit.distance > 0.0) == enteringSurface) {
            low = mid;
          } else {
            high = mid;
            refinedHit = midHit;
          }
        }

        color = refinedHit.color;
        return SceneHit(high, color, refinedHit.smoothness);
      }
    }

    if (!hitInteriorSurfaces && hit.distance > 0.0 && previousDistance < 0.0) {
      depth = depth + surfaceEpsilon * 2.0;
      previousDepth = depth;
      previousDistance = mapScene(origin + direction * depth).distance;
      continue;
    }

    previousDepth = depth;
    previousDistance = hit.distance;
    depth = depth + max(abs(hit.distance), surfaceEpsilon * 0.5);
    if (depth > maxDistance) {
      break;
    }
  }

  return SceneHit(-1.0, color, 0.0);
}
`;
