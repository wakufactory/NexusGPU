import { createContext, useContext, useEffect, useMemo } from "react";
import { clamp, normalizeQuaternion, normalizeVec3 } from "./math";
import { useSceneStore } from "./SceneContext";
import type {
  SdfBooleanOperation,
  SdfBoundingSphere,
  SdfBoxProps,
  SdfCylinderProps,
  SdfData,
  SdfEllipsoidProps,
  SdfFunctionProps,
  SdfGroupProps,
  SdfModifierProps,
  SdfModifierPreset,
  SdfNode,
  SdfSceneNode,
  SdfSphereProps,
  SdfTorusProps,
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
      hasRotation: rotation !== undefined,
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
      hasRotation: rotation !== undefined,
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

/** React propsからSDF円柱を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfCylinder({
  position,
  rotation,
  radius = 0.5,
  height = 1,
  color,
  smoothness = 0,
}: SdfCylinderProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();

  useEffect(() => {
    const normalizedRadius = Math.max(0.001, radius);
    const halfHeight = Math.max(0.001, height * 0.5);
    const node: SdfNode = {
      id,
      kind: "cylinder",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      hasRotation: rotation !== undefined,
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([normalizedRadius, halfHeight, 0, 0]),
      smoothness: clamp(smoothness, 0, 2),
      bounds: createCylinderBounds(position, normalizedRadius, halfHeight),
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [color, height, id, position, radius, rotation, smoothness, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return null;
}

/** React propsからSDFトーラスを作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfTorus({
  position,
  rotation,
  majorRadius = 0.7,
  minorRadius = 0.2,
  color,
  smoothness = 0,
}: SdfTorusProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();

  useEffect(() => {
    const normalizedMajorRadius = Math.max(0.001, majorRadius);
    const normalizedMinorRadius = Math.max(0.001, minorRadius);
    const node: SdfNode = {
      id,
      kind: "torus",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      hasRotation: rotation !== undefined,
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([normalizedMajorRadius, normalizedMinorRadius, 0, 0]),
      smoothness: clamp(smoothness, 0, 2),
      bounds: createTorusBounds(position, normalizedMajorRadius, normalizedMinorRadius),
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [color, id, majorRadius, minorRadius, position, rotation, smoothness, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return null;
}

/** React propsからSDF楕円球を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfEllipsoid({
  position,
  rotation,
  radii = [1, 0.6, 0.4],
  color,
  smoothness = 0,
}: SdfEllipsoidProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();

  useEffect(() => {
    const normalizedRadii = normalizeRadii(radii);
    const node: SdfNode = {
      id,
      kind: "ellipsoid",
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      hasRotation: rotation !== undefined,
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: createSdfData([...normalizedRadii, 0]),
      smoothness: clamp(smoothness, 0, 2),
      bounds: createEllipsoidBounds(position, normalizedRadii),
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [color, id, position, radii, rotation, smoothness, target]);

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
      hasRotation: rotation !== undefined,
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

/** 子SDFの評価前後にWGSL関数を差し込むmodifier。boundsは保持だけ行い、現状は枝刈りしない。 */
export function SdfModifier({
  preset,
  preModifierFunction,
  postModifierFunction,
  data0 = DEFAULT_DATA,
  data1 = DEFAULT_DATA,
  data2 = DEFAULT_DATA,
  bounds,
  children,
}: SdfModifierProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();
  const registry = useMemo(() => new SdfGroupRegistry(), []);
  const resolvedFunctions = useMemo(
    () => resolveSdfModifierFunctions(preset, preModifierFunction, postModifierFunction),
    [postModifierFunction, preModifierFunction, preset],
  );

  useEffect(() => {
    return registry.subscribe((childNodes) => {
      if (childNodes.length === 0) {
        target.removeSceneNode(id);
        return;
      }

      target.upsertSceneNode(id, {
        type: "modifier",
        preModifierFunction: resolvedFunctions.preModifierFunction,
        postModifierFunction: resolvedFunctions.postModifierFunction,
        data: createSdfData(data0, data1, data2),
        children: childNodes,
        bounds: createModifierBounds(childNodes, bounds),
      });
    });
  }, [bounds, data0, data1, data2, id, registry, resolvedFunctions, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return <SdfSceneNodeTargetContext.Provider value={registry}>{children}</SdfSceneNodeTargetContext.Provider>;
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

function createCylinderBounds(
  position: Vec3 | undefined,
  radius: number,
  halfHeight: number,
): SdfBoundingSphere {
  return {
    center: normalizeVec3(position, DEFAULT_POSITION),
    radius: Math.hypot(radius, halfHeight),
  };
}

function createTorusBounds(
  position: Vec3 | undefined,
  majorRadius: number,
  minorRadius: number,
): SdfBoundingSphere {
  return {
    center: normalizeVec3(position, DEFAULT_POSITION),
    radius: majorRadius + minorRadius,
  };
}

function createEllipsoidBounds(position: Vec3 | undefined, radii: Vec3): SdfBoundingSphere {
  return {
    center: normalizeVec3(position, DEFAULT_POSITION),
    radius: Math.max(radii[0], radii[1], radii[2]),
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

function createModifierBounds(
  children: readonly SdfSceneNode[],
  bounds: Partial<SdfBoundingSphere> | undefined,
): SdfBoundingSphere {
  const childBounds = createGroupBounds("or", children, 0);

  return {
    center: normalizeVec3(bounds?.center ?? childBounds.center, DEFAULT_POSITION),
    radius: Math.max(0.001, bounds?.radius ?? childBounds.radius),
  };
}

function resolveSdfModifierFunctions(
  preset: SdfModifierProps["preset"] | undefined,
  preModifierFunction: string | undefined,
  postModifierFunction: string | undefined,
) {
  const presets = typeof preset === "string" ? [preset] : preset ?? [];
  let resolvedPreModifierFunction = preModifierFunction;
  let resolvedPostModifierFunction = postModifierFunction;

  for (const presetName of presets) {
    const presetFunctions = resolveSdfModifierPreset(presetName);

    if (presetFunctions.preModifierFunction && !resolvedPreModifierFunction) {
      resolvedPreModifierFunction = presetFunctions.preModifierFunction;
    }

    if (presetFunctions.postModifierFunction && !resolvedPostModifierFunction) {
      resolvedPostModifierFunction = presetFunctions.postModifierFunction;
    }
  }

  return {
    preModifierFunction: resolvedPreModifierFunction,
    postModifierFunction: resolvedPostModifierFunction,
  };
}

type SdfModifierPresetFunctions = {
  preModifierFunction?: string;
  postModifierFunction?: string;
};

function resolveSdfModifierPreset(preset: SdfModifierPreset) {
  if (preset === "preRepeat") {
    return {
      preModifierFunction: /* wgsl */ `
let cell = max(abs(data0.xyz), vec3<f32>(0.0001));
return point - cell * round(point / cell);
`,
    } satisfies SdfModifierPresetFunctions;
  }

  if (preset === "twistY") {
    return {
      preModifierFunction: /* wgsl */ `
let angle = point.y * data0.x;
let c = cos(angle);
let s = sin(angle);
return vec3<f32>(c * point.x - s * point.z, point.y, s * point.x + c * point.z);
`,
      postModifierFunction: /* wgsl */ `
let radial = length(point.xz);
let stretch = sqrt(1.0 + data0.x * data0.x * radial * radial);
return hit.distance / max(stretch, 1.0);
`,
    } satisfies SdfModifierPresetFunctions;
  }

  if (preset === "postOnion") {
    return {
      postModifierFunction: /* wgsl */ `return abs(hit.distance) - data0.x;`,
    } satisfies SdfModifierPresetFunctions;
  }

  return {
    postModifierFunction: /* wgsl */ `return hit.distance - data0.x;`,
  } satisfies SdfModifierPresetFunctions;
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function lengthVec3(value: Vec3) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalizeRadii(radii: Vec3 | undefined): Vec3 {
  return normalizeVec3(radii, [1, 0.6, 0.4]).map((value) => Math.max(0.001, value)) as [number, number, number];
}
