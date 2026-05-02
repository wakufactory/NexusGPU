export function createSceneMappingShader(mapSceneBody: string = createEmptyMapSceneBody()) {
  return /* wgsl */ `
fn unionHit(a: SceneHit, b: SceneHit, smoothness: f32) -> SceneHit {
  let distance = smoothMin(a.distance, b.distance, smoothness);
  var color = a.color;

  if (b.distance < a.distance) {
    color = b.color;
  }

  if (smoothness > 0.0001) {
    let colorBlend = 1.0 - smoothstep(0.0, smoothness, abs(a.distance - b.distance));
    color = mix(color, a.color, colorBlend * 0.3);
  }

  return SceneHit(distance, color);
}

fn intersectHit(a: SceneHit, b: SceneHit) -> SceneHit {
  if (a.distance > b.distance) {
    return a;
  }

  return b;
}

fn subtractHit(a: SceneHit, b: SceneHit) -> SceneHit {
  return SceneHit(max(a.distance, -b.distance), a.color);
}

fn notHit(value: SceneHit) -> SceneHit {
  return SceneHit(-value.distance, value.color);
}

${mapSceneBody}
`;
}

function createEmptyMapSceneBody() {
  return /* wgsl */ `
fn mapScene(point: vec3<f32>) -> SceneHit {
  return SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9));
}
`;
}

export const sceneMappingShader = createSceneMappingShader();
