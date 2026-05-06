import { SDF_PRIMITIVE_KIND_IDS } from "../sdfKinds";
import type { SdfBooleanOperation, SdfModifierSceneNode, SdfNode, SdfSceneNode } from "../types";
import {
  createSdfModifierFunctionKey,
  type CustomSdfFunctionNameMap,
  type CustomSdfModifierFunctionNameMap,
} from "./customWgslFunctions";

type ExpandedSceneCompileState = {
  /** objects[]の何番目を参照するか。Storage Bufferへの詰め順と一致させる。 */
  objectIndex: number;
  /** 生成WGSL内の一時変数名を衝突させないための連番。 */
  tempIndex: number;
};

type SceneCompileMode = "distance" | "eval";

type ExpandedSceneCompileResult = {
  /** このnodeを評価するためのWGSL文列。 */
  code: string;
  /** codeの末尾で生成されたSceneDistanceまたはSceneEval変数名。 */
  hitName: string;
  /** 親グループがboolean演算時に使うsmoothness式。 */
  smoothnessExpression: string;
};

export type SceneCompileProfile = {
  sceneRoots: number;
  primitives: {
    total: number;
    byKind: Record<string, number>;
    builtinWithAnalyticGrad: number;
    customSceneEval: number;
    customNoGrad: number;
  };
  groups: {
    total: number;
    byOp: Record<SdfBooleanOperation, number>;
    smoothMergeOps: number;
    hardMergeOps: number;
  };
  modifiers: {
    total: number;
    withPre: number;
    withPost: number;
    invalidatesGrad: number;
  };
  gradient: {
    analyticPrimitiveCalcsPerMapDistance: number;
    analyticPrimitiveCalcsPerMapEval: number;
    customSceneEvalCalcsPerMapEval: number;
    totalAnalyticCalcsPerMapEval: number;
    smoothBlendOpsPerMapEval: number;
    finiteDifferenceFallbackMapSceneCalls: number;
  };
};

/** scene tree全体を、Fragment Shaderから呼ぶmapSceneEval(point)関数のWGSL bodyへ展開する。 */
export function createExpandedMapSceneBody(
  sceneNodes: readonly SdfSceneNode[],
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  customModifierFunctionNames: CustomSdfModifierFunctionNameMap,
) {
  const distanceState: ExpandedSceneCompileState = { objectIndex: 0, tempIndex: 0 };
  const evalState: ExpandedSceneCompileState = { objectIndex: 0, tempIndex: 0 };
  const chunks: string[] = [
    "fn mapSceneDistance(point: vec3<f32>) -> SceneDistance {",
    "  var best = sceneDistance(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);",
  ];

  for (const node of sceneNodes) {
    const result = compileExpandedSceneNode(
      node,
      distanceState,
      customSdfFunctionNames,
      customModifierFunctionNames,
      "point",
      "distance",
    );
    chunks.push(result.code);
    chunks.push(`  best = unionDistance(best, ${result.hitName}, ${result.smoothnessExpression});`);
  }

  chunks.push("  return best;");
  chunks.push("}");
  chunks.push("");
  chunks.push("fn mapSceneEval(point: vec3<f32>) -> SceneEval {");
  chunks.push("  var best = sceneEvalNoGrad(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, point);");

  for (const node of sceneNodes) {
    const result = compileExpandedSceneNode(
      node,
      evalState,
      customSdfFunctionNames,
      customModifierFunctionNames,
      "point",
      "eval",
    );
    chunks.push(result.code);
    chunks.push(`  best = unionHit(best, ${result.hitName}, ${result.smoothnessExpression});`);
  }

  chunks.push("  return best;");
  chunks.push("}");
  chunks.push("");
  chunks.push("fn mapScene(point: vec3<f32>) -> SceneHit {");
  chunks.push("  return sceneHitFromEval(mapSceneEval(point));");
  chunks.push("}");

  return chunks.join("\n");
}

/** scene未設定時に使う空のmapScene()。背景距離を返して何もhitしない状態にする。 */
export function createEmptyMapSceneBody() {
  return [
    "fn mapSceneDistance(point: vec3<f32>) -> SceneDistance {",
    "  return sceneDistance(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);",
    "}",
    "",
    "fn mapSceneEval(point: vec3<f32>) -> SceneEval {",
    "  return sceneEvalNoGrad(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, point);",
    "}",
    "",
    "fn mapScene(point: vec3<f32>) -> SceneHit {",
    "  return sceneHitFromEval(mapSceneEval(point));",
    "}",
  ].join("\n");
}

export function createSceneCompileProfile(
  sceneNodes: readonly SdfSceneNode[],
  customSdfFunctionNames: CustomSdfFunctionNameMap,
): SceneCompileProfile {
  const profile: SceneCompileProfile = {
    sceneRoots: sceneNodes.length,
    primitives: {
      total: 0,
      byKind: {},
      builtinWithAnalyticGrad: 0,
      customSceneEval: 0,
      customNoGrad: 0,
    },
    groups: {
      total: 0,
      byOp: {
        or: 0,
        and: 0,
        subtract: 0,
        not: 0,
      },
      smoothMergeOps: 0,
      hardMergeOps: 0,
    },
    modifiers: {
      total: 0,
      withPre: 0,
      withPost: 0,
      invalidatesGrad: 0,
    },
    gradient: {
      analyticPrimitiveCalcsPerMapDistance: 0,
      analyticPrimitiveCalcsPerMapEval: 0,
      customSceneEvalCalcsPerMapEval: 0,
      totalAnalyticCalcsPerMapEval: 0,
      smoothBlendOpsPerMapEval: 0,
      finiteDifferenceFallbackMapSceneCalls: 4,
    },
  };

  for (const node of sceneNodes) {
    accumulateSceneCompileProfile(node, customSdfFunctionNames, profile);
  }

  profile.gradient.totalAnalyticCalcsPerMapEval =
    profile.gradient.analyticPrimitiveCalcsPerMapEval + profile.gradient.customSceneEvalCalcsPerMapEval;
  profile.gradient.smoothBlendOpsPerMapEval = profile.groups.smoothMergeOps;

  return profile;
}

function accumulateSceneCompileProfile(
  node: SdfSceneNode,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  profile: SceneCompileProfile,
) {
  if (node.type === "primitive") {
    const kind = node.node.kind;
    profile.primitives.total += 1;
    profile.primitives.byKind[kind] = (profile.primitives.byKind[kind] ?? 0) + 1;

    if (kind !== "function" && kind in SDF_PRIMITIVE_KIND_IDS) {
      profile.primitives.builtinWithAnalyticGrad += 1;
      profile.gradient.analyticPrimitiveCalcsPerMapEval += 1;
      return;
    }

    const callSpec = node.node.sdfFunction ? customSdfFunctionNames.get(node.node.sdfFunction) : undefined;
    if (callSpec?.returnsSceneEval) {
      profile.primitives.customSceneEval += 1;
      profile.gradient.customSceneEvalCalcsPerMapEval += 1;
    } else {
      profile.primitives.customNoGrad += 1;
    }

    return;
  }

  if (node.type === "modifier") {
    profile.modifiers.total += 1;
    if (node.preModifierFunction) {
      profile.modifiers.withPre += 1;
    }
    if (node.postModifierFunction) {
      profile.modifiers.withPost += 1;
    }
    if (node.preModifierFunction || node.postModifierFunction) {
      profile.modifiers.invalidatesGrad += 1;
    }

    for (const child of node.children) {
      accumulateSceneCompileProfile(child, customSdfFunctionNames, profile);
    }

    return;
  }

  profile.groups.total += 1;
  profile.groups.byOp[node.op] += 1;
  if (node.children.length > 1 && node.op !== "not") {
    const mergeOps = node.children.length - 1;
    if (node.smoothness > 0.0001) {
      profile.groups.smoothMergeOps += mergeOps;
    } else {
      profile.groups.hardMergeOps += mergeOps;
    }
  }

  for (const child of node.children) {
    accumulateSceneCompileProfile(child, customSdfFunctionNames, profile);
  }
}

/** 1つのscene nodeを評価するWGSL片へ再帰的にコンパイルする。 */
function compileExpandedSceneNode(
  node: SdfSceneNode,
  state: ExpandedSceneCompileState,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  customModifierFunctionNames: CustomSdfModifierFunctionNameMap,
  pointExpression: string,
  mode: SceneCompileMode,
): ExpandedSceneCompileResult {
  if (node.type === "primitive") {
    const objectIndex = state.objectIndex;
    const hitName = nextTempName("hit", state);
    const objectName = nextTempName("object", state);
    const localPointName = nextTempName("localPoint", state);
    const hitExpression = createPrimitiveHitExpression(
      node.node,
      localPointName,
      objectName,
      customSdfFunctionNames,
      mode,
    );

    state.objectIndex += 1;

    return {
      code: [
        `  let ${objectName} = objects[${objectIndex}u];`,
        `  let ${localPointName} = ${createLocalPointExpression(node.node, objectName, pointExpression)};`,
        `  let ${hitName} = ${hitExpression};`,
      ].join("\n"),
      hitName,
      smoothnessExpression: `${hitName}.smoothness`,
    };
  }

  if (node.type === "modifier") {
    return compileExpandedModifierNode(
      node,
      state,
      customSdfFunctionNames,
      customModifierFunctionNames,
      pointExpression,
      mode,
    );
  }

  const children = node.children.map((child) =>
    compileExpandedSceneNode(child, state, customSdfFunctionNames, customModifierFunctionNames, pointExpression, mode),
  );
  const hitName = nextTempName("groupHit", state);
  const smoothness = formatWgslFloat(node.smoothness);

  if (children.length === 0) {
    return {
      code:
        mode === "eval"
          ? `  let ${hitName} = sceneEvalNoGrad(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, ${pointExpression});`
          : `  let ${hitName} = sceneDistance(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);`,
      hitName,
      smoothnessExpression: smoothness,
    };
  }

  if (node.op === "not") {
    const notFunction = mode === "eval" ? "notHit" : "notDistance";
    return {
      code: [children[0].code, `  let ${hitName} = ${notFunction}(${children[0].hitName});`].join("\n"),
      hitName,
      smoothnessExpression: smoothness,
    };
  }

  const lines = children.map((child) => child.code);
  lines.push(`  var ${hitName} = ${children[0].hitName};`);

  for (const child of children.slice(1)) {
    if (node.op === "and") {
      lines.push(`  ${hitName} = ${mode === "eval" ? "intersectHit" : "intersectDistance"}(${hitName}, ${child.hitName}, ${smoothness});`);
    } else if (node.op === "subtract") {
      lines.push(`  ${hitName} = ${mode === "eval" ? "subtractHit" : "subtractDistance"}(${hitName}, ${child.hitName}, ${smoothness});`);
    } else {
      lines.push(`  ${hitName} = ${mode === "eval" ? "unionHit" : "unionDistance"}(${hitName}, ${child.hitName}, ${smoothness});`);
    }
  }

  return {
    code: lines.join("\n"),
    hitName,
    smoothnessExpression: smoothness,
  };
}

/** modifier nodeを評価し、preなら子の入力point、postなら子のSceneHitを加工する。 */
function compileExpandedModifierNode(
  node: SdfModifierSceneNode,
  state: ExpandedSceneCompileState,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  customModifierFunctionNames: CustomSdfModifierFunctionNameMap,
  pointExpression: string,
  mode: SceneCompileMode,
): ExpandedSceneCompileResult {
  const modifierObjectIndex = state.objectIndex;
  const modifierObjectName = nextTempName("modifierObject", state);
  state.objectIndex += 1;

  if (node.children.length === 0) {
    const hitName = nextTempName("modifierHit", state);

    return {
      code:
        mode === "eval"
          ? `  let ${hitName} = sceneEvalNoGrad(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, ${pointExpression});`
          : `  let ${hitName} = sceneDistance(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);`,
      hitName,
      smoothnessExpression: `${hitName}.smoothness`,
    };
  }

  const preCallSpec = node.preModifierFunction
    ? customModifierFunctionNames.get(createSdfModifierFunctionKey("pre", node.preModifierFunction))
    : null;
  const postCallSpec = node.postModifierFunction
    ? customModifierFunctionNames.get(createSdfModifierFunctionKey("post", node.postModifierFunction))
    : null;

  if (node.preModifierFunction && !preCallSpec) {
    throw new Error("SdfModifier pre function was not registered before scene shader expansion.");
  }

  if (node.postModifierFunction && !postCallSpec) {
    throw new Error("SdfModifier post function was not registered before scene shader expansion.");
  }

  const lines: string[] = [];
  let childPointExpression = pointExpression;

  if (preCallSpec || postCallSpec) {
    lines.push(`  let ${modifierObjectName} = objects[${modifierObjectIndex}u];`);
  }

  if (preCallSpec) {
    childPointExpression = nextTempName("modifiedPoint", state);
    lines.push(
      `  let ${childPointExpression} = ${preCallSpec.functionName}(${pointExpression}, ${formatSdfDataArgs(modifierObjectName)});`,
    );
  }

  const childResult = compileExpandedSceneNode(
    node.children.length === 1 ? node.children[0] : createImplicitUnionGroup(node.children),
    state,
    customSdfFunctionNames,
    customModifierFunctionNames,
    childPointExpression,
    mode,
  );
  lines.push(childResult.code);

  if (!postCallSpec) {
    if (preCallSpec) {
      const hitName = nextTempName("preModifiedHit", state);
      if (mode === "eval") {
        lines.push(`  let ${hitName} = invalidateSceneEvalGrad(${childResult.hitName});`);
      } else {
        lines.push(`  let ${hitName} = ${childResult.hitName};`);
      }

      return {
        code: lines.join("\n"),
        hitName,
        smoothnessExpression: `${hitName}.smoothness`,
      };
    }

    return {
      code: lines.join("\n"),
      hitName: childResult.hitName,
      smoothnessExpression: childResult.smoothnessExpression,
    };
  }

  const hitName = nextTempName("modifiedHit", state);
  const customCall =
    mode === "eval"
      ? `${postCallSpec.functionName}(sceneHitFromEval(${childResult.hitName}), ${pointExpression}, ${formatSdfDataArgs(modifierObjectName)})`
      : `${postCallSpec.functionName}(sceneHitFromDistance(${childResult.hitName}, ${pointExpression}), ${pointExpression}, ${formatSdfDataArgs(modifierObjectName)})`;
  const hitExpression =
    mode === "eval"
      ? postCallSpec.returnsSceneHit
        ? `sceneEvalFromHit(${customCall})`
        : `sceneEvalNoGrad(${customCall}, ${childResult.hitName}.color, ${childResult.hitName}.smoothness, ${childResult.hitName}.localPoint)`
      : postCallSpec.returnsSceneHit
        ? `sceneDistanceFromHit(${customCall})`
        : `sceneDistance(${customCall}, ${childResult.hitName}.color, ${childResult.hitName}.smoothness)`;
  lines.push(`  let ${hitName} = ${hitExpression};`);

  return {
    code: lines.join("\n"),
    hitName,
    smoothnessExpression: `${hitName}.smoothness`,
  };
}

function createImplicitUnionGroup(children: readonly SdfSceneNode[]): SdfSceneNode {
  return {
    type: "group",
    op: "or",
    smoothness: 0,
    children,
    bounds: { center: [0, 0, 0], radius: -1 },
  };
}

/** rotation propが省略されていれば、WGSL上のquaternion計算を生成せず平行移動だけにする。 */
function createLocalPointExpression(node: SdfNode, objectName: string, pointExpression: string) {
  const translatedPoint = `${pointExpression} - ${objectName}.positionKind.xyz`;

  if (!node.hasRotation) {
    return translatedPoint;
  }

  return `rotateByQuaternion(${translatedPoint}, vec4<f32>(-${objectName}.rotation.xyz, ${objectName}.rotation.w))`;
}

/** 組み込みprimitiveまたはSdfFunction呼び出しをSceneHit式として生成する。 */
function createPrimitiveHitExpression(
  node: SdfNode,
  localPointName: string,
  objectName: string,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  mode: SceneCompileMode,
) {
  // builtinは解析的gradientつきSceneEval、customのf32距離だけを返す形式はgradientなしSceneEvalへ包む。
  const createBuiltinHit = (distanceExpression: string, localGradExpression: string) => {
    if (mode === "distance") {
      return `sceneDistance(${distanceExpression}, ${objectName}.colorSmooth.rgb, ${objectName}.colorSmooth.w)`;
    }

    const worldGradExpression = node.hasRotation
      ? `rotateByQuaternion(${localGradExpression}, ${objectName}.rotation)`
      : localGradExpression;

    return `sceneEvalWithGrad(${distanceExpression}, ${objectName}.colorSmooth.rgb, ${objectName}.colorSmooth.w, ${localPointName}, ${worldGradExpression})`;
  };

  const createDefaultHit = (distanceExpression: string) =>
    mode === "eval"
      ? `sceneEvalNoGrad(${distanceExpression}, ${objectName}.colorSmooth.rgb, ${objectName}.colorSmooth.w, ${localPointName})`
      : `sceneDistance(${distanceExpression}, ${objectName}.colorSmooth.rgb, ${objectName}.colorSmooth.w)`;

  if (node.kind === "sphere") {
    return createBuiltinHit(
      `sdSphere(${localPointName}, ${objectName}.data0.x)`,
      `sdSphereGrad(${localPointName})`,
    );
  }

  if (node.kind === "box") {
    return createBuiltinHit(
      `sdBox(${localPointName}, ${objectName}.data0.xyz)`,
      `sdBoxGrad(${localPointName}, ${objectName}.data0.xyz)`,
    );
  }

  if (node.kind === "cylinder") {
    return createBuiltinHit(
      `sdCylinder(${localPointName}, ${objectName}.data0.xy)`,
      `sdCylinderGrad(${localPointName}, ${objectName}.data0.xy)`,
    );
  }

  if (node.kind === "torus") {
    return createBuiltinHit(
      `sdTorus(${localPointName}, ${objectName}.data0.xy)`,
      `sdTorusGrad(${localPointName}, ${objectName}.data0.xy)`,
    );
  }

  if (node.kind === "ellipsoid") {
    return createBuiltinHit(
      `sdEllipsoid(${localPointName}, ${objectName}.data0.xyz)`,
      `sdEllipsoidGrad(${localPointName}, ${objectName}.data0.xyz)`,
    );
  }

  if (!node.sdfFunction) {
    throw new Error("SdfFunction requires a non-empty WGSL function string.");
  }

  const callSpec = customSdfFunctionNames.get(node.sdfFunction);
  if (!callSpec) {
    throw new Error("SdfFunction was not registered before scene shader expansion.");
  }

  const args = [
    localPointName,
    `${objectName}.data0`,
    `${objectName}.data1`,
    `${objectName}.data2`,
    ...(callSpec.acceptsColor ? [`${objectName}.colorSmooth.rgb`] : []),
    ...(callSpec.acceptsSmoothness ? [`${objectName}.colorSmooth.w`] : []),
  ].join(", ");
  const customCall = `${callSpec.functionName}(${args})`;

  // SceneEval形式はWGSL関数内でgradientまで決めるため、そのままmapSceneEval()へ渡す。
  if (callSpec.returnsSceneEval) {
    if (mode === "distance") {
      return `sceneDistanceFromEval(${customCall})`;
    }

    return node.hasRotation ? `rotateSceneEvalGrad(${customCall}, ${objectName}.rotation)` : customCall;
  }

  // SceneHit形式はWGSL関数内で色とsmoothnessを決めるため、gradientなしのSceneEvalへ変換する。
  if (callSpec.returnsSceneHit) {
    return mode === "eval" ? `sceneEvalFromHit(${customCall})` : `sceneDistanceFromHit(${customCall})`;
  }

  return createDefaultHit(customCall);
}

/** pipeline再生成の要否を判定するため、scene treeの形だけを安定した文字列にする。 */
export function createSceneTopologySignature(sceneNodes: readonly SdfSceneNode[]): string {
  return sceneNodes.map(createSceneNodeTopologySignature).join("|");
}

/** 1つのscene nodeをtopology signature用の短い文字列へ変換する。 */
function createSceneNodeTopologySignature(node: SdfSceneNode): string {
  if (node.type === "primitive") {
    const rotationSignature = node.node.hasRotation ? "rotated" : "unrotated";

    return node.node.kind === "function"
      ? `function:${rotationSignature}:${node.node.sdfFunction ?? ""}`
      : `${node.node.kind}:${rotationSignature}`;
  }

  if (node.type === "modifier") {
    return `modifier:${node.preModifierFunction ?? ""}:${node.postModifierFunction ?? ""}(${node.children
      .map(createSceneNodeTopologySignature)
      .join(",")})`;
  }

  return `group:${node.op}:${formatWgslFloat(node.smoothness)}(${node.children
    .map(createSceneNodeTopologySignature)
    .join(",")})`;
}

/** 生成WGSL内で使う一時変数名を発行する。 */
function nextTempName(prefix: string, state: ExpandedSceneCompileState) {
  const name = `${prefix}${state.tempIndex}`;
  state.tempIndex += 1;
  return name;
}

/** JSのnumberをWGSLのf32リテラルとして安全に埋め込む。 */
function formatWgslFloat(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0";
  }

  const rounded = Math.round(value * 1000000) / 1000000;
  return Number.isInteger(rounded) ? `${rounded}.0` : `${rounded}`;
}

function formatSdfDataArgs(objectName: string) {
  return `${objectName}.data0, ${objectName}.data1, ${objectName}.data2`;
}
