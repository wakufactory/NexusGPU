import { useEffect, useMemo } from "react";
import { clamp, normalizeVec3 } from "./math";
import { useSceneStore } from "./SceneContext";
import type { SdfBoxProps, SdfNode, SdfSphereProps } from "./types";

const DEFAULT_COLOR = [0.18, 0.78, 0.72] as const;
const DEFAULT_POSITION = [0, 0, 0] as const;

/** React propsからSDF球を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfSphere({
  position,
  radius = 1,
  color,
  smoothness = 0,
}: SdfSphereProps) {
  const store = useSceneStore();
  const id = useStableId();

  // props変更ごとにGPUへ渡すノード情報を作り直し、アンマウント時はストアから削除する。
  useEffect(() => {
    const node: SdfNode = {
      id,
      kind: "sphere",
      position: normalizeVec3(position, DEFAULT_POSITION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: [Math.max(0.001, radius), 0, 0],
      smoothness: clamp(smoothness, 0, 2),
    };

    store.upsertNode(node);
    return () => store.removeNode(id);
  }, [color, id, position, radius, smoothness, store]);

  return null;
}

/** React propsからSDFボックスを作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfBox({ position, size = [1, 1, 1], color, smoothness = 0 }: SdfBoxProps) {
  const store = useSceneStore();
  const id = useStableId();

  // SDFのbox関数は半径ベクトルを使うため、propsのsizeは半分にしてGPUへ渡す。
  useEffect(() => {
    const node: SdfNode = {
      id,
      kind: "box",
      position: normalizeVec3(position, DEFAULT_POSITION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: normalizeVec3(size, [1, 1, 1]).map((value) => Math.max(0.001, value * 0.5)) as [
        number,
        number,
        number,
      ],
      smoothness: clamp(smoothness, 0, 2),
    };

    store.upsertNode(node);
    return () => store.removeNode(id);
  }, [color, id, position, size, smoothness, store]);

  return null;
}

/** React再レンダーをまたいで同じSDFノードIDを保つ。 */
function useStableId() {
  return useMemo(() => Symbol("nexusgpu.sdf"), []);
}
