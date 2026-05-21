import {
  createHeightMapParameters,
  createHeightMapScene,
  HEIGHT_MAP_TEXTURES,
} from "./HeightMapScene";

export const { initialParameters, parameterControls } = createHeightMapParameters(1);
export const Scene = createHeightMapScene({
  textures: HEIGHT_MAP_TEXTURES.fuji,
});
export { initialRenderSettings } from "./HeightMapScene";
