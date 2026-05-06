export function createSceneMappingShader(mapSceneBody: string = createEmptyMapSceneBody()) {
  return /* wgsl */ `
fn sceneHitFromEval(value: SceneEval) -> SceneHit {
  return SceneHit(value.distance, value.color, value.smoothness, value.localPoint);
}

fn sceneEvalFromHit(value: SceneHit) -> SceneEval {
  return SceneEval(value.distance, value.color, value.smoothness, value.localPoint, vec4<f32>(0.0, 0.0, 0.0, 0.0));
}

fn sceneEvalWithGrad(
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
  localPoint: vec3<f32>,
  grad: vec3<f32>
) -> SceneEval {
  return SceneEval(distance, color, smoothness, localPoint, vec4<f32>(grad, 1.0));
}

fn sceneEvalNoGrad(distance: f32, color: vec3<f32>, smoothness: f32, localPoint: vec3<f32>) -> SceneEval {
  return SceneEval(distance, color, smoothness, localPoint, vec4<f32>(0.0, 0.0, 0.0, 0.0));
}

fn invalidateSceneEvalGrad(value: SceneEval) -> SceneEval {
  return SceneEval(value.distance, value.color, value.smoothness, value.localPoint, vec4<f32>(0.0, 0.0, 0.0, 0.0));
}

fn rotateSceneEvalGrad(value: SceneEval, rotation: vec4<f32>) -> SceneEval {
  return SceneEval(
    value.distance,
    value.color,
    value.smoothness,
    value.localPoint,
    vec4<f32>(rotateByQuaternion(value.gradInfo.xyz, rotation), value.gradInfo.w)
  );
}

fn unionHit(a: SceneEval, b: SceneEval, smoothness: f32) -> SceneEval {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));

  if (effectiveSmoothness <= 0.0001) {
    if (b.distance < a.distance) {
      return b;
    }

    return a;
  }

  let h = clamp(0.5 + 0.5 * (b.distance - a.distance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(b.distance, a.distance, h) - effectiveSmoothness * h * (1.0 - h);
  let color = mix(b.color, a.color, h);
  let localPoint = mix(b.localPoint, a.localPoint, h);
  let grad = mix(b.gradInfo.xyz, a.gradInfo.xyz, h);
  let hasGrad = b.gradInfo.w * a.gradInfo.w;

  return SceneEval(distance, color, effectiveSmoothness, localPoint, vec4<f32>(grad, hasGrad));
}

fn intersectHit(a: SceneEval, b: SceneEval, smoothness: f32) -> SceneEval {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));

  if (effectiveSmoothness <= 0.0001) {
    if (a.distance > b.distance) {
      return a;
    }

    return b;
  }

  let h = clamp(0.5 + 0.5 * (a.distance - b.distance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(b.distance, a.distance, h) + effectiveSmoothness * h * (1.0 - h);
  let color = mix(b.color, a.color, h);
  let localPoint = mix(b.localPoint, a.localPoint, h);
  let grad = mix(b.gradInfo.xyz, a.gradInfo.xyz, h);
  let hasGrad = b.gradInfo.w * a.gradInfo.w;

  return SceneEval(distance, color, effectiveSmoothness, localPoint, vec4<f32>(grad, hasGrad));
}

fn subtractHit(a: SceneEval, b: SceneEval, smoothness: f32) -> SceneEval {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));
  let invertedBDistance = -b.distance;

  if (effectiveSmoothness <= 0.0001) {
    if (invertedBDistance > a.distance) {
      return SceneEval(invertedBDistance, b.color, b.smoothness, b.localPoint, vec4<f32>(-b.gradInfo.xyz, b.gradInfo.w));
    }

    return a;
  }

  let h = clamp(0.5 + 0.5 * (a.distance - invertedBDistance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(invertedBDistance, a.distance, h) + effectiveSmoothness * h * (1.0 - h);
  let color = mix(b.color, a.color, h);
  let localPoint = mix(b.localPoint, a.localPoint, h);
  let grad = mix(-b.gradInfo.xyz, a.gradInfo.xyz, h);
  let hasGrad = b.gradInfo.w * a.gradInfo.w;

  return SceneEval(distance, color, effectiveSmoothness, localPoint, vec4<f32>(grad, hasGrad));
}

fn notHit(value: SceneEval) -> SceneEval {
  return SceneEval(-value.distance, value.color, value.smoothness, value.localPoint, vec4<f32>(-value.gradInfo.xyz, value.gradInfo.w));
}

${mapSceneBody}
`;
}

function createEmptyMapSceneBody() {
  return /* wgsl */ `
fn mapSceneEval(point: vec3<f32>) -> SceneEval {
  return sceneEvalNoGrad(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, point);
}

fn mapScene(point: vec3<f32>) -> SceneHit {
  return sceneHitFromEval(mapSceneEval(point));
}
`;
}

export const sceneMappingShader = createSceneMappingShader();
