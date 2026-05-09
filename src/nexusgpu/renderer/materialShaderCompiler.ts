import type { NexusMaterialRef, SdfGroupSceneNode, SdfNode, SdfSceneNode } from "../types";

export const DEFAULT_MATERIAL_ID = 0;
const NORMAL_MATERIAL_ID = 1;
const TEXTURE0_COLOR_MATERIAL_ID = 2;
const TEXTURE0_MATCAP_MATERIAL_ID = 3;
const CUSTOM_MATERIAL_ID_START = 16;

export type MaterialShaderPlan = {
  shader: string;
  signature: string;
  customMaterialIds: ReadonlyMap<string, number>;
};

type CustomMaterial = {
  key: string;
  source: string;
  id: number;
};

export function createMaterialShaderPlan(sceneNodes: readonly SdfSceneNode[]): MaterialShaderPlan {
  const customMaterials = collectCustomMaterials(sceneNodes).map((material, index) => ({
    ...material,
    id: CUSTOM_MATERIAL_ID_START + index,
  }));
  const customMaterialIds = new Map(customMaterials.map((material) => [material.key, material.id]));

  return {
    shader: createMaterialShader(customMaterials),
    signature: customMaterials.map((material) => `${material.id}:${material.key}:${material.source}`).join("\n"),
    customMaterialIds,
  };
}

export function getBuiltinMaterialId(material: NexusMaterialRef | undefined) {
  if (!material || material === "default") {
    return DEFAULT_MATERIAL_ID;
  }

  if (material === "normal") {
    return NORMAL_MATERIAL_ID;
  }

  if (material === "texture0Color") {
    return TEXTURE0_COLOR_MATERIAL_ID;
  }

  if (material === "texture0Matcap") {
    return TEXTURE0_MATCAP_MATERIAL_ID;
  }

  return null;
}

export function getCustomMaterialKey(material: NexusMaterialRef) {
  return typeof material === "string" ? material : material.key ?? material.wgsl;
}

function collectCustomMaterials(sceneNodes: readonly SdfSceneNode[]) {
  const materialSources = new Map<string, string>();

  for (const node of sceneNodes) {
    collectCustomMaterialsFromNode(node, materialSources);
  }

  return [...materialSources.entries()].map(([key, source]) => ({ key, source }));
}

function collectCustomMaterialsFromNode(node: SdfSceneNode, materialSources: Map<string, string>) {
  if (node.type === "primitive") {
    addCustomMaterial(node.node, materialSources);
    return;
  }

  if (node.type === "group") {
    addCustomMaterial(node, materialSources);
  }

  for (const child of node.children) {
    collectCustomMaterialsFromNode(child, materialSources);
  }
}

function addCustomMaterial(node: SdfNode | SdfGroupSceneNode, materialSources: Map<string, string>) {
  if (!node.material || typeof node.material === "string") {
    return;
  }

  materialSources.set(getCustomMaterialKey(node.material), node.material.wgsl);
}

function createMaterialShader(customMaterials: readonly CustomMaterial[]) {
  const customFunctions = customMaterials
    .map((material, index) => renameMaterialFunction(material.source, `customMaterial${index}`))
    .join("\n\n");
  const customCases = customMaterials
    .map((material, index) => `    case ${material.id}u: { return customMaterial${index}(input); }`)
    .join("\n");

  return /* wgsl */ `
#include <material/default>
#include <material/normal>
#include <material/texture0-color>
#include <material/texture0-matcap>

${customFunctions}

fn shadeMaterialById(materialId: f32, input: MaterialInput) -> vec3<f32> {
  switch u32(round(materialId)) {
    case ${NORMAL_MATERIAL_ID}u: { return materialNormal(input); }
    case ${TEXTURE0_COLOR_MATERIAL_ID}u: { return materialTexture0Color(input); }
    case ${TEXTURE0_MATCAP_MATERIAL_ID}u: { return materialTexture0Matcap(input); }
${customCases}
    default: { return materialDefault(input); }
  }
}

fn shadeMaterial(hit: RaymarchHit, rayOrigin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let point = rayOrigin + direction * hit.distance;
  let normal = estimateNormalFromHit(hit, point);
  let input = MaterialInput(
    hit.color,
    normal,
    rayOrigin,
    hit.localPoint,
    point,
    direction,
    hit.distance,
    hit.materialUniform
  );

  return shadeMaterialById(hit.materialId, input);
}
`;
}

function renameMaterialFunction(source: string, functionName: string) {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("Material WGSL requires a non-empty function.");
  }

  const renamed = trimmed.replace(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/, `fn ${functionName}(`);
  if (renamed === trimmed) {
    throw new Error("Material WGSL must contain a function declaration.");
  }

  return renamed;
}
