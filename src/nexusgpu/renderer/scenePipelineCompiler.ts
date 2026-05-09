import { CUSTOM_SDF_PRIMITIVE_KIND_START } from "../sdfKinds";
import type { CustomSdfFunctionShader } from "../shaders";
import type { SceneSnapshot } from "../types";
import {
  createMaterialShaderPlan,
  DEFAULT_MATERIAL_ID,
  getBuiltinMaterialId,
  getCustomMaterialKey,
} from "./materialShaderCompiler";
import {
  collectSdfFunctionSources,
  createCustomSdfFunctionSource,
  createCustomSdfModifierFunctionSource,
  unique,
  uniqueModifierFunctionSources,
} from "./customWgslFunctions";
import {
  createExpandedMapSceneBody,
  createSceneCompileProfile,
  createSceneTopologySignature,
  type SceneCompileProfile,
} from "./sceneShaderCompiler";

export type SceneShaderPlan = {
  signature: string;
  customShaders: readonly CustomSdfFunctionShader[];
  mapSceneBody: string;
  customSdfKindIds: ReadonlyMap<string, number>;
  customMaterialIds: ReadonlyMap<string, number>;
  materialSection: string;
  profile: SceneCompileProfile;
};

/** SceneSnapshotから、WebGPU pipeline作成に必要なshader可変部分をまとめて作る。 */
export function createSceneShaderPlan(snapshot: SceneSnapshot): SceneShaderPlan {
  const sdfFunctions = unique(collectSdfFunctionSources(snapshot.sceneNodes));
  const modifierFunctions = uniqueModifierFunctionSources(snapshot.sceneNodes);
  const materialPlan = createMaterialShaderPlan(snapshot.sceneNodes);

  // 同じWGSL文字列は1つのcustom関数として共有し、scene内ではkind IDと関数名で参照する。
  const customSdfFunctions = sdfFunctions.map((sdfFunction, index) => {
    const functionName = `customSdfFunction${index}`;

    return {
      sdfFunction,
      kindId: CUSTOM_SDF_PRIMITIVE_KIND_START + index,
      ...createCustomSdfFunctionSource(sdfFunction, functionName),
    };
  });
  const customModifierFunctions = modifierFunctions.map((modifierFunction, index) => {
    const functionName = `customSdfModifierFunction${index}`;

    return {
      ...modifierFunction,
      kindId: CUSTOM_SDF_PRIMITIVE_KIND_START + customSdfFunctions.length + index,
      ...createCustomSdfModifierFunctionSource(modifierFunction.source, functionName, modifierFunction.mode),
    };
  });
  const customShaders = [...customSdfFunctions, ...customModifierFunctions].map<CustomSdfFunctionShader>(
    (customSdfFunction) => {
      return {
        kindId: customSdfFunction.kindId,
        functionName: customSdfFunction.functionName,
        source: customSdfFunction.source,
      };
    },
  );

  const customSdfKindIds = new Map(
    customSdfFunctions.map((customSdfFunction) => [customSdfFunction.sdfFunction, customSdfFunction.kindId]),
  );
  const customSdfFunctionNames = new Map(
    customSdfFunctions.map((customSdfFunction) => {
      return [
        customSdfFunction.sdfFunction,
        {
          functionName: customSdfFunction.functionName,
          returnsSceneHit: customSdfFunction.returnsSceneHit,
          returnsSceneEval: customSdfFunction.returnsSceneEval,
          acceptsColor: customSdfFunction.acceptsColor,
          acceptsSmoothness: customSdfFunction.acceptsSmoothness,
        },
      ];
    }),
  );
  const customModifierFunctionNames = new Map(
    customModifierFunctions.map((customModifierFunction) => {
      return [
        customModifierFunction.key,
        {
          functionName: customModifierFunction.functionName,
          returnsSceneHit: customModifierFunction.returnsSceneHit,
        },
      ];
    }),
  );

  // シーン木はGPU側で解釈せず、mapScene()のWGSLコードとして展開する。
  const mapSceneBody = createExpandedMapSceneBody(
    snapshot.sceneNodes,
    customSdfFunctionNames,
    customModifierFunctionNames,
  );
  const signature = [
    materialPlan.signature,
    sdfFunctions.join("\n/* nexusgpu-sdf-function */\n"),
    modifierFunctions
      .map((modifierFunction) => `${modifierFunction.mode}:${modifierFunction.source}`)
      .join("\n/* nexusgpu-sdf-modifier */\n"),
    createSceneTopologySignature(snapshot.sceneNodes),
  ].join("\n/* nexusgpu-scene-topology */\n");

  return {
    signature,
    customShaders,
    mapSceneBody,
    customSdfKindIds,
    customMaterialIds: materialPlan.customMaterialIds,
    materialSection: materialPlan.shader,
    profile: createSceneCompileProfile(snapshot.sceneNodes, customSdfFunctionNames),
  };
}

export function getMaterialIdFromPlan(
  material: import("../types").NexusMaterialRef | undefined,
  customMaterialIds: ReadonlyMap<string, number>,
) {
  const builtinId = getBuiltinMaterialId(material);
  if (builtinId !== null) {
    return builtinId;
  }

  return material ? (customMaterialIds.get(getCustomMaterialKey(material)) ?? DEFAULT_MATERIAL_ID) : DEFAULT_MATERIAL_ID;
}
