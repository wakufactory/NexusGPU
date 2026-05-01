import { SDF_BOOLEAN_OPERATION_IDS, SDF_OPERATION_KIND_IDS, SDF_PRIMITIVE_KIND_IDS } from "../sdfKinds";

export type CustomSdfFunctionShaderEntry = {
  kindId: number;
  functionName: string;
};

export function createSceneMappingShader(customSdfFunctions: readonly CustomSdfFunctionShaderEntry[] = []) {
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

fn combineHit(op: u32, current: SceneHit, next: SceneHit, smoothness: f32, childCount: u32) -> SceneHit {
  if (childCount == 0u) {
    return next;
  }

  if (op == ${SDF_BOOLEAN_OPERATION_IDS.and}u) {
    return intersectHit(current, next);
  }

  if (op == ${SDF_BOOLEAN_OPERATION_IDS.subtract}u) {
    return subtractHit(current, next);
  }

  return unionHit(current, next, smoothness);
}

fn evalPrimitive(object: SdfObject, point: vec3<f32>) -> SceneHit {
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

// シーン内の命令列を走査し、指定点から最も近い表面距離を返す。
fn mapScene(point: vec3<f32>) -> SceneHit {
  var best = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9));
  var groupDistances: array<f32, MAX_GROUP_STACK>;
  var groupColors: array<vec3<f32>, MAX_GROUP_STACK>;
  var groupOps: array<u32, MAX_GROUP_STACK>;
  var groupSmoothness: array<f32, MAX_GROUP_STACK>;
  var groupChildCounts: array<u32, MAX_GROUP_STACK>;
  var groupDepth = 0u;
  var i = 0u;

  loop {
    if (i >= MAX_OBJECTS || f32(i) >= camera.objectInfo.x) {
      break;
    }

    let object = objects[i];
    let kind = u32(object.positionKind.w + 0.5);

    if (kind == ${SDF_OPERATION_KIND_IDS.groupBegin}u) {
      let op = u32(object.data2.y + 0.5);
      let endIndex = u32(object.data2.x + 0.5);
      let boundRadius = object.data1.w;

      // top-level ORグループだけ、既存の最短候補よりboundsが遠ければ安全に読み飛ばす。
      if (groupDepth == 0u && op == ${SDF_BOOLEAN_OPERATION_IDS.or}u && boundRadius >= 0.0) {
        let boundDistance = length(point - object.data1.xyz) - boundRadius;
        if (boundDistance >= best.distance) {
          i = endIndex + 1u;
          continue;
        }
      }

      if (groupDepth < MAX_GROUP_STACK) {
        groupDistances[groupDepth] = camera.renderInfo.y;
        groupColors[groupDepth] = vec3<f32>(0.72, 0.82, 0.9);
        groupOps[groupDepth] = op;
        groupSmoothness[groupDepth] = object.colorSmooth.w;
        groupChildCounts[groupDepth] = 0u;
        groupDepth = groupDepth + 1u;
      }

      i = i + 1u;
      continue;
    }

    if (kind == ${SDF_OPERATION_KIND_IDS.groupEnd}u) {
      var groupHit = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9));

      if (groupDepth > 0u) {
        let groupIndex = groupDepth - 1u;
        groupHit = SceneHit(groupDistances[groupIndex], groupColors[groupIndex]);

        if (groupOps[groupIndex] == ${SDF_BOOLEAN_OPERATION_IDS.not}u) {
          groupHit = notHit(groupHit);
        }

        groupDepth = groupIndex;
      }

      if (groupDepth == 0u) {
        best = unionHit(best, groupHit, object.colorSmooth.w);
      } else {
        let parentIndex = groupDepth - 1u;
        let merged = combineHit(
          groupOps[parentIndex],
          SceneHit(groupDistances[parentIndex], groupColors[parentIndex]),
          groupHit,
          groupSmoothness[parentIndex],
          groupChildCounts[parentIndex]
        );
        groupDistances[parentIndex] = merged.distance;
        groupColors[parentIndex] = merged.color;
        groupChildCounts[parentIndex] = groupChildCounts[parentIndex] + 1u;
      }

      i = i + 1u;
      continue;
    }

    let primitiveHit = evalPrimitive(object, point);

    if (groupDepth == 0u) {
      best = unionHit(best, primitiveHit, object.colorSmooth.w);
    } else {
      let groupIndex = groupDepth - 1u;
      let merged = combineHit(
        groupOps[groupIndex],
        SceneHit(groupDistances[groupIndex], groupColors[groupIndex]),
        primitiveHit,
        groupSmoothness[groupIndex],
        groupChildCounts[groupIndex]
      );
      groupDistances[groupIndex] = merged.distance;
      groupColors[groupIndex] = merged.color;
      groupChildCounts[groupIndex] = groupChildCounts[groupIndex] + 1u;
    }

    i = i + 1u;
  }

  return best;
}
`;
}

export const sceneMappingShader = createSceneMappingShader();
