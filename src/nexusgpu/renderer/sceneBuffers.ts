import { MAX_SDF_OBJECTS } from "../sdfShader";
import { collectSceneNodesPreOrder, countSceneNodes } from "../sceneTraversal";
import type { SdfData, SdfGroupSceneNode, SdfNode, SdfSceneNode } from "../types";

export const OBJECT_STRIDE_FLOATS = 32;
export const OBJECT_BUFFER_SIZE = MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

type SdfRecord = number[];
type GetSdfKindId = (node: SdfNode) => number;
type GetMaterialId = (node: SdfNode | SdfGroupSceneNode) => number;

/** シーン木を深さ優先でたどり、Storage Bufferへ積むprimitive / group / modifier / mixレコード列へ変換する。 */
export function compileSceneObjectRecords(
  sceneNodes: readonly SdfSceneNode[],
  getSdfKindId: GetSdfKindId,
  getMaterialId: GetMaterialId,
) {
  const records: SdfRecord[] = [];

  for (const node of collectSceneNodesPreOrder(sceneNodes)) {
    records.push(createSceneObjectRecord(node, getSdfKindId, getMaterialId));
  }

  return records;
}

/** シーン木を展開した補助レコード数を数え、camera.objectInfo.xへ渡す値に使う。 */
export function countSceneObjectRecords(sceneNodes: readonly SdfSceneNode[]): number {
  return countSceneNodes(sceneNodes);
}

/** primitive / group / modifier / mixの1ノードをStorage Buffer用レコードへ変換する。 */
function createSceneObjectRecord(
  node: SdfSceneNode,
  getSdfKindId: GetSdfKindId,
  getMaterialId: GetMaterialId,
): SdfRecord {
  if (node.type === "primitive") {
    return createPrimitiveRecord(node.node, getSdfKindId(node.node), getMaterialId(node.node));
  }

  if (node.type === "modifier") {
    return createModifierRecord(node.data);
  }

  if (node.type === "mix") {
    return createMixRecord(node.ratio);
  }

  return createGroupRecord(node, getMaterialId(node));
}

/** SdfNodeをWGSL側のSdfObject構造体と同じ固定長f32配列へ詰める。 */
function createPrimitiveRecord(node: SdfNode, kindId: number, materialId: number): SdfRecord {
  return [
    node.position[0],
    node.position[1],
    node.position[2],
    kindId,
    ...node.data[0],
    ...node.data[1],
    ...node.data[2],
    node.color[0],
    node.color[1],
    node.color[2],
    node.smoothness,
    node.rotation[0],
    node.rotation[1],
    node.rotation[2],
    node.rotation[3],
    materialId,
    0,
    0,
    0,
    ...node.materialUniform,
  ];
}

/** Modifierはdata0-2だけを使うため、同じSdfObjectレイアウトへ補助レコードとして詰める。 */
function createModifierRecord(data: SdfData): SdfRecord {
  return [
    0,
    0,
    0,
    0,
    ...data[0],
    ...data[1],
    ...data[2],
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
}

/** Mixはdata0.xだけをratioとして使う補助レコードとして詰める。 */
function createMixRecord(ratio: number): SdfRecord {
  return [
    0,
    0,
    0,
    0,
    ratio,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
}

/** Groupはtransform、動的smoothness、materialを同じSdfObjectレイアウトへ補助レコードとして詰める。 */
function createGroupRecord(node: SdfGroupSceneNode, materialId: number): SdfRecord {
  return [
    node.position[0],
    node.position[1],
    node.position[2],
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    node.smoothness,
    node.rotation[0],
    node.rotation[1],
    node.rotation[2],
    node.rotation[3],
    materialId,
    0,
    0,
    0,
    ...node.materialUniform,
  ];
}
