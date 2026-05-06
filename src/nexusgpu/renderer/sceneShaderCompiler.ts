import type { SdfModifierSceneNode, SdfNode, SdfSceneNode } from "../types";
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

type ExpandedSceneCompileResult = {
  /** このnodeを評価するためのWGSL文列。 */
  code: string;
  /** codeの末尾で生成されたSceneHit変数名。 */
  hitName: string;
  /** 親グループがboolean演算時に使うsmoothness式。 */
  smoothnessExpression: string;
};

/** scene tree全体を、Fragment Shaderから呼ぶmapScene(point)関数のWGSL bodyへ展開する。 */
export function createExpandedMapSceneBody(
  sceneNodes: readonly SdfSceneNode[],
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  customModifierFunctionNames: CustomSdfModifierFunctionNameMap,
) {
  const state: ExpandedSceneCompileState = { objectIndex: 0, tempIndex: 0 };
  const chunks: string[] = [
    "fn mapScene(point: vec3<f32>) -> SceneHit {",
    "  var best = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, vec3<f32>(0.0));",
  ];

  for (const node of sceneNodes) {
    const result = compileExpandedSceneNode(node, state, customSdfFunctionNames, customModifierFunctionNames, "point");
    chunks.push(result.code);
    chunks.push(`  best = unionHit(best, ${result.hitName}, ${result.smoothnessExpression});`);
  }

  chunks.push("  return best;");
  chunks.push("}");

  return chunks.join("\n");
}

/** scene未設定時に使う空のmapScene()。背景距離を返して何もhitしない状態にする。 */
export function createEmptyMapSceneBody() {
  return [
    "fn mapScene(point: vec3<f32>) -> SceneHit {",
    "  return SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, vec3<f32>(0.0));",
    "}",
  ].join("\n");
}

/** 1つのscene nodeを評価するWGSL片へ再帰的にコンパイルする。 */
function compileExpandedSceneNode(
  node: SdfSceneNode,
  state: ExpandedSceneCompileState,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
  customModifierFunctionNames: CustomSdfModifierFunctionNameMap,
  pointExpression: string,
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
    );
  }

  const children = node.children.map((child) =>
    compileExpandedSceneNode(child, state, customSdfFunctionNames, customModifierFunctionNames, pointExpression),
  );
  const hitName = nextTempName("groupHit", state);
  const smoothness = formatWgslFloat(node.smoothness);

  if (children.length === 0) {
    return {
      code: `  let ${hitName} = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, vec3<f32>(0.0));`,
      hitName,
      smoothnessExpression: smoothness,
    };
  }

  if (node.op === "not") {
    return {
      code: [children[0].code, `  let ${hitName} = notHit(${children[0].hitName});`].join("\n"),
      hitName,
      smoothnessExpression: smoothness,
    };
  }

  const lines = children.map((child) => child.code);
  lines.push(`  var ${hitName} = ${children[0].hitName};`);

  for (const child of children.slice(1)) {
    if (node.op === "and") {
      lines.push(`  ${hitName} = intersectHit(${hitName}, ${child.hitName}, ${smoothness});`);
    } else if (node.op === "subtract") {
      lines.push(`  ${hitName} = subtractHit(${hitName}, ${child.hitName}, ${smoothness});`);
    } else {
      lines.push(`  ${hitName} = unionHit(${hitName}, ${child.hitName}, ${smoothness});`);
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
): ExpandedSceneCompileResult {
  const modifierObjectIndex = state.objectIndex;
  const modifierObjectName = nextTempName("modifierObject", state);
  state.objectIndex += 1;

  if (node.children.length === 0) {
    const hitName = nextTempName("modifierHit", state);

    return {
      code: `  let ${hitName} = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0, vec3<f32>(0.0));`,
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
  );
  lines.push(childResult.code);

  if (!postCallSpec) {
    return {
      code: lines.join("\n"),
      hitName: childResult.hitName,
      smoothnessExpression: childResult.smoothnessExpression,
    };
  }

  const hitName = nextTempName("modifiedHit", state);
  const customCall = `${postCallSpec.functionName}(${childResult.hitName}, ${pointExpression}, ${formatSdfDataArgs(modifierObjectName)})`;
  const hitExpression = postCallSpec.returnsSceneHit
    ? customCall
    : `SceneHit(${customCall}, ${childResult.hitName}.color, ${childResult.hitName}.smoothness, ${childResult.hitName}.localPoint)`;
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
) {
  // f32距離だけを返す形式は、objectの色とsmoothnessで従来通りSceneHitへ包む。
  const createDefaultHit = (distanceExpression: string) =>
    `SceneHit(${distanceExpression}, ${objectName}.colorSmooth.rgb, ${objectName}.colorSmooth.w, ${localPointName})`;

  if (node.kind === "sphere") {
    return createDefaultHit(`sdSphere(${localPointName}, ${objectName}.data0.x)`);
  }

  if (node.kind === "box") {
    return createDefaultHit(`sdBox(${localPointName}, ${objectName}.data0.xyz)`);
  }

  if (node.kind === "cylinder") {
    return createDefaultHit(`sdCylinder(${localPointName}, ${objectName}.data0.xy)`);
  }

  if (node.kind === "torus") {
    return createDefaultHit(`sdTorus(${localPointName}, ${objectName}.data0.xy)`);
  }

  if (node.kind === "ellipsoid") {
    return createDefaultHit(`sdEllipsoid(${localPointName}, ${objectName}.data0.xyz)`);
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

  // SceneHit形式はWGSL関数内で色とsmoothnessを決めるため、そのままmapScene()へ渡す。
  if (callSpec.returnsSceneHit) {
    return customCall;
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
