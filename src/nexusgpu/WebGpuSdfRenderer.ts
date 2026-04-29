import { MAX_SDF_OBJECTS, sdfShader } from "./sdfShader";
import type { NexusRenderSettings, SceneSnapshot, Vec3 } from "./types";

const CAMERA_FLOATS = 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4;
const CAMERA_BUFFER_SIZE = CAMERA_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const OBJECT_STRIDE_FLOATS = 16;
const OBJECT_BUFFER_SIZE = MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const DEFAULT_RENDER_SETTINGS: Required<NexusRenderSettings> = {
  resolutionScale: 0.75,
  maxSteps: 72,
  maxDistance: 45,
  shadows: false,
  normalEpsilon: 0.002,
  surfaceEpsilon: 0.002,
  stereoSbs: false,
  stereoBase: 0.08,
  stereoSwapEyes: false,
};

/**
 * CanvasにWebGPUのSDFレイマーチング結果を描画する低レベルレンダラ。
 * Reactとは直接結合せず、SceneStoreのスナップショットとデバッグ設定だけを受け取る。
 */
export class WebGpuSdfRenderer {
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly cameraBuffer: GPUBuffer;
  private readonly objectBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly resizeObserver: ResizeObserver;
  private readonly objectData = new Float32Array(MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS);
  private readonly cameraData = new Float32Array(CAMERA_FLOATS);
  private snapshot: SceneSnapshot | null = null;
  private renderSettings = DEFAULT_RENDER_SETTINGS;
  private frameId = 0;
  private startTime = performance.now();

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
  ) {
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("WebGPU canvas context is not available in this browser.");
    }

    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.format,
      alphaMode: "opaque",
    });

    this.cameraBuffer = device.createBuffer({
      label: "NexusGPU Camera Uniforms",
      size: CAMERA_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.objectBuffer = device.createBuffer({
      label: "NexusGPU SDF Object Storage",
      size: OBJECT_BUFFER_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = device.createShaderModule({
      label: "NexusGPU SDF Raymarcher",
      code: sdfShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: "NexusGPU SDF Pipeline",
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vertexMain",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    this.bindGroup = device.createBindGroup({
      label: "NexusGPU Scene Bind Group",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.objectBuffer } },
      ],
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.frame();
  }

  /** WebGPUアダプタとデバイスを確保し、レンダラを初期化するファクトリ。 */
  static async create(canvas: HTMLCanvasElement) {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not enabled. Use a current Chromium, Edge, or Safari Technology Preview build.");
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      throw new Error("No compatible WebGPU adapter was found.");
    }

    const device = await adapter.requestDevice();
    return new WebGpuSdfRenderer(canvas, device);
  }

  /** 新しいシーンスナップショットを受け取り、SDFオブジェクト用Storage Bufferを更新する。 */
  setScene(snapshot: SceneSnapshot) {
    this.snapshot = snapshot;
    this.uploadObjects(snapshot);
  }

  /** デバッグUIから渡された描画品質設定を正規化し、必要なら内部解像度を更新する。 */
  setRenderSettings(settings: NexusRenderSettings | undefined) {
    this.renderSettings = normalizeRenderSettings(settings);
    this.resize();
  }

  /** requestAnimationFrame、ResizeObserver、GPUBufferを解放する。 */
  destroy() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.cameraBuffer.destroy();
    this.objectBuffer.destroy();
  }

  /** CSSサイズ、devicePixelRatio、解像度スケールから実際の描画ピクセル数を決める。 */
  private resize() {
    const scale = this.renderSettings.resolutionScale;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * window.devicePixelRatio * scale));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * window.devicePixelRatio * scale));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** SceneSnapshot内のSDFノードを、WGSL側のSdfObject配列と同じSoA寄りレイアウトへ詰める。 */
  private uploadObjects(snapshot: SceneSnapshot) {
    const nodes = snapshot.nodes.slice(0, MAX_SDF_OBJECTS);

    nodes.forEach((node, index) => {
      const offset = index * OBJECT_STRIDE_FLOATS;
      this.objectData[offset + 0] = node.position[0];
      this.objectData[offset + 1] = node.position[1];
      this.objectData[offset + 2] = node.position[2];
      this.objectData[offset + 3] = node.kind === "sphere" ? 0 : 1;
      this.objectData[offset + 4] = node.data[0];
      this.objectData[offset + 5] = node.data[1];
      this.objectData[offset + 6] = node.data[2];
      this.objectData[offset + 7] = node.smoothness;
      this.objectData[offset + 8] = node.color[0];
      this.objectData[offset + 9] = node.color[1];
      this.objectData[offset + 10] = node.color[2];
      this.objectData[offset + 11] = 1;
      this.objectData[offset + 12] = node.rotation[0];
      this.objectData[offset + 13] = node.rotation[1];
      this.objectData[offset + 14] = node.rotation[2];
      this.objectData[offset + 15] = node.rotation[3];
    });

    const bytesToUpload = nodes.length * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    if (bytesToUpload > 0) {
      this.device.queue.writeBuffer(this.objectBuffer, 0, this.objectData, 0, nodes.length * OBJECT_STRIDE_FLOATS);
    }
  }

  /** カメラベクトルとデバッグ設定をUniform Bufferへ書き込み、シェーダから参照できるようにする。 */
  private uploadCamera(snapshot: SceneSnapshot) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const position = snapshot.camera.position;
    const target = snapshot.camera.target;
    const forward = normalize(subtract(target, position));
    const worldUp: Vec3 = [0, 1, 0];
    const right = normalize(cross(forward, worldUp));
    const up = normalize(cross(right, forward));
    const lightDirection = normalize(snapshot.lighting.direction, [-0.45, 0.85, 0.35]);
    const time = (performance.now() - this.startTime) / 1000;

    this.cameraData.set([width, height, time, snapshot.camera.fov], 0);
    this.cameraData.set([...position, 0], 4);
    this.cameraData.set([...forward, 0], 8);
    this.cameraData.set([...right, 0], 12);
    this.cameraData.set([...up, 0], 16);
    this.cameraData.set(
      [Math.min(snapshot.nodes.length, MAX_SDF_OBJECTS), this.renderSettings.surfaceEpsilon, 0, 0],
      20,
    );
    this.cameraData.set(
      [
        this.renderSettings.maxSteps,
        this.renderSettings.maxDistance,
        this.renderSettings.shadows ? 1 : 0,
        this.renderSettings.normalEpsilon,
      ],
      24,
    );
    this.cameraData.set([...lightDirection, 0], 28);
    this.cameraData.set(
      [
        this.renderSettings.stereoSbs ? 1 : 0,
        this.renderSettings.stereoBase,
        this.renderSettings.stereoSwapEyes ? 1 : 0,
        0,
      ],
      32,
    );

    this.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
  }

  /** 毎フレームの描画ループ。フルスクリーン三角形を1枚描き、Fragment ShaderでSDFを評価する。 */
  private frame = () => {
    this.frameId = requestAnimationFrame(this.frame);
    this.resize();

    if (!this.snapshot) {
      return;
    }

    this.uploadCamera(this.snapshot);

    const encoder = this.device.createCommandEncoder({ label: "NexusGPU Frame Encoder" });
    const pass = encoder.beginRenderPass({
      label: "NexusGPU SDF Pass",
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.025, b: 0.028, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  };
}

/** UI由来の設定値を、シェーダが想定する安全な範囲に丸める。 */
function normalizeRenderSettings(settings: NexusRenderSettings | undefined): Required<NexusRenderSettings> {
  return {
    resolutionScale: clamp(settings?.resolutionScale ?? DEFAULT_RENDER_SETTINGS.resolutionScale, 0.25, 1),
    maxSteps: Math.round(clamp(settings?.maxSteps ?? DEFAULT_RENDER_SETTINGS.maxSteps, 16, 160)),
    maxDistance: clamp(settings?.maxDistance ?? DEFAULT_RENDER_SETTINGS.maxDistance, 8, 120),
    shadows: settings?.shadows ?? DEFAULT_RENDER_SETTINGS.shadows,
    normalEpsilon: clamp(settings?.normalEpsilon ?? DEFAULT_RENDER_SETTINGS.normalEpsilon, 0.0008, 0.01),
    surfaceEpsilon: clamp(settings?.surfaceEpsilon ?? DEFAULT_RENDER_SETTINGS.surfaceEpsilon, 0.0008, 0.02),
    stereoSbs: settings?.stereoSbs ?? DEFAULT_RENDER_SETTINGS.stereoSbs,
    stereoBase: clamp(settings?.stereoBase ?? DEFAULT_RENDER_SETTINGS.stereoBase, 0, 1),
    stereoSwapEyes: settings?.stereoSwapEyes ?? DEFAULT_RENDER_SETTINGS.stereoSwapEyes,
  };
}

/** 数値を指定範囲内に制限する。 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 3次元ベクトルの差を返す。 */
function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** 3次元ベクトルの外積を返し、カメラのright/upベクトル計算に使う。 */
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** 3次元ベクトルを単位ベクトル化する。ゼロ長に近い場合は安全な前方向を返す。 */
function normalize(value: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 0.00001) {
    return fallback;
  }

  return [value[0] / length, value[1] / length, value[2] / length];
}
