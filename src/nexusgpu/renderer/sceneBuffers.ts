import { MAX_SDF_OBJECTS } from "../sdfShader";
import type { SdfData, SdfNode, SdfSceneNode } from "../types";

export const OBJECT_STRIDE_FLOATS = 24;
export const OBJECT_BUFFER_SIZE = MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

type SdfRecord = number[];
type GetSdfKindId = (node: SdfNode) => number;

/** シーン木を深さ優先でたどり、Storage Bufferへ積むprimitive / modifierレコード列へ変換する。 */
export function compileSceneObjectRecords(sceneNodes: readonly SdfSceneNode[], getSdfKindId: GetSdfKindId) {
  const records: SdfRecord[] = [];

  for (const node of sceneNodes) {
    appendSceneObjectRecord(node, records, getSdfKindId);
  }

  return records;
}

/** グループを除いたprimitive / modifierレコード数を数え、camera.objectInfo.xへ渡す値に使う。 */
export function countSceneObjectRecords(sceneNodes: readonly SdfSceneNode[]): number {
  return sceneNodes.reduce((count, node) => {
    if (node.type === "primitive") {
      return count + 1;
    }

    if (node.type === "modifier") {
      return count + 1 + countSceneObjectRecords(node.children);
    }

    return count + countSceneObjectRecords(node.children);
  }, 0);
}

/** グループを展開し、primitiveとmodifierをrecordsへ追加する。 */
function appendSceneObjectRecord(node: SdfSceneNode, records: SdfRecord[], getSdfKindId: GetSdfKindId) {
  if (node.type === "primitive") {
    records.push(createPrimitiveRecord(node.node, getSdfKindId(node.node)));
    return;
  }

  if (node.type === "modifier") {
    records.push(createModifierRecord(node.data));
  }

  for (const child of node.children) {
    appendSceneObjectRecord(child, records, getSdfKindId);
  }
}

/** SdfNodeをWGSL側のSdfObject構造体と同じ24個のf32配列へ詰める。 */
function createPrimitiveRecord(node: SdfNode, kindId: number): SdfRecord {
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
  ];
}
