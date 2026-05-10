export function createSceneMappingShader(mapSceneBody: string = createEmptyMapSceneBody()) {
  return /* wgsl */ `
// SceneEvalから互換用のSceneHitへ変換する。
fn sceneHitFromEval(value: SceneEval) -> SceneHit {
  return SceneHit(value.distance, value.color, value.smoothness, value.localPoint);
}

// 距離情報とローカル座標からSceneHitを作る。
fn sceneHitFromDistance(value: SceneDistance, localPoint: vec3<f32>) -> SceneHit {
  return SceneHit(value.distance, vec3<f32>(0.0), value.smoothness, localPoint);
}

// 距離とスムーズ合成値からSceneDistanceを作る。
fn sceneDistance(distance: f32, smoothness: f32) -> SceneDistance {
  return SceneDistance(distance, smoothness);
}

// SceneHitから距離評価だけを取り出す。
fn sceneDistanceFromHit(value: SceneHit) -> SceneDistance {
  return SceneDistance(value.distance, value.smoothness);
}

// SceneEvalから距離評価だけを取り出す。
fn sceneDistanceFromEval(value: SceneEval) -> SceneDistance {
  return SceneDistance(value.distance, value.smoothness);
}

// SceneHitをマテリアルなしのSceneEvalへ変換する。
fn sceneEvalFromHit(value: SceneHit) -> SceneEval {
  return SceneEval(
    value.distance,
    value.color,
    value.smoothness,
    value.localPoint,
    vec4<f32>(0.0, 0.0, 0.0, 0.0),
    0.0,
    vec4<f32>(0.0)
  );
}

// SceneHitにマテリアル情報を付けてSceneEvalへ変換する。
fn sceneEvalFromHitWithMaterial(value: SceneHit, materialId: f32, materialUniform: vec4<f32>) -> SceneEval {
  return SceneEval(
    value.distance,
    value.color,
    value.smoothness,
    value.localPoint,
    vec4<f32>(0.0, 0.0, 0.0, 0.0),
    materialId,
    materialUniform
  );
}

// 勾配情報を持つSceneEvalを作る。
fn sceneEvalWithGrad(
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
  localPoint: vec3<f32>,
  grad: vec3<f32>,
  materialId: f32,
  materialUniform: vec4<f32>
) -> SceneEval {
  return SceneEval(distance, color, smoothness, localPoint, vec4<f32>(grad, 1.0), materialId, materialUniform);
}

// 勾配情報を持たないSceneEvalを作る。
fn sceneEvalNoGrad(
  distance: f32,
  color: vec3<f32>,
  smoothness: f32,
  localPoint: vec3<f32>,
  materialId: f32,
  materialUniform: vec4<f32>
) -> SceneEval {
  return SceneEval(distance, color, smoothness, localPoint, vec4<f32>(0.0, 0.0, 0.0, 0.0), materialId, materialUniform);
}

// 既存のSceneEvalから勾配情報だけを無効化する。
fn invalidateSceneEvalGrad(value: SceneEval) -> SceneEval {
  return SceneEval(
    value.distance,
    value.color,
    value.smoothness,
    value.localPoint,
    vec4<f32>(0.0, 0.0, 0.0, 0.0),
    value.materialId,
    value.materialUniform
  );
}

// SceneEvalの勾配ベクトルをクォータニオンで回転する。
fn rotateSceneEvalGrad(value: SceneEval, rotation: vec4<f32>) -> SceneEval {
  return SceneEval(
    value.distance,
    value.color,
    value.smoothness,
    value.localPoint,
    vec4<f32>(rotateByQuaternion(value.gradInfo.xyz, rotation), value.gradInfo.w),
    value.materialId,
    value.materialUniform
  );
}

// SceneEvalのマテリアル情報だけを差し替える。
fn sceneEvalWithMaterial(value: SceneEval, materialId: f32, materialUniform: vec4<f32>) -> SceneEval {
  return SceneEval(value.distance, value.color, value.smoothness, value.localPoint, value.gradInfo, materialId, materialUniform);
}

// スムーズ合成の重みに応じて採用するマテリアルIDを選ぶ。
fn chooseMaterialId(a: SceneEval, b: SceneEval, h: f32) -> f32 {
  return select(a.materialId, b.materialId, h < 0.5);
}

// スムーズ合成の重みに応じて採用するマテリアルUniformを選ぶ。
fn chooseMaterialUniform(a: SceneEval, b: SceneEval, h: f32) -> vec4<f32> {
  return select(a.materialUniform, b.materialUniform, vec4<bool>(h < 0.5));
}

// 2つの距離評価を和集合として合成する。
fn unionDistance(a: SceneDistance, b: SceneDistance, smoothness: f32) -> SceneDistance {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));

  if (effectiveSmoothness <= 0.0001) {
    if (b.distance < a.distance) {
      return b;
    }

    return a;
  }

  let h = clamp(0.5 + 0.5 * (b.distance - a.distance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(b.distance, a.distance, h) - effectiveSmoothness * h * (1.0 - h);

  return SceneDistance(distance, effectiveSmoothness);
}

// 2つの距離評価を積集合として合成する。
fn intersectDistance(a: SceneDistance, b: SceneDistance, smoothness: f32) -> SceneDistance {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));

  if (effectiveSmoothness <= 0.0001) {
    if (a.distance > b.distance) {
      return a;
    }

    return b;
  }

  let h = clamp(0.5 + 0.5 * (a.distance - b.distance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(b.distance, a.distance, h) + effectiveSmoothness * h * (1.0 - h);

  return SceneDistance(distance, effectiveSmoothness);
}

// 距離評価aから距離評価bを差し引く。
fn subtractDistance(a: SceneDistance, b: SceneDistance, smoothness: f32) -> SceneDistance {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));
  let invertedBDistance = -b.distance;

  if (effectiveSmoothness <= 0.0001) {
    if (invertedBDistance > a.distance) {
      return SceneDistance(invertedBDistance, b.smoothness);
    }

    return a;
  }

  let h = clamp(0.5 + 0.5 * (a.distance - invertedBDistance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(invertedBDistance, a.distance, h) + effectiveSmoothness * h * (1.0 - h);

  return SceneDistance(distance, effectiveSmoothness);
}

// 距離評価の内外を反転する。
fn notDistance(value: SceneDistance) -> SceneDistance {
  return SceneDistance(-value.distance, value.smoothness);
}

// 2つの詳細評価を和集合として合成する。
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
  let localPoint = select(b.localPoint, a.localPoint, a.distance <= b.distance);
  let grad = mix(b.gradInfo.xyz, a.gradInfo.xyz, h);
  let hasGrad = b.gradInfo.w * a.gradInfo.w;

  return SceneEval(
    distance,
    color,
    effectiveSmoothness,
    localPoint,
    vec4<f32>(grad, hasGrad),
    chooseMaterialId(a, b, h),
    chooseMaterialUniform(a, b, h)
  );
}

// 2つの詳細評価を積集合として合成する。
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
  let localPoint = select(b.localPoint, a.localPoint, a.distance >= b.distance);
  let grad = mix(b.gradInfo.xyz, a.gradInfo.xyz, h);
  let hasGrad = b.gradInfo.w * a.gradInfo.w;

  return SceneEval(
    distance,
    color,
    effectiveSmoothness,
    localPoint,
    vec4<f32>(grad, hasGrad),
    chooseMaterialId(a, b, h),
    chooseMaterialUniform(a, b, h)
  );
}

// 詳細評価aから詳細評価bを差し引く。
fn subtractHit(a: SceneEval, b: SceneEval, smoothness: f32) -> SceneEval {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));
  let invertedBDistance = -b.distance;

  if (effectiveSmoothness <= 0.0001) {
    if (invertedBDistance > a.distance) {
      return SceneEval(
        invertedBDistance,
        b.color,
        b.smoothness,
        b.localPoint,
        vec4<f32>(-b.gradInfo.xyz, b.gradInfo.w),
        b.materialId,
        b.materialUniform
      );
    }

    return a;
  }

  let h = clamp(0.5 + 0.5 * (a.distance - invertedBDistance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(invertedBDistance, a.distance, h) + effectiveSmoothness * h * (1.0 - h);
  let color = mix(b.color, a.color, h);
  let localPoint = select(b.localPoint, a.localPoint, a.distance >= invertedBDistance);
  let grad = mix(-b.gradInfo.xyz, a.gradInfo.xyz, h);
  let hasGrad = b.gradInfo.w * a.gradInfo.w;

  return SceneEval(
    distance,
    color,
    effectiveSmoothness,
    localPoint,
    vec4<f32>(grad, hasGrad),
    chooseMaterialId(a, b, h),
    chooseMaterialUniform(a, b, h)
  );
}

// 詳細評価の内外と勾配方向を反転する。
fn notHit(value: SceneEval) -> SceneEval {
  return SceneEval(
    -value.distance,
    value.color,
    value.smoothness,
    value.localPoint,
    vec4<f32>(-value.gradInfo.xyz, value.gradInfo.w),
    value.materialId,
    value.materialUniform
  );
}

${mapSceneBody}
`;
}

function createEmptyMapSceneBody() {
  return /* wgsl */ `
// 空シーン用に、常に遠方の距離を返す。
fn mapSceneDistance(point: vec3<f32>) -> SceneDistance {
  return sceneDistance(camera.renderInfo.y, 0.0);
}

// 空シーン用に、デフォルト色の詳細評価を返す。
fn mapSceneEval(point: vec3<f32>) -> SceneEval {
  return sceneEvalNoGrad(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, point, 0.0, vec4<f32>(0.0));
}

// 詳細評価を互換用のSceneHitとして返す。
fn mapScene(point: vec3<f32>) -> SceneHit {
  return sceneHitFromEval(mapSceneEval(point));
}
`;
}

export const sceneMappingShader = createSceneMappingShader();
