import { createShaderConstants } from "./shaderConstants";
import { fragmentShader } from "./fragmentShader";
import { lightingShader } from "./lightingShader";
import { raymarchShader } from "./raymarchShader";
import { sceneMappingShader } from "./sceneMappingShader";
import { sdfPrimitivesShader } from "./sdfPrimitivesShader";
import { shaderLayout } from "./shaderLayout";
import { vertexShader } from "./vertexShader";

const shaderSections = [
  shaderLayout,
  vertexShader,
  sdfPrimitivesShader,
  sceneMappingShader,
  raymarchShader,
  lightingShader,
  fragmentShader,
];

export function assembleSdfShader(maxObjects: number) {
  return [createShaderConstants(maxObjects), ...shaderSections].join("\n\n");
}
