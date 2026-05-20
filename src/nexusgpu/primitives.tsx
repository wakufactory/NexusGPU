import { createContext, useContext, useEffect, useMemo } from "react";
import {
  clamp,
  normalizeQuaternion,
  normalizeVec3,
} from "./math";
import { useSceneStore } from "./SceneContext";
import type {
  SdfBoundingSphere,
  SdfBoundsProp,
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
      bounds: createExplicitBounds(bounds),
      sdfFunction,
    }),
    [bounds, data0, data1, data2, sdfFunction],
  );

  return null;
}

/** 子SDFを1つのboolean演算単位にまとめる。bounds指定時だけdistance pathで評価スキップできる。 */
export function SdfGroup({
  active = true,
  op = "or",
  position,
  rotation,
  smoothness = 0,
  material,
  materialUniform = DEFAULT_MATERIAL_UNIFORM,
  bounds,
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
        bounds: createExplicitBounds(bounds),
      };

      target.upsertSceneNode(id, groupNode);
    });
  }, [active, bounds, id, material, materialUniform, normalizedSmoothness, op, position, registry, rotation, target]);

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
      });
    });
  }, [active, id, normalizedRatio, registry, target]);

  useEffect(() => {
    return () => target.removeSceneNode(id);
  }, [id, target]);

  return <SdfSceneNodeTargetContext.Provider value={registry}>{children}</SdfSceneNodeTargetContext.Provider>;
}

/** 子SDFの評価前後にWGSL関数を差し込むmodifier。 */
export function SdfModifier({
  active = true,
  preset,
  preModifierFunction,
  postModifierFunction,
  data0 = DEFAULT_DATA,
  data1 = DEFAULT_DATA,
  data2 = DEFAULT_DATA,
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
        });
        return;
      }

      target.upsertSceneNode(id, {
        type: "modifier",
        preModifierFunction: resolvedFunctions.preModifierFunction,
        postModifierFunction: resolvedFunctions.postModifierFunction,
        data: createSdfData(data0, data1, data2),
        children: childNodes,
      });
    });
  }, [active, data0, data1, data2, id, registry, resolvedFunctions, target]);

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

    target.upsertSceneNode(id, { type: "primitive", node });
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

function createExplicitBounds(bounds: SdfBoundsProp | undefined): SdfBoundingSphere | undefined {
  if (!bounds || !Number.isFinite(bounds.radius) || bounds.radius <= 0) {
    return undefined;
  }

  return {
    center: normalizeVec3(bounds.center ?? DEFAULT_POSITION, DEFAULT_POSITION),
    radius: Math.max(0.001, bounds.radius),
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
var repeatedPoint = point - cell * round(point / cell);
let cellIndex = floor((point + cell * 0.5) / cell);
let localPoint = point - cell * cellIndex;
let oddCell = abs(cellIndex - 2.0 * floor(cellIndex * 0.5)) > vec3<f32>(0.5);
let mirroredPoint = select(localPoint, -localPoint, oddCell);
if (data0.w > 0.5) {
  repeatedPoint = mirroredPoint;
}
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
