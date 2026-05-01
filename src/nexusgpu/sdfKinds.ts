/** React側のSDF primitive名と、GPU buffer / WGSL側で使うkind IDの対応表。 */
export const SDF_PRIMITIVE_KIND_IDS = {
  sphere: 0,
  box: 1,
} as const;

export const CUSTOM_SDF_PRIMITIVE_KIND_START = 1000;

export type BuiltinSdfPrimitiveKind = keyof typeof SDF_PRIMITIVE_KIND_IDS;
export type SdfPrimitiveKind = BuiltinSdfPrimitiveKind | "function";
