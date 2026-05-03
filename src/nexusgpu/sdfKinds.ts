/** React側のSDF primitive名と、GPU buffer / WGSL側で使うkind IDの対応表。 */
export const SDF_PRIMITIVE_KIND_IDS = {
  sphere: 0,
  box: 1,
  cylinder: 2,
  torus: 3,
  ellipsoid: 4,
} as const;

export const CUSTOM_SDF_PRIMITIVE_KIND_START = 5;

/** primitive IDと衝突しない、GPU命令列用の演算ノードID。 */
export const SDF_OPERATION_KIND_IDS = {
  groupBegin: 1000,
  groupEnd: 1001,
} as const;

/** boolean演算はshader内で小さな数値IDとして扱う。 */
export const SDF_BOOLEAN_OPERATION_IDS = {
  or: 0,
  and: 1,
  subtract: 2,
  not: 3,
} as const;

export type BuiltinSdfPrimitiveKind = keyof typeof SDF_PRIMITIVE_KIND_IDS;
export type SdfPrimitiveKind = BuiltinSdfPrimitiveKind | "function";
