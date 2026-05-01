import { MAX_SDF_OBJECTS } from "./sdfShader";
import { assembleSdfShader, type CustomSdfFunctionShader } from "./shaders";
import { CUSTOM_SDF_PRIMITIVE_KIND_START, SDF_PRIMITIVE_KIND_IDS } from "./sdfKinds";
import type { NexusCanvasPixelSize, NexusRenderSettings, NexusRenderStats, SceneSnapshot, SdfNode, Vec3 } from "./types";

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
const SBS_SOURCE_RECTS = {
  left: [0, 0, 0.5, 1] as const,
  right: [0.5, 0, 0.5, 1] as const,
};

type XRSessionMode = "inline" | "immersive-vr" | "immersive-ar";
type XRSessionInit = {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
};
type XRRenderStateInit = Record<string, unknown>;
type XRLayer = EventTarget;
type XREye = "none" | "left" | "right";
type XRView = {
  eye: XREye;
};
type XRViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type XRReferenceSpace = object;
type XRViewerPose = {
  views: XRView[];
};
type XRFrame = {
  getViewerPose: (referenceSpace: XRReferenceSpace) => XRViewerPose | null;
};
type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void;
type XRSession = EventTarget & {
  enabledFeatures?: readonly string[];
  updateRenderState: (state: XRRenderStateInit) => void;
  requestReferenceSpace: (type: "local-floor" | "local") => Promise<XRReferenceSpace>;
  requestAnimationFrame: (callback: XRFrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  end: () => Promise<void>;
};

type XrSystem = {
  requestSession: (mode: XRSessionMode, options?: XRSessionInit) => Promise<XRSession>;
};

type XrGpuBindingConstructor = new (session: XRSession, device: GPUDevice) => XrGpuBinding;

type XrGpuBinding = {
  createProjectionLayer: (init?: Record<string, unknown>) => XrProjectionLayer;
  getViewSubImage: (layer: XrProjectionLayer, view: XRView) => XrGpuSubImage;
  getPreferredColorFormat?: () => GPUTextureFormat;
};

type XrProjectionLayer = XRLayer & {
  textureWidth?: number;
  textureHeight?: number;
};

type XrGpuSubImage = {
  colorTexture: GPUTexture;
  imageIndex?: number;
  viewport?: XRViewport;
  colorTextureWidth?: number;
  colorTextureHeight?: number;
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
  private readonly blitSampler: GPUSampler;
  private readonly blitRectBuffers: Record<"left" | "right", GPUBuffer>;
  private blitPipeline: GPURenderPipeline;
  private blitBindGroups: Partial<Record<"left" | "right", GPUBindGroup>> = {};
  private sbsTexture: GPUTexture | null = null;
  private sbsTextureSize: NexusCanvasPixelSize = { width: 0, height: 0 };
  private customSdfSignature = "";
  private customSdfKindIds = new Map<string, number>();
  private snapshot: SceneSnapshot | null = null;
  private xrSession: XRSession | null = null;
  private xrReferenceSpace: XRReferenceSpace | null = null;
  private xrBinding: XrGpuBinding | null = null;
  private xrProjectionLayer: XrProjectionLayer | null = null;
  private xrFrameId = 0;
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
    this.blitSampler = device.createSampler({
      label: "NexusGPU SBS Blit Sampler",
      magFilter: "linear",
      minFilter: "linear",
    });
    this.blitRectBuffers = {
      left: createBlitRectBuffer(device, "left", SBS_SOURCE_RECTS.left),
      right: createBlitRectBuffer(device, "right", SBS_SOURCE_RECTS.right),
    };
    this.blitPipeline = this.createBlitPipeline();

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
      xrCompatible: true,
    } as GPURequestAdapterOptions & { xrCompatible?: boolean });

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
    void this.endXrSession();
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.sbsTexture?.destroy();
    this.blitRectBuffers.left.destroy();
    this.blitRectBuffers.right.destroy();
    this.cameraBuffer.destroy();
    this.objectBuffer.destroy();
  }

  async startXrSbsSession() {
    if (this.xrSession) {
      return;
    }

    const xr = (navigator as Navigator & { xr?: XrSystem }).xr;
    if (!xr) {
      throw new Error("WebXR is not available in this browser.");
    }

    const XrGpuBinding = getXrGpuBindingConstructor();
    if (!XrGpuBinding) {
      throw new Error("WebXR WebGPU binding is not available in this browser.");
    }

    const session = await xr.requestSession("immersive-vr", {
      requiredFeatures: ["webgpu"],
      optionalFeatures: ["local-floor", "bounded-floor"],
    });
    const referenceSpace = await requestReferenceSpace(session);
    const binding = new XrGpuBinding(session, this.device);
    const projectionLayer = createProjectionLayer(binding, binding.getPreferredColorFormat?.() ?? this.format);

    session.updateRenderState({ layers: [projectionLayer] } as XRRenderStateInit);
    session.addEventListener("end", this.handleXrEnd, { once: true });

    this.xrSession = session;
    this.xrReferenceSpace = referenceSpace;
    this.xrBinding = binding;
    this.xrProjectionLayer = projectionLayer;
    this.setRenderStats({ xrPresenting: true });
    this.xrFrameId = session.requestAnimationFrame(this.xrFrame);
  }

  async endXrSession() {
    const session = this.xrSession;
    if (!session) {
      return;
    }

    session.cancelAnimationFrame(this.xrFrameId);
    await session.end().catch(() => undefined);
    this.clearXrState();
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
    const nodes = snapshot.nodes.slice(0, MAX_SDF_OBJECTS);

    nodes.forEach((node, index) => {
      const offset = index * OBJECT_STRIDE_FLOATS;
      this.objectData[offset + 0] = node.position[0];
      this.objectData[offset + 1] = node.position[1];
      this.objectData[offset + 2] = node.position[2];
      this.objectData[offset + 3] = this.getSdfKindId(node);
      this.objectData.set(node.data[0], offset + 4);
      this.objectData.set(node.data[1], offset + 8);
      this.objectData.set(node.data[2], offset + 12);
      this.objectData[offset + 16] = node.color[0];
      this.objectData[offset + 17] = node.color[1];
      this.objectData[offset + 18] = node.color[2];
      this.objectData[offset + 19] = node.smoothness;
      this.objectData[offset + 20] = node.rotation[0];
      this.objectData[offset + 21] = node.rotation[1];
      this.objectData[offset + 22] = node.rotation[2];
      this.objectData[offset + 23] = node.rotation[3];
    });

    const bytesToUpload = nodes.length * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    if (bytesToUpload > 0) {
      this.device.queue.writeBuffer(this.objectBuffer, 0, this.objectData, 0, nodes.length * OBJECT_STRIDE_FLOATS);
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

  private createBlitPipeline() {
    const shaderModule = this.device.createShaderModule({
      label: "NexusGPU SBS Blit Shader",
      code: /* wgsl */ `
struct BlitRect {
  source: vec4<f32>,
};

@group(0) @binding(0) var blitSampler: sampler;
@group(0) @binding(1) var blitTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> blitRect: BlitRect;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let position = positions[vertexIndex];
  var output: VertexOutput;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position * 0.5 + vec2<f32>(0.5);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let uv = blitRect.source.xy + input.uv * blitRect.source.zw;
  return textureSample(blitTexture, blitSampler, uv);
}
`,
    });

    return this.device.createRenderPipeline({
      label: "NexusGPU SBS Blit Pipeline",
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
  }

  private getSdfKindId(node: SdfNode) {
    if (node.kind === "function") {
      return node.sdfFunction ? (this.customSdfKindIds.get(node.sdfFunction) ?? 999999) : 999999;
    }

    return SDF_PRIMITIVE_KIND_IDS[node.kind];
  }

  /** カメラベクトルとデバッグ設定をUniform Bufferへ書き込み、シェーダから参照できるようにする。 */
  private uploadCamera(
    snapshot: SceneSnapshot,
    size: NexusCanvasPixelSize,
    renderSettings: Required<NexusRenderSettings>,
  ) {
    const width = size.width;
    const height = size.height;
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
      [Math.min(snapshot.nodes.length, MAX_SDF_OBJECTS), renderSettings.surfaceEpsilon, 0, 0],
      20,
    );
    this.cameraData.set(
      [
        renderSettings.maxSteps,
        renderSettings.maxDistance,
        renderSettings.shadows ? 1 : 0,
        renderSettings.normalEpsilon,
      ],
      24,
    );
    this.cameraData.set([...lightDirection, 0], 28);
    this.cameraData.set(
      [
        renderSettings.stereoSbs ? 1 : 0,
        renderSettings.stereoBase,
        renderSettings.stereoSwapEyes ? 1 : 0,
        0,
      ],
      32,
    );

    this.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
  }

  private renderSceneToView(
    view: GPUTextureView,
    size: NexusCanvasPixelSize,
    renderSettings: Required<NexusRenderSettings>,
  ) {
    if (!this.snapshot) {
      return;
    }

    this.uploadCamera(this.snapshot, size, renderSettings);
    const encoder = this.device.createCommandEncoder({ label: "NexusGPU Frame Encoder" });
    const pass = encoder.beginRenderPass({
      label: "NexusGPU SDF Pass",
      colorAttachments: [
        {
          view,
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
  }

  private renderSbsTexture(size: NexusCanvasPixelSize) {
    const texture = this.ensureSbsTexture(size);
    this.renderSceneToView(texture.createView(), size, {
      ...this.renderSettings,
      stereoSbs: true,
    });
    return texture;
  }

  /** 毎フレームの描画ループ。フルスクリーン三角形を1枚描き、Fragment ShaderでSDFを評価する。 */
  private frame = () => {
    this.frameId = requestAnimationFrame(this.frame);
    const now = performance.now();
    this.updateFps(now);
    this.resize();

    this.renderSceneToView(
      this.context.getCurrentTexture().createView(),
      { width: this.canvas.width, height: this.canvas.height },
      this.renderSettings,
    );
  };

  private xrFrame = (_time: DOMHighResTimeStamp, frame: XRFrame) => {
    const session = this.xrSession;
    const referenceSpace = this.xrReferenceSpace;
    const binding = this.xrBinding;
    const projectionLayer = this.xrProjectionLayer;

    if (!session || !referenceSpace || !binding || !projectionLayer) {
      return;
    }

    this.xrFrameId = session.requestAnimationFrame(this.xrFrame);

    const pose = frame.getViewerPose(referenceSpace);
    if (!pose || !this.snapshot || pose.views.length === 0) {
      return;
    }

    const firstSubImage = binding.getViewSubImage(projectionLayer, pose.views[0]);
    const eyeWidth = firstSubImage.viewport?.width
      ?? firstSubImage.colorTextureWidth
      ?? projectionLayer.textureWidth
      ?? this.canvas.width;
    const eyeHeight = firstSubImage.viewport?.height
      ?? firstSubImage.colorTextureHeight
      ?? projectionLayer.textureHeight
      ?? this.canvas.height;
    const sbsTexture = this.renderSbsTexture({
      width: Math.max(1, Math.floor(eyeWidth * 2)),
      height: Math.max(1, Math.floor(eyeHeight)),
    });

    const encoder = this.device.createCommandEncoder({ label: "NexusGPU XR SBS Encoder" });
    pose.views.forEach((view) => {
      const subImage = binding.getViewSubImage(projectionLayer, view);
      const textureView = subImage.colorTexture.createView(
        subImage.imageIndex === undefined
          ? undefined
          : { baseArrayLayer: subImage.imageIndex, arrayLayerCount: 1 },
      );
      const sourceRect = view.eye === "right"
        ? (this.renderSettings.stereoSwapEyes ? SBS_SOURCE_RECTS.left : SBS_SOURCE_RECTS.right)
        : (this.renderSettings.stereoSwapEyes ? SBS_SOURCE_RECTS.right : SBS_SOURCE_RECTS.left);

      this.encodeBlit(encoder, sbsTexture, textureView, sourceRect, subImage.viewport);
    });

    this.device.queue.submit([encoder.finish()]);
  };

  private handleXrEnd = () => {
    this.clearXrState();
  };

  private clearXrState() {
    this.xrSession = null;
    this.xrReferenceSpace = null;
    this.xrBinding = null;
    this.xrProjectionLayer = null;
    this.xrFrameId = 0;
    this.setRenderStats({ xrPresenting: false });
  }

  private ensureSbsTexture(size: NexusCanvasPixelSize) {
    if (
      this.sbsTexture &&
      this.sbsTextureSize.width === size.width &&
      this.sbsTextureSize.height === size.height
    ) {
      return this.sbsTexture;
    }

    this.sbsTexture?.destroy();
    this.sbsTextureSize = size;
    this.sbsTexture = this.device.createTexture({
      label: "NexusGPU XR SBS Texture",
      size,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.blitBindGroups = {};
    return this.sbsTexture;
  }

  private encodeBlit(
    encoder: GPUCommandEncoder,
    sourceTexture: GPUTexture,
    targetView: GPUTextureView,
    sourceRect: readonly [number, number, number, number],
    viewport: XRViewport | undefined,
  ) {
    const sourceKey = sourceRect === SBS_SOURCE_RECTS.left ? "left" : "right";

    const bindGroup = this.blitBindGroups[sourceKey] ??= this.device.createBindGroup({
      label: "NexusGPU SBS Blit Bind Group",
      layout: this.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.blitSampler },
        { binding: 1, resource: sourceTexture.createView() },
        { binding: 2, resource: { buffer: this.blitRectBuffers[sourceKey] } },
      ],
    });

    const pass = encoder.beginRenderPass({
      label: "NexusGPU XR SBS Blit Pass",
      colorAttachments: [
        {
          view: targetView,
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });

    if (viewport) {
      pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
    }

    pass.setPipeline(this.blitPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
}

async function requestReferenceSpace(session: XRSession) {
  try {
    return await session.requestReferenceSpace("local-floor");
  } catch {
    return session.requestReferenceSpace("local");
  }
}

function getXrGpuBindingConstructor() {
  const xrGlobal = globalThis as typeof globalThis & {
    XRGPUBinding?: XrGpuBindingConstructor;
    XRWebGPUBinding?: XrGpuBindingConstructor;
  };
  return xrGlobal.XRGPUBinding ?? xrGlobal.XRWebGPUBinding;
}

function createProjectionLayer(binding: XrGpuBinding, format: GPUTextureFormat) {
  try {
    return binding.createProjectionLayer({
      colorFormat: format,
      textureType: "texture-array",
    });
  } catch {
    return binding.createProjectionLayer({
      colorFormat: format,
    });
  }
}

function createBlitRectBuffer(
  device: GPUDevice,
  label: string,
  sourceRect: readonly [number, number, number, number],
) {
  const buffer = device.createBuffer({
    label: `NexusGPU SBS Blit Rect ${label}`,
    size: 4 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, new Float32Array(sourceRect));
  return buffer;
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
