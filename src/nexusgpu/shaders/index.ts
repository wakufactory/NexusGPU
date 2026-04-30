import { createShaderConstants } from "./shaderConstants";
import { fragmentShader } from "./fragmentShader";
import { lightingShader } from "./lightingShader";
import { raymarchShader } from "./raymarchShader";
import { createSceneMappingShader } from "./sceneMappingShader";
import { sdfPrimitivesShader } from "./sdfPrimitivesShader";
import { shaderLayout } from "./shaderLayout";
import { resolveShaderIncludes, shaderChunkLibrary } from "./shaderLibrary";
import { vertexShader } from "./vertexShader";
import type { CustomSdfFunctionShaderEntry } from "./sceneMappingShader";

export type CustomSdfFunctionShader = CustomSdfFunctionShaderEntry & {
  source: string;
};

const shaderSectionsBeforeMapping = [
  shaderLayout,
  vertexShader,
  sdfPrimitivesShader,
];

const shaderSectionsAfterMapping = [
  raymarchShader,
  lightingShader,
  fragmentShader,
];

export function assembleSdfShader(maxObjects: number, customSdfFunctions: readonly CustomSdfFunctionShader[] = []) {
  const customFunctionSources = customSdfFunctions.map(({ source }) => source).join("\n\n");
  const sceneMappingShader = createSceneMappingShader(customSdfFunctions);

  return resolveShaderIncludes(
    [
      createShaderConstants(maxObjects),
      ...shaderSectionsBeforeMapping,
      customFunctionSources,
      sceneMappingShader,
      ...shaderSectionsAfterMapping,
    ].join("\n\n"),
  );
}

export { resolveShaderIncludes, shaderChunkLibrary };
export type { ShaderChunkLibrary } from "./shaderLibrary";
