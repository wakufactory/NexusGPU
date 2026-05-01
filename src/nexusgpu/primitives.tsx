import { createContext, useContext, useEffect, useMemo } from "react";
import { clamp, normalizeQuaternion, normalizeVec3 } from "./math";
import { useSceneStore } from "./SceneContext";
import type {
  SdfBooleanOperation,
  SdfBoundingSphere,
  SdfBoxProps,
  SdfData,
  SdfFunctionProps,
  SdfGroupProps,
  SdfNode,
  SdfSceneNode,
  SdfSphereProps,
  Vec3,
  Vec4,
} from "./types";

const DEFAULT_COLOR = [0.18, 0.78, 0.72] as const;
const DEFAULT_POSITION = [0, 0, 0] as const;
const DEFAULT_ROTATION = [0, 0, 0, 1] as const;
const DEFAULT_DATA = [0, 0, 0, 0] as const;
const EMPTY_GROUP_BOUNDS: SdfBoundingSphere = { center: [0, 0, 0], radius: -1 };

type SdfSceneNodeListener = (nodes: readonly SdfSceneNode[]) => void;

type SdfSceneNodeTarget = {
  upsertSceneNode: (id: symbol, node: SdfSceneNode) => void;
  removeSceneNode: (id: symbol) => void;
};

const SdfSceneNodeTargetContext = createContext<SdfSceneNodeTarget | null>(null);

/** React propsからSDF球を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfSphere({
  position,
  rotation,
  radius = 1,
  color,
  smoothness = 0,
}: SdfSphereProps) {
  const target = useSdfSceneNodeTarget();
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
      bounds: createSphereBounds(position, radius),
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [color, id, position, radius, rotation, smoothness, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return null;
}

/** React propsからSDFボックスを作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfBox({ position, rotation, size = [1, 1, 1], color, smoothness = 0 }: SdfBoxProps) {
  const target = useSdfSceneNodeTarget();
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
      bounds: createBoxBounds(position, size),
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [color, id, position, rotation, size, smoothness, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return null;
}

/** WGSLのSDF関数文字列とdata0-2をそのまま渡す汎用SDFプリミティブ。 */
export function SdfFunction({
  position,
  rotation,
  color,
  smoothness = 0,
  sdfFunction,
  data0 = DEFAULT_DATA,
  data1 = DEFAULT_DATA,
  data2 = DEFAULT_DATA,
  bounds,
}: SdfFunctionProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();

  useEffect(() => {
    const node: SdfNode = {
      id,
      kind: "function",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData(data0, data1, data2),
      smoothness: clamp(smoothness, 0, 2),
      bounds: createFunctionBounds(position, data0, bounds),
      sdfFunction,
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [bounds, color, data0, data1, data2, id, position, rotation, sdfFunction, smoothness, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return null;
}

/** 子SDFを1つのboolean演算単位にまとめ、boundsで評価スキップできるようにする。 */
export function SdfGroup({ op = "or", smoothness = 0, children }: SdfGroupProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();
  const registry = useMemo(() => new SdfGroupRegistry(), []);
  const normalizedSmoothness = clamp(smoothness, 0, 2);

  useEffect(() => {
    return registry.subscribe((childNodes) => {
      if (childNodes.length === 0) {
        target.removeSceneNode(id);
        return;
      }

      const groupNode: SdfSceneNode = {
        type: "group",
        op,
        smoothness: normalizedSmoothness,
        children: childNodes,
        bounds: createGroupBounds(op, childNodes, normalizedSmoothness),
      };

      target.upsertSceneNode(id, groupNode);
    });
  }, [id, normalizedSmoothness, op, registry, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return <SdfSceneNodeTargetContext.Provider value={registry}>{children}</SdfSceneNodeTargetContext.Provider>;
}

export function SdfNot({ children }: Pick<SdfGroupProps, "children">) {
  return <SdfGroup op="not">{children}</SdfGroup>;
}

export function SdfSubtract({ children }: Pick<SdfGroupProps, "children">) {
  return <SdfGroup op="subtract">{children}</SdfGroup>;
}

/** React再レンダーをまたいで同じSDFノードIDを保つ。 */
function useStableId() {
  return useMemo(() => Symbol("nexusgpu.sdf"), []);
}

function useSdfSceneNodeTarget(): SdfSceneNodeTarget {
  const contextTarget = useContext(SdfSceneNodeTargetContext);
  const store = useSceneStore();

  return contextTarget ?? store;
}

class SdfGroupRegistry implements SdfSceneNodeTarget {
  private nodes = new Map<symbol, SdfSceneNode>();
  private listeners = new Set<SdfSceneNodeListener>();

  upsertSceneNode(id: symbol, node: SdfSceneNode) {
    this.nodes.set(id, node);
    this.emit();
  }

  removeSceneNode(id: symbol) {
    this.nodes.delete(id);
    this.emit();
  }

  subscribe(listener: SdfSceneNodeListener) {
    this.listeners.add(listener);
    listener(this.snapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private snapshot() {
    return [...this.nodes.values()];
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
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

function createSphereBounds(position: Vec3 | undefined, radius: number): SdfBoundingSphere {
  return {
    center: normalizeVec3(position, DEFAULT_POSITION),
    radius: Math.max(0.001, radius),
  };
}

function createBoxBounds(position: Vec3 | undefined, size: Vec3 | undefined): SdfBoundingSphere {
  return {
    center: normalizeVec3(position, DEFAULT_POSITION),
    radius: lengthVec3(toHalfSize(size)),
  };
}

function createFunctionBounds(
  position: Vec3 | undefined,
  data0: Vec4,
  bounds: Partial<SdfBoundingSphere> | undefined,
): SdfBoundingSphere {
  // 任意WGSLは形状推定できないため、未指定時はdata0.xyzを保守的な半径ヒントとして使う。
  const hintedRadius = Math.max(lengthVec3([data0[0], data0[1], data0[2]]), 1);

  return {
    center: normalizeVec3(bounds?.center ?? position, DEFAULT_POSITION),
    radius: Math.max(0.001, bounds?.radius ?? hintedRadius),
  };
}

function createGroupBounds(
  op: SdfBooleanOperation,
  children: readonly SdfSceneNode[],
  smoothness: number,
): SdfBoundingSphere {
  const boundedChildren = children.map((child) => child.bounds).filter((bounds) => bounds.radius >= 0);

  if (boundedChildren.length === 0) {
    return EMPTY_GROUP_BOUNDS;
  }

  if (op === "subtract" || op === "not") {
    return inflateBounds(boundedChildren[0], smoothness);
  }

  if (op === "and") {
    return inflateBounds(
      boundedChildren.reduce((smallest, current) => (current.radius < smallest.radius ? current : smallest)),
      smoothness,
    );
  }

  return inflateBounds(boundedChildren.reduce(mergeBoundingSpheres), smoothness);
}

function mergeBoundingSpheres(a: SdfBoundingSphere, b: SdfBoundingSphere): SdfBoundingSphere {
  const delta = subtractVec3(b.center, a.center);
  const distance = lengthVec3(delta);

  if (a.radius >= distance + b.radius) {
    return a;
  }

  if (b.radius >= distance + a.radius) {
    return b;
  }

  const radius = (distance + a.radius + b.radius) * 0.5;
  const t = distance <= 0.0001 ? 0 : (radius - a.radius) / distance;

  return {
    center: [a.center[0] + delta[0] * t, a.center[1] + delta[1] * t, a.center[2] + delta[2] * t],
    radius,
  };
}

function inflateBounds(bounds: SdfBoundingSphere, amount: number): SdfBoundingSphere {
  return {
    center: bounds.center,
    radius: bounds.radius < 0 ? bounds.radius : bounds.radius + Math.max(0, amount),
  };
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function lengthVec3(value: Vec3) {
  return Math.hypot(value[0], value[1], value[2]);
}
