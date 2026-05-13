import { createContext, useContext, useEffect, useMemo } from "react";
import {
  clamp,
  lengthVec3,
  normalizeQuaternion,
  normalizeVec3,
  rotateVec3ByQuaternion,
  subtractVec3,
} from "./math";
import { useSceneStore } from "./SceneContext";
import type {
  SdfBooleanOperation,
  SdfBoundingSphere,
  SdfBoxProps,
  SdfCapsuleProps,
  SdfConeProps,
  SdfCylinderProps,
  SdfData,
  SdfEllipsoidProps,
  SdfFunctionProps,
  SdfGroupProps,
  SdfMixProps,
  SdfModifierProps,
  SdfModifierPreset,
  SdfNode,
  SdfRegularPolyhedronProps,
  SdfSceneNode,
  SdfSphereProps,
  SdfTorusProps,
  Quaternion,
  Vec3,
  Vec4,
} from "./types";

const DEFAULT_COLOR = [0.18, 0.78, 0.72] as const;
const DEFAULT_POSITION = [0, 0, 0] as const;
const DEFAULT_ROTATION = [0, 0, 0, 1] as const;
const DEFAULT_DATA = [0, 0, 0, 0] as const;
const DEFAULT_MATERIAL_UNIFORM = [0, 0, 0, 0] as const;
const EMPTY_GROUP_BOUNDS: SdfBoundingSphere = { center: [0, 0, 0], radius: -1 };

type SdfSceneNodeListener = (nodes: readonly SdfSceneNode[]) => void;

type SdfSceneNodeTarget = {
  upsertSceneNode: (id: symbol, node: SdfSceneNode) => void;
  removeSceneNode: (id: symbol) => void;
};

type SdfPrimitiveNodeOptions = {
  active: boolean;
  kind: SdfNode["kind"];
  position: Vec3 | undefined;
  rotation: Quaternion | undefined;
  color: Vec3 | undefined;
  smoothness: number;
  material: SdfNode["material"];
  materialUniform: Vec4;
};

type SdfPrimitiveNodeFields = Pick<SdfNode, "data" | "bounds" | "sdfFunction">;

const SdfSceneNodeTargetContext = createContext<SdfSceneNodeTarget | null>(null);

/** React propsからSDF球を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfSphere({
  active = true,
  position,
  rotation,
  radius = 1,
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfSphereProps) {
  useSdfPrimitiveNode(
    { active, kind: "sphere", position, rotation, color, smoothness, material, materialUniform },
    () => ({
      data: createSdfData([Math.max(0.001, radius), 0, 0, 0]),
      bounds: createSphereBounds(position, radius),
    }),
    [radius],
  );

  return null;
}

/** React propsからSDFボックスを作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfBox({
  active = true,
  position,
  rotation,
  size = [1, 1, 1],
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfBoxProps) {
  // SDFのbox関数は半径ベクトルを使うため、propsのsizeは半分にしてGPUへ渡す。
  useSdfPrimitiveNode(
    { active, kind: "box", position, rotation, color, smoothness, material, materialUniform },
    () => ({
      data: createSdfData([...toHalfSize(size), 0]),
      bounds: createBoxBounds(position, size),
    }),
    [size],
  );

  return null;
}

/** React propsからSDF円柱を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfCylinder({
  active = true,
  position,
  rotation,
  radius = 0.5,
  height = 1,
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfCylinderProps) {
  useSdfPrimitiveNode(
    { active, kind: "cylinder", position, rotation, color, smoothness, material, materialUniform },
    () => {
      const normalizedRadius = Math.max(0.001, radius);
      const halfHeight = Math.max(0.001, height * 0.5);

      return {
        data: createSdfData([normalizedRadius, halfHeight, 0, 0]),
        bounds: createCylinderBounds(position, normalizedRadius, halfHeight),
      };
    },
    [height, radius],
  );

  return null;
}

/** React propsからSDF円錐台を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfCone({
  active = true,
  position,
  rotation,
  topRadius = 0,
  bottomRadius = 0.5,
  height = 1,
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfConeProps) {
  useSdfPrimitiveNode(
    { active, kind: "cone", position, rotation, color, smoothness, material, materialUniform },
    () => {
      const normalizedTopRadius = Math.max(0, topRadius);
      const normalizedBottomRadius = Math.max(0, bottomRadius);
      const halfHeight = Math.max(0.001, height * 0.5);

      return {
        data: createSdfData([normalizedTopRadius, normalizedBottomRadius, halfHeight, 0]),
        bounds: createConeBounds(position, normalizedTopRadius, normalizedBottomRadius, halfHeight),
      };
    },
    [bottomRadius, height, topRadius],
  );

  return null;
}

/** React propsから任意軸capsule/円柱を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfCapsule({
  active = true,
  position,
  rotation,
  top = [0, 0.5, 0],
  bottom = [0, -0.5, 0],
  radius = 0.25,
  round = 1,
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfCapsuleProps) {
  useSdfPrimitiveNode(
    { active, kind: "capsule", position, rotation, color, smoothness, material, materialUniform },
    () => {
      const normalizedTop = normalizeVec3(top, [0, 0.5, 0]);
      const normalizedBottom = normalizeVec3(bottom, [0, -0.5, 0]);
      const normalizedRadius = Math.max(0.001, radius);

      return {
        data: createSdfData([...normalizedTop, normalizedRadius], [...normalizedBottom, Math.max(0, round)]),
        bounds: createCapsuleBounds(position, rotation, normalizedTop, normalizedBottom, normalizedRadius),
      };
    },
    [bottom, radius, round, top],
  );

  return null;
}

/** React propsからSDFトーラスを作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfTorus({
  active = true,
  position,
  rotation,
  majorRadius = 0.7,
  minorRadius = 0.2,
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfTorusProps) {
  useSdfPrimitiveNode(
    { active, kind: "torus", position, rotation, color, smoothness, material, materialUniform },
    () => {
      const normalizedMajorRadius = Math.max(0.001, majorRadius);
      const normalizedMinorRadius = Math.max(0.001, minorRadius);

      return {
        data: createSdfData([normalizedMajorRadius, normalizedMinorRadius, 0, 0]),
        bounds: createTorusBounds(position, normalizedMajorRadius, normalizedMinorRadius),
      };
    },
    [majorRadius, minorRadius],
  );

  return null;
}

/** React propsからSDF楕円球を作り、SceneStoreへ登録する宣言的プリミティブ。 */
export function SdfEllipsoid({
  active = true,
  position,
  rotation,
  radii = [1, 0.6, 0.4],
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfEllipsoidProps) {
  useSdfPrimitiveNode(
    { active, kind: "ellipsoid", position, rotation, color, smoothness, material, materialUniform },
    () => {
      const normalizedRadii = normalizeRadii(radii);

      return {
        data: createSdfData([...normalizedRadii, 0]),
        bounds: createEllipsoidBounds(position, normalizedRadii),
      };
    },
    [radii],
  );

  return null;
}

export function SdfTetrahedron(props: SdfRegularPolyhedronProps) {
  return <SdfRegularPolyhedronPrimitive {...props} kind="tetrahedron" />;
}

export function SdfOctahedron(props: SdfRegularPolyhedronProps) {
  return <SdfRegularPolyhedronPrimitive {...props} kind="octahedron" />;
}

export function SdfDodecahedron(props: SdfRegularPolyhedronProps) {
  return <SdfRegularPolyhedronPrimitive {...props} kind="dodecahedron" />;
}

export function SdfIcosahedron(props: SdfRegularPolyhedronProps) {
  return <SdfRegularPolyhedronPrimitive {...props} kind="icosahedron" />;
}

function SdfRegularPolyhedronPrimitive({
  kind,
  active = true,
  position,
  rotation,
  radius = 1,
  color,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfRegularPolyhedronProps & { kind: "tetrahedron" | "octahedron" | "dodecahedron" | "icosahedron" }) {
  useSdfPrimitiveNode(
    { active, kind, position, rotation, color, smoothness, material, materialUniform },
    () => {
      const normalizedRadius = Math.max(0.001, radius);

      return {
        data: createSdfData([normalizedRadius, 0, 0, 0]),
        bounds: createSphereBounds(position, normalizedRadius),
      };
    },
    [radius],
  );

  return null;
}

/** WGSLのSDF関数文字列とdata0-2をそのまま渡す汎用SDFプリミティブ。 */
export function SdfFunction({
  active = true,
  position,
  rotation,
  color,
  smoothness = 0,
  sdfFunction,
  data0 = DEFAULT_DATA,
  data1 = DEFAULT_DATA,
  data2 = DEFAULT_DATA,
  bounds,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
}: SdfFunctionProps) {
  useSdfPrimitiveNode(
    { active, kind: "function", position, rotation, color, smoothness, material, materialUniform },
    () => ({
      data: createSdfData(data0, data1, data2),
      bounds: createFunctionBounds(position, data0, bounds),
      sdfFunction,
    }),
    [bounds, data0, data1, data2, sdfFunction],
  );

  return null;
}

/** 子SDFを1つのboolean演算単位にまとめ、boundsで評価スキップできるようにする。 */
export function SdfGroup({
  active = true,
  op = "or",
  position,
  rotation,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
  children,
}: SdfGroupProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();
  const registry = useMemo(() => new SdfGroupRegistry(), []);
  const normalizedSmoothness = clamp(smoothness, 0, 2);

  useEffect(() => {
    return registry.subscribe((childNodes) => {
      if (!active || childNodes.length === 0) {
        target.removeSceneNode(id);
        return;
      }

      const groupNode: SdfSceneNode = {
        type: "group",
        op,
        position: normalizeVec3(position, DEFAULT_POSITION),
        rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
        hasRotation: rotation !== undefined,
        smoothness: normalizedSmoothness,
        material,
        materialUniform,
        children: childNodes,
        bounds: createTransformedGroupBounds(
          createGroupBounds(op, childNodes, normalizedSmoothness),
          position,
          rotation,
        ),
      };

      target.upsertSceneNode(id, groupNode);
    });
  }, [active, id, material, materialUniform, normalizedSmoothness, op, position, registry, rotation, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return <SdfSceneNodeTargetContext.Provider value={registry}>{children}</SdfSceneNodeTargetContext.Provider>;
}

export function SdfNot({ active, children }: Pick<SdfGroupProps, "active" | "children">) {
  return (
    <SdfGroup active={active} op="not">
      {children}
    </SdfGroup>
  );
}

export function SdfSubtract({ active, children }: Pick<SdfGroupProps, "active" | "children">) {
  return (
    <SdfGroup active={active} op="subtract">
      {children}
    </SdfGroup>
  );
}

/** 2つの子SDFをratioで線形補間する。ratio=0で1つ目、ratio=1で2つ目に寄る。 */
export function SdfMix({ active = true, ratio = 0.5, children }: SdfMixProps) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();
  const registry = useMemo(() => new SdfGroupRegistry(), []);
  const normalizedRatio = clamp(ratio, 0, 1);

  useEffect(() => {
    return registry.subscribe((childNodes) => {
      if (!active || childNodes.length === 0) {
        target.removeSceneNode(id);
        return;
      }

      target.upsertSceneNode(id, {
        type: "mix",
        ratio: normalizedRatio,
        children: childNodes,
        bounds: createGroupBounds("or", childNodes, 0),
      });
    });
  }, [active, id, normalizedRatio, registry, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return <SdfSceneNodeTargetContext.Provider value={registry}>{children}</SdfSceneNodeTargetContext.Provider>;
}

/** 子SDFの評価前後にWGSL関数を差し込むmodifier。boundsは保持だけ行い、現状は枝刈りしない。 */
export function SdfModifier({
  active = true,
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

      if (!active) {
        target.upsertSceneNode(id, {
          type: "group",
          op: "or",
          position: DEFAULT_POSITION,
          rotation: DEFAULT_ROTATION,
          hasRotation: false,
          smoothness: 0,
          materialUniform: DEFAULT_MATERIAL_UNIFORM,
          children: childNodes,
          bounds: createGroupBounds("or", childNodes, 0),
        });
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
  }, [active, bounds, data0, data1, data2, id, registry, resolvedFunctions, target]);

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

function useSdfPrimitiveNode(
  options: SdfPrimitiveNodeOptions,
  createFields: () => SdfPrimitiveNodeFields,
  dependencies: readonly unknown[],
) {
  const target = useSdfSceneNodeTarget();
  const id = useStableId();
  const { active, kind, position, rotation, color, smoothness, material, materialUniform } = options;

  // props変更ごとにGPUへ渡すノード情報を作り直す。
  useEffect(() => {
    if (!active) {
      target.removeSceneNode(id);
      return;
    }

    const fields = createFields();
    const node: SdfNode = {
      id,
      kind,
      position: normalizeVec3(position, DEFAULT_POSITION),
      rotation: normalizeQuaternion(rotation, DEFAULT_ROTATION),
      hasRotation: rotation !== undefined,
      color: normalizeVec3(color, DEFAULT_COLOR),
      data: fields.data,
      smoothness: clamp(smoothness, 0, 2),
      material,
      materialUniform,
      bounds: fields.bounds,
      sdfFunction: fields.sdfFunction,
    };

    target.upsertSceneNode(id, { type: "primitive", node, bounds: node.bounds });
  }, [active, color, id, kind, material, materialUniform, position, rotation, smoothness, target, ...dependencies]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);
}

class SdfGroupRegistry implements SdfSceneNodeTarget {
  private nodes = new Map<symbol, SdfSceneNode>();
  private listeners = new Set<SdfSceneNodeListener>();
  private emitQueued = false;

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
    // group配下の子ノード更新が連続しても、親への通知はmicrotaskで1回にまとめる。
    if (this.emitQueued) {
      return;
    }

    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      this.flushEmit();
    });
  }

  private flushEmit() {
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

function createConeBounds(
  position: Vec3 | undefined,
  topRadius: number,
  bottomRadius: number,
  halfHeight: number,
): SdfBoundingSphere {
  return {
    center: normalizeVec3(position, DEFAULT_POSITION),
    radius: Math.hypot(Math.max(topRadius, bottomRadius), halfHeight),
  };
}

function createCapsuleBounds(
  position: Vec3 | undefined,
  rotation: Quaternion | undefined,
  top: Vec3,
  bottom: Vec3,
  radius: number,
): SdfBoundingSphere {
  const center: Vec3 = [
    (top[0] + bottom[0]) * 0.5,
    (top[1] + bottom[1]) * 0.5,
    (top[2] + bottom[2]) * 0.5,
  ];
  const normalizedPosition = normalizeVec3(position, DEFAULT_POSITION);
  const normalizedRotation = normalizeQuaternion(rotation, DEFAULT_ROTATION);
  const rotatedCenter = rotation ? rotateVec3ByQuaternion(center, normalizedRotation) : center;

  return {
    center: [
      rotatedCenter[0] + normalizedPosition[0],
      rotatedCenter[1] + normalizedPosition[1],
      rotatedCenter[2] + normalizedPosition[2],
    ],
    radius: lengthVec3(subtractVec3(top, bottom)) * 0.5 + radius,
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

function createTransformedGroupBounds(
  bounds: SdfBoundingSphere,
  position: Vec3 | undefined,
  rotation: Quaternion | undefined,
): SdfBoundingSphere {
  if (bounds.radius < 0) {
    return bounds;
  }

  const normalizedPosition = normalizeVec3(position, DEFAULT_POSITION);
  const normalizedRotation = normalizeQuaternion(rotation, DEFAULT_ROTATION);
  const rotatedCenter = rotation ? rotateVec3ByQuaternion(bounds.center, normalizedRotation) : bounds.center;

  return {
    center: [
      rotatedCenter[0] + normalizedPosition[0],
      rotatedCenter[1] + normalizedPosition[1],
      rotatedCenter[2] + normalizedPosition[2],
    ],
    radius: bounds.radius,
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
let repeatAxis = abs(data0.xyz) > vec3<f32>(0.0001);
let cell = select(vec3<f32>(1.0), abs(data0.xyz), repeatAxis);
let repeatedPoint = point - cell * round(point / cell);
return select(point, repeatedPoint, repeatAxis);
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

  if (preset === "preScale") {
    return {
      preModifierFunction: /* wgsl */ `
let scale = select(data0.xyz, vec3<f32>(1.0), abs(data0.xyz) <= vec3<f32>(0.0001));
return point / scale;
`,
      postModifierFunction: /* wgsl */ `
let scale = select(abs(data0.xyz), vec3<f32>(1.0), abs(data0.xyz) <= vec3<f32>(0.0001));
let distanceScale = min(scale.x, min(scale.y, scale.z));
return hit.distance * distanceScale;
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

function normalizeRadii(radii: Vec3 | undefined): Vec3 {
  return normalizeVec3(radii, [1, 0.6, 0.4]).map((value) => Math.max(0.001, value)) as [number, number, number];
}
