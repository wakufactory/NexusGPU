export const raymarchShader = /* wgsl */ `
// レイを少しずつ進め、距離場にヒットするまで探索する。
fn raymarch(origin: vec3<f32>, direction: vec3<f32>) -> SceneHit {
  var depth = 0.0;
  var color = vec3<f32>(0.0);
  let initialHit = mapSceneDistance(origin);
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
    let hit = mapSceneDistance(point);

    if (abs(hit.distance) < surfaceEpsilon) {
      if (!hitInteriorSurfaces && previousDistance < 0.0) {
        depth = depth + surfaceEpsilon * 2.0;
        previousDepth = depth;
        previousDistance = mapSceneDistance(origin + direction * depth).distance;
        continue;
      }

      let evalHit = mapSceneEval(point);
      color = evalHit.color;
      return SceneHit(depth, color, evalHit.smoothness, evalHit.localPoint);
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
          let midHit = mapSceneDistance(origin + direction * mid);

          if ((midHit.distance > 0.0) == enteringSurface) {
            low = mid;
          } else {
            high = mid;
            refinedHit = midHit;
          }
        }

        let refinedEval = mapSceneEval(origin + direction * high);
        color = refinedEval.color;
        return SceneHit(high, color, refinedEval.smoothness, refinedEval.localPoint);
      }
    }

    if (!hitInteriorSurfaces && hit.distance > 0.0 && previousDistance < 0.0) {
      depth = depth + surfaceEpsilon * 2.0;
      previousDepth = depth;
      previousDistance = mapSceneDistance(origin + direction * depth).distance;
      continue;
    }

    previousDepth = depth;
    previousDistance = hit.distance;
    depth = depth + max(abs(hit.distance), surfaceEpsilon * 0.5);
    if (depth > maxDistance) {
      break;
    }
  }

  return SceneHit(-1.0, color, 0.0, vec3<f32>(0.0));
}
`;
