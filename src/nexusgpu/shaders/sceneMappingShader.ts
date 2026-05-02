export function createSceneMappingShader(mapSceneBody: string = createEmptyMapSceneBody()) {
  return /* wgsl */ `
fn unionHit(a: SceneHit, b: SceneHit, smoothness: f32) -> SceneHit {
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

  return SceneHit(distance, color, effectiveSmoothness);
}

fn intersectHit(a: SceneHit, b: SceneHit) -> SceneHit {
  if (a.distance > b.distance) {
    return a;
  }

  return b;
}

fn subtractHit(a: SceneHit, b: SceneHit, smoothness: f32) -> SceneHit {
  let effectiveSmoothness = min(smoothness, min(a.smoothness, b.smoothness));
  let invertedBDistance = -b.distance;

  if (effectiveSmoothness <= 0.0001) {
    if (invertedBDistance > a.distance) {
      return SceneHit(invertedBDistance, b.color, b.smoothness);
    }

    return a;
  }

  let h = clamp(0.5 + 0.5 * (a.distance - invertedBDistance) / effectiveSmoothness, 0.0, 1.0);
  let distance = mix(invertedBDistance, a.distance, h) + effectiveSmoothness * h * (1.0 - h);
  let color = mix(b.color, a.color, h);

  return SceneHit(distance, color, effectiveSmoothness);
}

fn notHit(value: SceneHit) -> SceneHit {
  return SceneHit(-value.distance, value.color, value.smoothness);
}

${mapSceneBody}
`;
}

function createEmptyMapSceneBody() {
  return /* wgsl */ `
fn mapScene(point: vec3<f32>) -> SceneHit {
  return SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);
}
`;
}

export const sceneMappingShader = createSceneMappingShader();
