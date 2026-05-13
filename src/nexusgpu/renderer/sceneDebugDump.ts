import { MAX_SDF_OBJECTS } from "../sdfShader";
import { walkSceneNodesPreOrder } from "../sceneTraversal";
import type { SceneCompileProfile } from "./sceneShaderCompiler";
import type { SceneSnapshot, SdfNode, SdfSceneNode } from "../types";

type GetSdfKindId = (node: SdfNode) => number;

export function logSceneCompileProfile(
  profile: SceneCompileProfile,
): void {
  console.log("[NexusGPU] SDF scene compile profile data", JSON.stringify(profile, null, 2));
}

export function logSceneObjectsDump(
  snapshot: SceneSnapshot,
  getSdfKindId: GetSdfKindId,
) {
  const objectDump = createSceneObjectDump(snapshot.sceneNodes, getSdfKindId).slice(0, MAX_SDF_OBJECTS);

  console.log("[NexusGPU] SDF scene objects dump", JSON.stringify(objectDump, null, 2));
}

function createSceneObjectDump(sceneNodes: readonly SdfSceneNode[], getSdfKindId: GetSdfKindId) {
  const rows: Array<Record<string, unknown>> = [];

  walkSceneNodesPreOrder(sceneNodes, (node) => appendSceneObjectDumpRow(node, rows, getSdfKindId));

  return rows;
}

function appendSceneObjectDumpRow(
  node: SdfSceneNode,
  rows: Array<Record<string, unknown>>,
  getSdfKindId: GetSdfKindId,
) {
  if (node.type === "primitive") {
    const object = node.node;
    rows.push({
      index: rows.length,
      type: "primitive",
      kind: object.kind,
      kindId: getSdfKindId(object),
      position: formatVec(object.position),
      rotation: formatVec(object.rotation),
      color: formatVec(object.color),
      smoothness: object.smoothness,
      data0: formatVec(object.data[0]),
      data1: formatVec(object.data[1]),
      data2: formatVec(object.data[2]),
      bounds: `center=${formatVec(node.bounds.center)} radius=${formatNumber(node.bounds.radius)}`,
      sdfFunction: object.sdfFunction ? previewSource(object.sdfFunction) : "",
    });
    return;
  }

  if (node.type === "modifier") {
    rows.push({
      index: rows.length,
      type: "modifier",
      kind: "modifier",
      kindId: 0,
      position: formatVec([0, 0, 0]),
      rotation: formatVec([0, 0, 0, 1]),
      color: formatVec([0, 0, 0]),
      smoothness: 0,
      data0: formatVec(node.data[0]),
      data1: formatVec(node.data[1]),
      data2: formatVec(node.data[2]),
      bounds: `center=${formatVec(node.bounds.center)} radius=${formatNumber(node.bounds.radius)}`,
      preModifier: node.preModifierFunction ? previewSource(node.preModifierFunction) : "",
      postModifier: node.postModifierFunction ? previewSource(node.postModifierFunction) : "",
    });
    return;
  }

  if (node.type === "mix") {
    rows.push({
      index: rows.length,
      type: "mix",
      kind: "mix",
      kindId: 0,
      position: formatVec([0, 0, 0]),
      rotation: formatVec([0, 0, 0, 1]),
      color: formatVec([0, 0, 0]),
      smoothness: 0,
      data0: formatVec([node.ratio, 0, 0, 0]),
      data1: formatVec([0, 0, 0, 0]),
      data2: formatVec([0, 0, 0, 0]),
      bounds: `center=${formatVec(node.bounds.center)} radius=${formatNumber(node.bounds.radius)}`,
    });
    return;
  }

  rows.push({
    index: rows.length,
    type: "group",
    op: node.op,
    kind: "group",
    kindId: 0,
    position: formatVec(node.position),
    rotation: formatVec(node.rotation),
    hasRotation: node.hasRotation,
    color: formatVec([0, 0, 0]),
    smoothness: node.smoothness,
    data0: formatVec([0, 0, 0, 0]),
    data1: formatVec([0, 0, 0, 0]),
    data2: formatVec([0, 0, 0, 0]),
    bounds: `center=${formatVec(node.bounds.center)} radius=${formatNumber(node.bounds.radius)}`,
  });
}

function formatVec(values: readonly number[]) {
  return `[${values.map(formatNumber).join(", ")}]`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return `${value}`;
  }

  return `${Math.round(value * 1000000) / 1000000}`;
}

function previewSource(source: string) {
  const normalized = source.trim().replace(/\s+/g, " ");
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}
