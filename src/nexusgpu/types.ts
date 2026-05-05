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

/** シーン全体のライティング設定。directionは平行光源が照らす向きを表す。 */
export type NexusLighting = {
  direction?: Vec3;
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

/** トーラスプリミティブのprops。majorRadiusは中心からチューブ中心まで、minorRadiusはチューブ半径。 */
export type SdfTorusProps = SdfPrimitiveProps & {
  majorRadius?: number;
  minorRadius?: number;
};

/** 楕円球プリミティブのprops。radiiはX/Y/Z各軸の半径。 */
export type SdfEllipsoidProps = SdfPrimitiveProps & {
  radii?: Vec3;
};

/** WGSLのSDF関数を直接渡す汎用プリミティブのprops。 */
export type SdfFunctionProps = SdfPrimitiveProps & {
  sdfFunction: string;
  data0?: Vec4;
  data1?: Vec4;
  data2?: Vec4;
  bounds?: Partial<SdfBoundingSphere>;
};

/** グループコンポーネントのprops。transformはMVPでは子primitive側に持たせる。 */
export type SdfGroupProps = {
  op?: SdfBooleanOperation;
  smoothness?: number;
  children?: ReactNode;
};

/** NexusCanvasが受け取るReact側の公開props。 */
export type NexusCanvasProps = {
  camera?: NexusCamera;
  lighting?: NexusLighting;
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
  smoothness: number;
  children: readonly SdfSceneNode[];
  bounds: SdfBoundingSphere;
};

export type SdfSceneNode = SdfPrimitiveSceneNode | SdfGroupSceneNode;

/** SceneStoreからレンダラへ渡す一貫したシーン状態。 */
export type SceneSnapshot = {
  nodes: readonly SdfNode[];
  sceneNodes: readonly SdfSceneNode[];
  camera: Required<NexusCamera>;
  lighting: Required<NexusLighting>;
  version: number;
};
