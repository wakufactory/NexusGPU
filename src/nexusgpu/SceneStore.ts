import type {
  NexusCamera,
  NexusFrameCallback,
  NexusFrameState,
  NexusLighting,
  SceneSnapshot,
  SdfNode,
  SdfSceneNode,
} from "./types";
import { DEFAULT_CAMERA, DEFAULT_LIGHTING } from "./defaults";

type SceneListener = (snapshot: SceneSnapshot) => void;

/**
 * Reactコンポーネントで宣言されたSDFノードとカメラ状態を保持する小さなシーンストア。
 * ここではGPUを直接触らず、レンダラが読みやすいスナップショットへまとめる責務だけを持つ。
 */
export class SceneStore {
  private sceneNodes = new Map<symbol, SdfSceneNode>();
  private listeners = new Set<SceneListener>();
  private frameListeners = new Set<NexusFrameCallback>();
  private camera = DEFAULT_CAMERA;
  private lighting = DEFAULT_LIGHTING;
  private version = 0;

  /** カメラpropsをストアへ反映し、購読中のレンダラへ変更を通知する。 */
  setCamera(camera: NexusCamera | undefined) {
    this.camera = {
      position: camera?.position ?? DEFAULT_CAMERA.position,
      target: camera?.target ?? DEFAULT_CAMERA.target,
      fov: camera?.fov ?? DEFAULT_CAMERA.fov,
    };
    this.emit();
  }

  /** ライティングpropsをストアへ反映し、購読中のレンダラへ変更を通知する。 */
  setLighting(lighting: NexusLighting | undefined) {
    this.lighting = {
      direction: lighting?.direction ?? DEFAULT_LIGHTING.direction,
    };
    this.emit();
  }

  /** SDFプリミティブを追加または更新する。React側のprops変更はこの経路でGPU同期候補になる。 */
  upsertNode(node: SdfNode) {
    this.upsertSceneNode(node.id, { type: "primitive", node, bounds: node.bounds });
  }

  /** primitive/groupを問わず、レンダラが評価するシーン木のroot要素を更新する。 */
  upsertSceneNode(id: symbol, node: SdfSceneNode) {
    this.sceneNodes.set(id, node);
    this.emit();
  }

  /** アンマウントされたSDFプリミティブをシーンから取り除く。 */
  removeNode(id: symbol) {
    this.removeSceneNode(id);
  }

  removeSceneNode(id: symbol) {
    this.sceneNodes.delete(id);
    this.emit();
  }

  /** シーン変更を購読する。登録直後に現在のスナップショットも一度渡す。 */
  subscribe(listener: SceneListener) {
    this.listeners.add(listener);
    listener(this.snapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** NexusCanvasのフレームループを購読する。アニメーション用途の軽量なuseFrame基盤。 */
  subscribeFrame(listener: NexusFrameCallback) {
    this.frameListeners.add(listener);

    return () => {
      this.frameListeners.delete(listener);
    };
  }

  /** NexusCanvasから毎フレーム呼ばれ、登録されたReact側コールバックへ時刻を渡す。 */
  advanceFrame(state: NexusFrameState) {
    for (const listener of this.frameListeners) {
      listener(state);
    }
  }

  /** 現在のシーン状態を、レンダラへ渡せる不変データとして作る。 */
  snapshot(): SceneSnapshot {
    const sceneNodes = [...this.sceneNodes.values()];

    return {
      nodes: sceneNodes.flatMap(flattenSdfNodes),
      sceneNodes,
      camera: this.camera,
      lighting: this.lighting,
      version: this.version,
    };
  }

  /** バージョンを進め、全リスナーへ最新スナップショットを配信する。 */
  private emit() {
    this.version += 1;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function flattenSdfNodes(node: SdfSceneNode): SdfNode[] {
  if (node.type === "primitive") {
    return [node.node];
  }

  return node.children.flatMap(flattenSdfNodes);
}
