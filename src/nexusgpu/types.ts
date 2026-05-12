import type { ReactNode } from "react";
import type { SdfPrimitiveKind } from "./sdfKinds";

/** 3次元ベクトル。座標、色、サイズなどで共通利用する。 */
export type Vec3 = readonly [number, number, number];

/** 4次元ベクトル。GPUのvec4境界に揃えたSDF拡張データで使う。 */
export type Vec4 = readonly [number, number, number, number];

/** SDFプリミティブごとの拡張パラメータ。WGSL側のdata0/data1/data2に対応する。 */
export type SdfData = readonly [Vec4, Vec4, Vec4];

/** グループ枝刈りに使う、保守的なbounding sphere。 */
export type SdfBoundingSphere = {
  center: Vec3;
  radius: number;
};

/** SDFノード同士のCSG/boolean合成演算。 */
export type SdfBooleanOperation = "or" | "and" | "subtract" | "not";

/** Quaternion。回転を[x, y, z, w]の順で表す。 */
export type Quaternion = readonly [number, number, number, number];

/** SDFシーンを眺めるカメラ設定。省略された値はSceneStore側の初期値を使う。 */
export type NexusCamera = {
  position?: Vec3;
  target?: Vec3;
  fov?: number;
};

export type NexusLightType = "directional" | "point" | "spot";

/** 1つのライト設定。現状のshaderは先頭ライトをmain lightとして使う。 */
export type NexusLight = {
  type?: NexusLightType;
  direction?: Vec3;
  position?: Vec3;
  color?: Vec3;
  intensity?: number;
  range?: number;
};

/** シーン全体のライティング設定。旧来のtop-level指定はmain directional lightとして扱う。 */
export type NexusLighting = NexusLight & {
  lights?: readonly NexusLight[];
};

export type ResolvedNexusLight = {
  type: NexusLightType;
  direction: Vec3;
  position: Vec3;
  color: Vec3;
  intensity: number;
  range: number;
};

export type ResolvedNexusLighting = {
  lights: readonly ResolvedNexusLight[];
  mainLight: ResolvedNexusLight;
  direction: Vec3;
  color: Vec3;
  intensity: number;
  type: NexusLightType;
};

export type NexusMaterialPreset = "default" | "normal" | "pbr" | "texture0Color" | "texture0Matcap";

export type NexusMaterialRef =
  | NexusMaterialPreset
  | {
      wgsl: string;
      key?: string;
    };

export type NexusTextureCrossOrigin = "" | "anonymous" | "use-credentials";

export type NexusTextureSource =
  | string
  | ({
      src: string;
      crossOrigin?: NexusTextureCrossOrigin;
    } & Pick<
      GPUSamplerDescriptor,
      | "addressModeU"
      | "addressModeV"
      | "addressModeW"
      | "magFilter"
      | "minFilter"
      | "mipmapFilter"
      | "lodMinClamp"
      | "lodMaxClamp"
      | "maxAnisotropy"
    >);

/** 未ヒット時に表示する背景色。Y軸方向の上下2色を補間する。 */
export type NexusBackground = {
  yPositive?: Vec3;
  yNegative?: Vec3;
};

/** デバッグ用の描画品質設定。GPU負荷と見た目のバランスを実行時に調整する。 */
export type NexusRenderSettings = {
  maxFps?: number;
  resolutionScale?: number;
  maxSteps?: number;
  maxDistance?: number;
  shadows?: boolean;
  normalEpsilon?: number;
  surfaceEpsilon?: number;
  stereoSbs?: boolean;
  stereoBase?: number;
  stereoSwapEyes?: boolean;
  hitInteriorSurfaces?: boolean;
};

/** Canvasの実描画ピクセル数。CSSサイズではなくWebGPUへ渡すbacking storeサイズを表す。 */
export type NexusCanvasPixelSize = {
  width: number;
  height: number;
};

/** NexusCanvasからUIへ渡す、描画結果に関する観測値。 */
export type NexusRenderStats = {
  canvasPixelSize: NexusCanvasPixelSize;
  fps: number;
};

/** NexusCanvasのフレームループからReact側へ渡す時刻情報。 */
export type NexusFrameState = {
  /** requestAnimationFrameから渡された高精度タイムスタンプ。 */
  time: number;
  /** NexusCanvasのフレームループ開始からの経過秒数。 */
  elapsed: number;
  /** 前フレームからの経過秒数。タブ復帰時の跳ねを抑えるため上限を持つ。 */
  delta: number;
};

/** NexusCanvas内で毎フレーム呼ばれるコールバック。 */
export type NexusFrameCallback = (state: NexusFrameState) => void;

/** SDFプリミティブに共通するReact props。 */
export type SdfPrimitiveProps = {
  position?: Vec3;
  rotation?: Quaternion;
  color?: Vec3;
  smoothness?: number;
  material?: NexusMaterialRef;
  materialUniform?: Vec4;
};

/** 球プリミティブのprops。radiusはSDFの距離関数へ直接渡される。 */
export type SdfSphereProps = SdfPrimitiveProps & {
  radius?: number;
};

/** ボックスプリミティブのprops。sizeは幅・高さ・奥行きのフルサイズで指定する。 */
export type SdfBoxProps = SdfPrimitiveProps & {
  size?: Vec3;
};

/** 円柱プリミティブのprops。heightはY軸方向のフル高さで指定する。 */
export type SdfCylinderProps = SdfPrimitiveProps & {
  radius?: number;
  height?: number;
};

/** 円錐台プリミティブのprops。heightはY軸方向のフル高さで、上下端の半径を指定する。 */
export type SdfConeProps = SdfPrimitiveProps & {
  topRadius?: number;
  bottomRadius?: number;
  height?: number;
};

/** 任意軸capsuleプリミティブのprops。top/bottomはローカル座標の端中央、round=0なら平面キャップ円柱、1なら半球cap。 */
export type SdfCapsuleProps = SdfPrimitiveProps & {
  top?: Vec3;
  bottom?: Vec3;
  radius?: number;
  round?: number;
};

/** トーラスプリミティブのprops。majorRadiusは中心からチューブ中心まで、minorRadiusはチューブ半径。 */
export type SdfTorusProps = SdfPrimitiveProps & {
  majorRadius?: number;
  minorRadius?: number;
};

/** 楕円球プリミティブのprops。radiiはX/Y/Z各軸の半径。 */
export type SdfEllipsoidProps = SdfPrimitiveProps & {
  radii?: Vec3;
};

/** 正多面体プリミティブのprops。radiusは中心から頂点までの半径。 */
export type SdfRegularPolyhedronProps = SdfPrimitiveProps & {
  radius?: number;
};

/** WGSLのSDF関数を直接渡す汎用プリミティブのprops。 */
export type SdfFunctionProps = SdfPrimitiveProps & {
  sdfFunction: string;
  data0?: Vec4;
  data1?: Vec4;
  data2?: Vec4;
  bounds?: Partial<SdfBoundingSphere>;
};

/** グループコンポーネントのprops。position/rotationは子SDF全体の評価空間を動かす。 */
export type SdfGroupProps = {
  op?: SdfBooleanOperation;
  position?: Vec3;
  rotation?: Quaternion;
  smoothness?: number;
  material?: NexusMaterialRef;
  materialUniform?: Vec4;
  children?: ReactNode;
};

/** SDF modifierの組み込みプリセット。1つのpresetがpre/postの両方を持つ場合がある。 */
export type SdfModifierPreset = "twistY" | "preRepeat" | "preScale" | "postInflate" | "postOnion" | "postMix";

/** 子SDFの評価前後にWGSL modifierを差し込むコンポーネントのprops。 */
export type SdfModifierProps = {
  preset?: SdfModifierPreset | readonly SdfModifierPreset[];
  preModifierFunction?: string;
  postModifierFunction?: string;
  data0?: Vec4;
  data1?: Vec4;
  data2?: Vec4;
  bounds?: Partial<SdfBoundingSphere>;
  children?: ReactNode;
};

/** NexusCanvasが受け取るReact側の公開props。 */
export type NexusCanvasProps = {
  camera?: NexusCamera;
  lighting?: NexusLighting;
  background?: NexusBackground;
  textures?: readonly NexusTextureSource[];
  orbitControls?: boolean;
  renderingEnabled?: boolean;
  renderSettings?: NexusRenderSettings;
  onRenderStatsChange?: (stats: NexusRenderStats) => void;
  children?: ReactNode;
};

/** SceneStoreが保持し、WebGPU側へアップロードする1プリミティブ分の正規化済みデータ。 */
export type SdfNode = {
  id: symbol;
  kind: SdfPrimitiveKind;
  position: Vec3;
  rotation: Quaternion;
  hasRotation: boolean;
  color: Vec3;
  data: SdfData;
  smoothness: number;
  material?: NexusMaterialRef;
  materialUniform: Vec4;
  bounds: SdfBoundingSphere;
  sdfFunction?: string;
};

export type SdfPrimitiveSceneNode = {
  type: "primitive";
  node: SdfNode;
  bounds: SdfBoundingSphere;
};

export type SdfGroupSceneNode = {
  type: "group";
  op: SdfBooleanOperation;
  position: Vec3;
  rotation: Quaternion;
  hasRotation: boolean;
  smoothness: number;
  material?: NexusMaterialRef;
  materialUniform: Vec4;
  children: readonly SdfSceneNode[];
  bounds: SdfBoundingSphere;
};

export type SdfModifierSceneNode = {
  type: "modifier";
  preModifierFunction?: string;
  postModifierFunction?: string;
  postModifierOperation?: "mix";
  data: SdfData;
  children: readonly SdfSceneNode[];
  bounds: SdfBoundingSphere;
};

export type SdfSceneNode = SdfPrimitiveSceneNode | SdfGroupSceneNode | SdfModifierSceneNode;

/** SceneStoreからレンダラへ渡す一貫したシーン状態。 */
export type SceneSnapshot = {
  nodes: readonly SdfNode[];
  sceneNodes: readonly SdfSceneNode[];
  camera: Required<NexusCamera>;
  lighting: ResolvedNexusLighting;
  background: Required<NexusBackground>;
  version: number;
};
