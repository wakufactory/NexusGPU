import { MAX_SDF_OBJECTS } from "./sdfShader";
import { assembleSdfShader, type CustomSdfFunctionShader } from "./shaders";
import {
  CUSTOM_SDF_PRIMITIVE_KIND_START,
  SDF_BOOLEAN_OPERATION_IDS,
  SDF_OPERATION_KIND_IDS,
  SDF_PRIMITIVE_KIND_IDS,
} from "./sdfKinds";
import type {
  NexusCanvasPixelSize,
  NexusRenderSettings,
  NexusRenderStats,
  SceneSnapshot,
  SdfBooleanOperation,
  SdfBoundingSphere,
  SdfNode,
  SdfSceneNode,
  Vec3,
} from "./types";

const CAMERA_FLOATS = 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4;
const CAMERA_BUFFER_SIZE = CAMERA_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const OBJECT_STRIDE_FLOATS = 24;
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
  private readonly cameraBuffer: GPUBuffer;
  private readonly objectBuffer: GPUBuffer;
  private readonly resizeObserver: ResizeObserver;
  private readonly objectData = new Float32Array(MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS);
  private readonly cameraData = new Float32Array(CAMERA_FLOATS);
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private customSdfSignature = "";
  private customSdfKindIds = new Map<string, number>();
  private snapshot: SceneSnapshot | null = null;
  private renderSettings = DEFAULT_RENDER_SETTINGS;
  private renderStats: NexusRenderStats = {
    canvasPixelSize: { width: 0, height: 0 },
    fps: 0,
  };
  private frameId = 0;
  private startTime = performance.now();
  private lastFpsSampleTime = this.startTime;
  private framesSinceFpsSample = 0;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly onRenderStatsChange?: (stats: NexusRenderStats) => void,
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

    const pipelineState = this.createPipeline([]);
    this.pipeline = pipelineState.pipeline;
    this.bindGroup = pipelineState.bindGroup;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.frame();
  }

  /** WebGPUアダプタとデバイスを確保し、レンダラを初期化するファクトリ。 */
  static async create(
    canvas: HTMLCanvasElement,
    options: { onRenderStatsChange?: (stats: NexusRenderStats) => void } = {},
  ) {
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
    return new WebGpuSdfRenderer(canvas, device, options.onRenderStatsChange);
  }

  /** 新しいシーンスナップショットを受け取り、SDFオブジェクト用Storage Bufferを更新する。 */
  setScene(snapshot: SceneSnapshot) {
    this.snapshot = snapshot;
    this.configureCustomSdfFunctions(snapshot);
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

    if (
      this.renderStats.canvasPixelSize.width !== width ||
      this.renderStats.canvasPixelSize.height !== height
    ) {
      this.setRenderStats({ canvasPixelSize: { width, height } });
    }
  }

  private setRenderStats(stats: Partial<NexusRenderStats>) {
    this.renderStats = { ...this.renderStats, ...stats };
    this.onRenderStatsChange?.(this.renderStats);
  }

  private updateFps(now: number) {
    this.framesSinceFpsSample += 1;

    const elapsed = now - this.lastFpsSampleTime;
    if (elapsed < 500) {
      return;
    }

    this.setRenderStats({ fps: (this.framesSinceFpsSample * 1000) / elapsed });
    this.framesSinceFpsSample = 0;
    this.lastFpsSampleTime = now;
  }

  /** SceneSnapshot内のSDFノードを、WGSL側のSdfObject配列と同じSoA寄りレイアウトへ詰める。 */
  private uploadObjects(snapshot: SceneSnapshot) {
    const records = compileSdfRecords(snapshot.sceneNodes, (node) => this.getSdfKindId(node)).slice(0, MAX_SDF_OBJECTS);
    this.objectData.fill(0);

    records.forEach((record, index) => {
      const offset = index * OBJECT_STRIDE_FLOATS;
      this.objectData.set(record, offset);
    });

    const bytesToUpload = records.length * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    if (bytesToUpload > 0) {
      this.device.queue.writeBuffer(this.objectBuffer, 0, this.objectData, 0, records.length * OBJECT_STRIDE_FLOATS);
    }
  }

  /** SdfFunctionごとのWGSL関数をshader moduleへ差し込み、必要なときだけpipelineを作り直す。 */
  private configureCustomSdfFunctions(snapshot: SceneSnapshot) {
    const sdfFunctions = unique(
      snapshot.nodes.flatMap((node) => (node.kind === "function" && node.sdfFunction ? [node.sdfFunction] : [])),
    );
    const signature = sdfFunctions.join("\n/* nexusgpu-sdf-function */\n");

    if (signature === this.customSdfSignature) {
      return;
    }

    const customShaders = sdfFunctions.map<CustomSdfFunctionShader>((sdfFunction, index) => {
      const functionName = `customSdfFunction${index}`;
      const kindId = CUSTOM_SDF_PRIMITIVE_KIND_START + index;

      return {
        kindId,
        functionName,
        source: createCustomSdfFunctionSource(sdfFunction, functionName),
      };
    });

    this.customSdfSignature = signature;
    this.customSdfKindIds = new Map(
      sdfFunctions.map((sdfFunction, index) => [sdfFunction, CUSTOM_SDF_PRIMITIVE_KIND_START + index]),
    );

    const pipelineState = this.createPipeline(customShaders);
    this.pipeline = pipelineState.pipeline;
    this.bindGroup = pipelineState.bindGroup;
  }

  private createPipeline(customSdfFunctions: readonly CustomSdfFunctionShader[]) {
    const shaderModule = this.device.createShaderModule({
      label: "NexusGPU SDF Raymarcher",
      code: assembleSdfShader(MAX_SDF_OBJECTS, customSdfFunctions),
    });

    const pipeline = this.device.createRenderPipeline({
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

    const bindGroup = this.device.createBindGroup({
      label: "NexusGPU Scene Bind Group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.objectBuffer } },
      ],
    });

    return { pipeline, bindGroup };
  }

  private getSdfKindId(node: SdfNode) {
    if (node.kind === "function") {
      return node.sdfFunction ? (this.customSdfKindIds.get(node.sdfFunction) ?? 999999) : 999999;
    }

    return SDF_PRIMITIVE_KIND_IDS[node.kind];
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
      [
        Math.min(compileSdfRecordCount(snapshot.sceneNodes), MAX_SDF_OBJECTS),
        this.renderSettings.surfaceEpsilon,
        0,
        0,
      ],
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
    const now = performance.now();
    this.updateFps(now);
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

type SdfRecord = number[];
type GetSdfKindId = (node: SdfNode) => number;

function compileSdfRecords(sceneNodes: readonly SdfSceneNode[], getSdfKindId: GetSdfKindId) {
  const records: SdfRecord[] = [];

  for (const node of sceneNodes) {
    appendSdfRecord(node, records, getSdfKindId);
  }

  return records;
}

function compileSdfRecordCount(sceneNodes: readonly SdfSceneNode[]): number {
  return sceneNodes.reduce((count, node) => {
    if (node.type === "primitive") {
      return count + 1;
    }

    return count + 2 + compileSdfRecordCount(node.children);
  }, 0);
}

function appendSdfRecord(node: SdfSceneNode, records: SdfRecord[], getSdfKindId: GetSdfKindId) {
  if (node.type === "primitive") {
    records.push(createPrimitiveRecord(node.node, getSdfKindId(node.node)));
    return;
  }

  const beginIndex = records.length;
  const beginRecord = createGroupRecord(SDF_OPERATION_KIND_IDS.groupBegin, node.op, node.bounds, node.smoothness, 0, node.children.length);
  records.push(beginRecord);

  for (const child of node.children) {
    appendSdfRecord(child, records, getSdfKindId);
  }

  const endIndex = records.length;
  // GROUP_BEGINはbounds skip時のジャンプ先として対応するGROUP_ENDのindexを持つ。
  beginRecord[12] = endIndex;
  records.push(createGroupRecord(SDF_OPERATION_KIND_IDS.groupEnd, node.op, node.bounds, node.smoothness, beginIndex, node.children.length));
}

function createPrimitiveRecord(node: SdfNode, kindId: number): SdfRecord {
  return [
    node.position[0],
    node.position[1],
    node.position[2],
    kindId,
    ...node.data[0],
    ...node.data[1],
    ...node.data[2],
    node.color[0],
    node.color[1],
    node.color[2],
    node.smoothness,
    node.rotation[0],
    node.rotation[1],
    node.rotation[2],
    node.rotation[3],
  ];
}

function createGroupRecord(
  kindId: number,
  op: SdfBooleanOperation,
  bounds: SdfBoundingSphere,
  smoothness: number,
  pairedIndex: number,
  childCount: number,
): SdfRecord {
  return [
    0,
    0,
    0,
    kindId,
    0,
    0,
    0,
    0,
    bounds.center[0],
    bounds.center[1],
    bounds.center[2],
    bounds.radius,
    pairedIndex,
    SDF_BOOLEAN_OPERATION_IDS[op],
    childCount,
    0,
    0,
    0,
    0,
    smoothness,
    0,
    0,
    0,
    1,
  ];
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function createCustomSdfFunctionSource(source: string, functionName: string) {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("SdfFunction requires a non-empty WGSL function string.");
  }

  if (/\bfn\s+sdfFunction\s*\(/.test(trimmed)) {
    return trimmed.replace(/\bfn\s+sdfFunction\s*\(/, `fn ${functionName}(`);
  }

  if (/^\s*fn\s+/.test(trimmed)) {
    return trimmed.replace(/\bfn\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/, `fn ${functionName}(`);
  }

  const body = trimmed.includes(";") || /\breturn\b/.test(trimmed) ? trimmed : `return ${trimmed};`;

  return /* wgsl */ `
fn ${functionName}(point: vec3<f32>, data0: vec4<f32>, data1: vec4<f32>, data2: vec4<f32>) -> f32 {
  ${body}
}
`;
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
