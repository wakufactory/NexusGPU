/** React側のSDF primitive名と、GPU buffer / WGSL側で使うkind IDの対応表。 */
export const SDF_PRIMITIVE_KIND_IDS = {
  sphere: 0,
  box: 1,
} as const;

export type SdfPrimitiveKind = keyof typeof SDF_PRIMITIVE_KIND_IDS;
