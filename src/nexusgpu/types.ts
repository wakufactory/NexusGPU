import type { ReactNode } from "react";

/** 3次元ベクトル。座標、色、サイズなどで共通利用する。 */
export type Vec3 = readonly [number, number, number];

/** SDFシーンを眺めるカメラ設定。省略された値はSceneStore側の初期値を使う。 */
export type NexusCamera = {
  position?: Vec3;
  target?: Vec3;
  fov?: number;
};

/** デバッグ用の描画品質設定。GPU負荷と見た目のバランスを実行時に調整する。 */
export type NexusRenderSettings = {
  resolutionScale?: number;
  maxSteps?: number;
  maxDistance?: number;
  shadows?: boolean;
  normalEpsilon?: number;
  surfaceEpsilon?: number;
};

/** 現在サポートしているSDFプリミティブ種別。 */
export type SdfPrimitiveKind = "sphere" | "box";

/** SDFプリミティブに共通するReact props。 */
export type SdfPrimitiveProps = {
  position?: Vec3;
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

/** NexusCanvasが受け取るReact側の公開props。 */
export type NexusCanvasProps = {
  camera?: NexusCamera;
  renderSettings?: NexusRenderSettings;
  children?: ReactNode;
};

/** SceneStoreが保持し、WebGPU側へアップロードする1プリミティブ分の正規化済みデータ。 */
export type SdfNode = {
  id: symbol;
  kind: SdfPrimitiveKind;
  position: Vec3;
  color: Vec3;
  data: Vec3;
  smoothness: number;
};

/** SceneStoreからレンダラへ渡す一貫したシーン状態。 */
export type SceneSnapshot = {
  nodes: readonly SdfNode[];
  camera: Required<NexusCamera>;
  version: number;
};
