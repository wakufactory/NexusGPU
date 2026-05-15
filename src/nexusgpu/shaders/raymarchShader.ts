export const raymarchShader = /* wgsl */ `

// レイを少しずつ進め、距離場にヒットするまで探索する。
fn raymarch(origin: vec3<f32>, direction: vec3<f32>) -> RaymarchHit {
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
      if (!hitInteriorSurfaces) {
        let normal = estimateNormalFromGradInfo(point, evalHit.gradInfo);
        if (dot(normal, direction) > 0.0) {
          depth = depth + surfaceEpsilon * 2.0;
          previousDepth = depth;
          previousDistance = mapSceneDistance(origin + direction * depth).distance;
          continue;
        }
      }

      color = evalHit.color;
      return RaymarchHit(
        depth,
        color,
        evalHit.smoothness,
        evalHit.localPoint,
        evalHit.gradInfo,
        evalHit.materialId,
        evalHit.materialUniform
      );
    }

    // 符号が変わったら直前区間を戻ってゼロ交差を探す。
    if (
      (hit.distance < 0.0 && previousDistance > 0.0) ||
      (hitInteriorSurfaces && hit.distance > 0.0 && previousDistance < 0.0)
    ) {
      var low = previousDepth;
      var high = depth;
      let enteringSurface = hit.distance < 0.0;

      if (enteringSurface || hitInteriorSurfaces) {
        for (var j = 0; j < 6; j = j + 1) {
          let mid = (low + high) * 0.5;
          let midHit = mapSceneDistance(origin + direction * mid);

          if ((midHit.distance > 0.0) == enteringSurface) {
            low = mid;
          } else {
            high = mid;
          }
        }

        let refinedPoint = origin + direction * high;
        let refinedEval = mapSceneEval(refinedPoint);
        if (!hitInteriorSurfaces) {
          let normal = estimateNormalFromGradInfo(refinedPoint, refinedEval.gradInfo);
          if (dot(normal, direction) > 0.0) {
            depth = high + surfaceEpsilon * 2.0;
            previousDepth = depth;
            previousDistance = mapSceneDistance(origin + direction * depth).distance;
            continue;
          }
        }

        color = refinedEval.color;
        return RaymarchHit(
          high,
          color,
          refinedEval.smoothness,
          refinedEval.localPoint,
          refinedEval.gradInfo,
          refinedEval.materialId,
          refinedEval.materialUniform
        );
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

  return RaymarchHit(-1.0, color, 0.0, vec3<f32>(0.0), vec4<f32>(0.0), 0.0, vec4<f32>(0.0));
}
  // 影判定専用の軽量レイマーチ。遮蔽の有無だけを見るため、色やmaterial評価は行わない。
fn raymarchShadow(origin: vec3<f32>, direction: vec3<f32>, maxShadowDistance: f32) -> f32 {
  var depth = camera.objectInfo.y * 2.0;
  let surfaceEpsilon = camera.objectInfo.y;
  let maxSteps = 100;

  for (var i = 0; i < maxSteps; i = i + 1) {
    if (depth > maxShadowDistance) {
      break;
    }

    let hit = mapSceneDistance(origin + direction * depth);
    if (hit.distance < surfaceEpsilon) {
      return 0.0;
    }

    depth = depth + max(abs(hit.distance), surfaceEpsilon * 2.0);
  }

  return 1.0;
}

`;
