import { assembleSdfShader } from "./shaders";

export const MAX_SDF_OBJECTS = 128;

// WGSLシェーダ本体。個別パーツは src/nexusgpu/shaders に機能別で配置する。
export const sdfShader = assembleSdfShader(MAX_SDF_OBJECTS);
