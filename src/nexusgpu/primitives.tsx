import { useEffect, useMemo } from "react";
import { clamp, normalizeQuaternion, normalizeVec3 } from "./math";
import { useSceneStore } from "./SceneContext";
import type { SdfBoxProps, SdfData, SdfNode, SdfSphereProps, Vec3, Vec4 } from "./types";

const DEFAULT_COLOR = [0.18, 0.78, 0.72] as const;
const DEFAULT_POSITION = [0, 0, 0] as const;
const DEFAULT_ROTATION = [0, 0, 0, 1] as const;

/** React propsからSDF球を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfSphere({
  position,
  rotation,
  radius = 1,
  color,
  smoothness = 0,
}: SdfSphereProps) {
  const store = useSceneStore();
  const id = useStableId();

  // props変更ごとにGPUへ渡すノード情報を作り直す。
  useEffect(() => {
    const node: SdfNode = {
      id,
      kind: "sphere",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([Math.max(0.001, radius), 0, 0, 0]),
      smoothness: clamp(smoothness, 0, 2),
    };

    store.upsertNode(node);
  }, [color, id, position, radius, rotation, smoothness, store]);

  useEffect(() => {
    return () => store.removeNode(id);
  }, [id, store]);

  return null;
}

/** React propsからSDFボックスを作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfBox({ position, rotation, size = [1, 1, 1], color, smoothness = 0 }: SdfBoxProps) {
  const store = useSceneStore();
  const id = useStableId();

  // SDFのbox関数は半径ベクトルを使うため、propsのsizeは半分にしてGPUへ渡す。
  useEffect(() => {
    const node: SdfNode = {
      id,
      kind: "box",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([...toHalfSize(size), 0]),
      smoothness: clamp(smoothness, 0, 2),
    };

    store.upsertNode(node);
  }, [color, id, position, rotation, size, smoothness, store]);

  useEffect(() => {
    return () => store.removeNode(id);
  }, [id, store]);

  return null;
}

/** React再レンダーをまたいで同じSDFノードIDを保つ。 */
function useStableId() {
  return useMemo(() => Symbol("nexusgpu.sdf"), []);
}

function createSdfData(data0: Vec4, data1: Vec4 = [0, 0, 0, 0], data2: Vec4 = [0, 0, 0, 0]): SdfData {
  return [data0, data1, data2];
}

function toHalfSize(size: Vec3 | undefined): Vec3 {
  return normalizeVec3(size, [1, 1, 1]).map((value) => Math.max(0.001, value * 0.5)) as [
    number,
    number,
    number,
  ];
}
