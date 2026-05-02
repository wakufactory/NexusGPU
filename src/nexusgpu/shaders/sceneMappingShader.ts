import { SDF_PRIMITIVE_KIND_IDS } from "../sdfKinds";

export type CustomSdfFunctionShaderEntry = {
  kindId: number;
  functionName: string;
};

export function createSceneMappingShader(
  customSdfFunctions: readonly CustomSdfFunctionShaderEntry[] = [],
  mapSceneBody: string = createFlatUnionMapSceneBody(),
) {
  const customBranches = customSdfFunctions
    .map(
      ({ kindId, functionName }) => /* wgsl */ `  } else if (kind == ${kindId}u) {
    distance = ${functionName}(localPoint, object.data0, object.data1, object.data2);
`,
    )
    .join("");

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

fn evalObject(index: u32, point: vec3<f32>) -> SceneHit {
  let object = objects[index];
  let localPoint = rotateByQuaternion(point - object.positionKind.xyz, vec4<f32>(-object.rotation.xyz, object.rotation.w));
  let kind = u32(object.positionKind.w + 0.5);
  var distance = camera.renderInfo.y;

  if (kind == ${SDF_PRIMITIVE_KIND_IDS.sphere}u) {
    distance = sdSphere(localPoint, object.data0.x);
  } else if (kind == ${SDF_PRIMITIVE_KIND_IDS.box}u) {
    distance = sdBox(localPoint, object.data0.xyz);
${customBranches}  }

  return SceneHit(distance, object.colorSmooth.rgb);
}

${mapSceneBody}
`;
}

function createFlatUnionMapSceneBody() {
  return /* wgsl */ `
// group未使用時のfallback。現在のobject bufferをそのままunion評価する。
fn mapScene(point: vec3<f32>) -> SceneHit {
  var best = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9));

  for (var i = 0u; i < MAX_OBJECTS; i = i + 1u) {
    if (f32(i) >= camera.objectInfo.x) {
      break;
    }

    let hit = evalObject(i, point);
    best = unionHit(best, hit, objects[i].colorSmooth.w);
  }

  return best;
}
`;
}

export const sceneMappingShader = createSceneMappingShader();
