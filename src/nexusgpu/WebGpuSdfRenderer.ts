import { MAX_SDF_OBJECTS } from "./sdfShader";
import { assembleSdfShader, type CustomSdfFunctionShader } from "./shaders";
import { CUSTOM_SDF_PRIMITIVE_KIND_START, SDF_PRIMITIVE_KIND_IDS } from "./sdfKinds";
import {
  collectSdfFunctionSources,
  createCustomSdfFunctionSource,
  createCustomSdfModifierFunctionSource,
  unique,
  uniqueModifierFunctionSources,
} from "./renderer/customWgslFunctions";
import {
  createEmptyMapSceneBody,
  createExpandedMapSceneBody,
  createSceneCompileProfile,
  createSceneTopologySignature,
  type SceneCompileProfile,
} from "./renderer/sceneShaderCompiler";
import {
  compileSceneObjectRecords,
  countSceneObjectRecords,
  OBJECT_BUFFER_SIZE,
  OBJECT_STRIDE_FLOATS,
} from "./renderer/sceneBuffers";
import type {
  NexusMaterialShader,
  NexusRenderSettings,
  NexusRenderStats,
  SceneSnapshot,
  SdfNode,
  Vec3,
} from "./types";

const CAMERA_FLOATS = 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4;
const CAMERA_BUFFER_SIZE = CAMERA_FLOATS * Float32Array.BYTES_PER_ELEMENT;

/** UIから省略された描画設定に使う初期値。 */
const DEFAULT_RENDER_SETTINGS: Required<NexusRenderSettings> = {
  maxFps: 60,
  resolutionScale: 0.75,
  maxSteps: 72,
  maxDistance: 45,
  shadows: false,
  normalEpsilon: 0.002,
  surfaceEpsilon: 0.002,
  stereoSbs: false,
  stereoBase: 0.08,
  stereoSwapEyes: false,
  hitInteriorSurfaces: true,
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
  private readonly sceneBindGroupLayout: GPUBindGroupLayout;
  private readonly pipelineLayout: GPUPipelineLayout;
  private readonly resizeObserver: ResizeObserver;
  private readonly objectData = new Float32Array(MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS);
  private readonly cameraData = new Float32Array(CAMERA_FLOATS);
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private shaderSignature = "";
  private materialShader: NexusMaterialShader | undefined;
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
  private lastRenderTime = 0;
  private renderingEnabled = true;
  private pendingRenderOnceFrameId = 0;

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

    this.sceneBindGroupLayout = device.createBindGroupLayout({
      label: "NexusGPU Scene Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
            minBindingSize: CAMERA_BUFFER_SIZE,
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: "read-only-storage",
            minBindingSize: OBJECT_BUFFER_SIZE,
          },
        },
      ],
    });
    this.pipelineLayout = device.createPipelineLayout({
      label: "NexusGPU SDF Pipeline Layout",
      bindGroupLayouts: [this.sceneBindGroupLayout],
    });

    const pipelineState = this.createPipeline([], createEmptyMapSceneBody());
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
    this.configureScenePipeline(snapshot);
    this.uploadObjects(snapshot);

    if (!this.renderingEnabled) {
      this.scheduleRenderOnce();
    }
  }

  /** デバッグUIから渡された描画品質設定を正規化し、必要なら内部解像度を更新する。 */
  setRenderSettings(settings: NexusRenderSettings | undefined) {
    this.renderSettings = normalizeRenderSettings(settings);
    this.resize();

    if (!this.renderingEnabled) {
      this.scheduleRenderOnce();
    }
  }

  /** scene固有のmaterial shaderを差し替え、必要ならpipelineを作り直す。 */
  setMaterialShader(materialShader: NexusMaterialShader | undefined) {
    if (this.materialShader === materialShader) {
      return;
    }

    this.materialShader = materialShader;
    this.shaderSignature = "";

    if (this.snapshot) {
      this.configureScenePipeline(this.snapshot);
    }

    if (!this.renderingEnabled) {
      this.scheduleRenderOnce();
    }
  }

  /** 描画ループを停止/再開する。停止中はcanvasへ何も描かず、最後のフレームを保持する。 */
  setRenderingEnabled(enabled: boolean) {
    if (this.renderingEnabled === enabled) {
      return;
    }

    this.renderingEnabled = enabled;

    if (!enabled) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.framesSinceFpsSample = 0;
      this.lastFpsSampleTime = performance.now();
      this.setRenderStats({ fps: 0 });
      return;
    }

    cancelAnimationFrame(this.pendingRenderOnceFrameId);
    this.pendingRenderOnceFrameId = 0;
    this.lastRenderTime = 0;
    this.lastFpsSampleTime = performance.now();
    this.frame();
  }

  /** requestAnimationFrame、ResizeObserver、GPUBufferを解放する。 */
  destroy() {
    cancelAnimationFrame(this.frameId);
    cancelAnimationFrame(this.pendingRenderOnceFrameId);
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

  /** 統計情報を部分更新し、購読側へ最新値を通知する。 */
  private setRenderStats(stats: Partial<NexusRenderStats>) {
    this.renderStats = { ...this.renderStats, ...stats };
    this.onRenderStatsChange?.(this.renderStats);
  }

  /** 500msごとに平均FPSを再計算し、UI更新頻度を抑える。 */
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

  /** maxFps設定に合わせて、現在フレームの描画を間引くか判定する。 */
  private shouldSkipRender(now: number) {
    const frameInterval = 1000 / this.renderSettings.maxFps;

    if (this.lastRenderTime === 0) {
      this.lastRenderTime = now;
      return false;
    }

    const elapsed = now - this.lastRenderTime;
    if (elapsed < frameInterval) {
      return true;
    }

    this.lastRenderTime = now - (elapsed % frameInterval);
    return false;
  }

  /** SceneSnapshot内のSDFノードを、WGSL側のSdfObject配列と同じSoA寄りレイアウトへ詰める。 */
  private uploadObjects(snapshot: SceneSnapshot) {
    const records = compileSceneObjectRecords(snapshot.sceneNodes, (node) => this.getSdfKindId(node)).slice(0, MAX_SDF_OBJECTS);
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

  /** SdfFunctionとscene tree構造をshaderへ展開し、必要なときだけpipelineを作り直す。 */
  private configureScenePipeline(snapshot: SceneSnapshot) {
    const sdfFunctions = unique(collectSdfFunctionSources(snapshot.sceneNodes));
    const modifierFunctions = uniqueModifierFunctionSources(snapshot.sceneNodes);

    // 同じWGSL文字列は1つのcustom関数として共有し、scene内ではkind IDと関数名で参照する。
    const customSdfFunctions = sdfFunctions.map((sdfFunction, index) => {
      const functionName = `customSdfFunction${index}`;

      return {
        sdfFunction,
        kindId: CUSTOM_SDF_PRIMITIVE_KIND_START + index,
        ...createCustomSdfFunctionSource(sdfFunction, functionName),
      };
    });
    const customModifierFunctions = modifierFunctions.map((modifierFunction, index) => {
      const functionName = `customSdfModifierFunction${index}`;

      return {
        ...modifierFunction,
        kindId: CUSTOM_SDF_PRIMITIVE_KIND_START + customSdfFunctions.length + index,
        ...createCustomSdfModifierFunctionSource(modifierFunction.source, functionName, modifierFunction.mode),
      };
    });
    const customShaders = [...customSdfFunctions, ...customModifierFunctions].map<CustomSdfFunctionShader>((customSdfFunction) => {
      return {
        kindId: customSdfFunction.kindId,
        functionName: customSdfFunction.functionName,
        source: customSdfFunction.source,
      };
    });

    this.customSdfKindIds = new Map(
      customSdfFunctions.map((customSdfFunction) => [customSdfFunction.sdfFunction, customSdfFunction.kindId]),
    );
    const customSdfFunctionNames = new Map(
      customSdfFunctions.map((customSdfFunction) => {
        return [
          customSdfFunction.sdfFunction,
          {
            functionName: customSdfFunction.functionName,
            returnsSceneHit: customSdfFunction.returnsSceneHit,
            returnsSceneEval: customSdfFunction.returnsSceneEval,
            acceptsColor: customSdfFunction.acceptsColor,
            acceptsSmoothness: customSdfFunction.acceptsSmoothness,
          },
        ];
      }),
    );
    const customModifierFunctionNames = new Map(
      customModifierFunctions.map((customModifierFunction) => {
        return [
          customModifierFunction.key,
          {
            functionName: customModifierFunction.functionName,
            returnsSceneHit: customModifierFunction.returnsSceneHit,
          },
        ];
      }),
    );

    // シーン木はGPU側で解釈せず、mapScene()のWGSLコードとして展開する。
    const mapSceneBody = createExpandedMapSceneBody(
      snapshot.sceneNodes,
      customSdfFunctionNames,
      customModifierFunctionNames,
    );
    const signature = [
      this.materialShader ?? "",
      sdfFunctions.join("\n/* nexusgpu-sdf-function */\n"),
      modifierFunctions.map((modifierFunction) => `${modifierFunction.mode}:${modifierFunction.source}`).join("\n/* nexusgpu-sdf-modifier */\n"),
      createSceneTopologySignature(snapshot.sceneNodes),
    ].join("\n/* nexusgpu-scene-topology */\n");

    if (signature === this.shaderSignature) {
      return;
    }

    this.shaderSignature = signature;
    this.logSceneCompileProfile(createSceneCompileProfile(snapshot.sceneNodes, customSdfFunctionNames));
    const pipelineState = this.createPipeline(customShaders, mapSceneBody);
    this.pipeline = pipelineState.pipeline;
    this.bindGroup = pipelineState.bindGroup;
  }

  private logSceneCompileProfile(profile: SceneCompileProfile) {
    console.groupCollapsed("[NexusGPU] SDF scene compile profile");
    console.log("[NexusGPU] SDF scene compile profile data", JSON.stringify(profile, null, 2));
    console.table({
      sceneRoots: profile.sceneRoots,
      primitives: profile.primitives.total,
      groups: profile.groups.total,
      modifiers: profile.modifiers.total,
      analyticGradientCalcsPerMapEval: profile.gradient.totalAnalyticCalcsPerMapEval,
      builtinGradientCalcsPerMapEval: profile.gradient.analyticPrimitiveCalcsPerMapEval,
      customSceneEvalCalcsPerMapEval: profile.gradient.customSceneEvalCalcsPerMapEval,
      smoothGradientBlendOpsPerMapEval: profile.gradient.smoothBlendOpsPerMapEval,
      finiteDifferenceFallbackMapSceneCalls: profile.gradient.finiteDifferenceFallbackMapSceneCalls,
      gradientInvalidationPoints: profile.modifiers.invalidatesGrad + profile.primitives.customNoGrad,
    });
    console.table(profile.primitives.byKind);
    console.table(profile.groups.byOp);
    console.table({
      builtinWithAnalyticGrad: profile.primitives.builtinWithAnalyticGrad,
      customSceneEval: profile.primitives.customSceneEval,
      customNoGrad: profile.primitives.customNoGrad,
      modifiersWithPre: profile.modifiers.withPre,
      modifiersWithPost: profile.modifiers.withPost,
      modifierInvalidations: profile.modifiers.invalidatesGrad,
      hardMergeOps: profile.groups.hardMergeOps,
      smoothMergeOps: profile.groups.smoothMergeOps,
    });
    console.groupEnd();
  }

  /** 現在のcustom SDF関数とmapScene()からShader ModuleとRender Pipelineを作る。 */
  private createPipeline(customSdfFunctions: readonly CustomSdfFunctionShader[], mapSceneBody: string) {
    const shaderCode = assembleSdfShader(MAX_SDF_OBJECTS, customSdfFunctions, mapSceneBody, this.materialShader);
    console.log("[NexusGPU] Generated WGSL scene mapping", mapSceneBody);

    const shaderModule = this.device.createShaderModule({
      label: "NexusGPU SDF Raymarcher",
      code: shaderCode,
    });

    const pipeline = this.device.createRenderPipeline({
      label: "NexusGPU SDF Pipeline",
      layout: this.pipelineLayout,
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
      layout: this.sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.objectBuffer } },
      ],
    });

    return { pipeline, bindGroup };
  }

  /** 組み込みprimitiveは固定ID、SdfFunctionは関数文字列ごとに割り当てた動的IDを返す。 */
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
        Math.min(countSceneObjectRecords(snapshot.sceneNodes), MAX_SDF_OBJECTS),
        this.renderSettings.surfaceEpsilon,
        this.renderSettings.hitInteriorSurfaces ? 1 : 0,
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
    this.cameraData.set([...snapshot.background.yPositive, 0], 36);
    this.cameraData.set([...snapshot.background.yNegative, 0], 40);

    this.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
  }

  /** 毎フレームの描画ループ。フルスクリーン三角形を1枚描き、Fragment ShaderでSDFを評価する。 */
  private frame = () => {
    if (!this.renderingEnabled) {
      return;
    }

    this.frameId = requestAnimationFrame(this.frame);
    const now = performance.now();

    if (this.shouldSkipRender(now)) {
      return;
    }

    this.renderFrame(now, true);
  };

  /** 停止中の連続したscene/settings更新を、次のRAFの1描画へまとめる。 */
  private scheduleRenderOnce() {
    // 停止中のスライダー操作では更新が連続するため、描画予約は1つだけ持つ。
    if (this.pendingRenderOnceFrameId !== 0) {
      return;
    }

    this.pendingRenderOnceFrameId = requestAnimationFrame(() => {
      this.pendingRenderOnceFrameId = 0;
      this.renderOnce();
    });
  }

  /** 停止中のカメラ操作や設定変更に反応して、連続ループなしで1フレームだけ描画する。 */
  private renderOnce() {
    this.resize();
    if (!this.snapshot) {
      return;
    }

    this.renderFrame(performance.now(), false);
  }

  /** カメラUniformを更新し、現在のpipelineでフルスクリーン三角形を1回描画する。 */
  private renderFrame(now: number, updateStats: boolean) {
    if (updateStats) {
      this.updateFps(now);
    }

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
  }
}

/** UI由来の設定値を、シェーダが想定する安全な範囲に丸める。 */
function normalizeRenderSettings(settings: NexusRenderSettings | undefined): Required<NexusRenderSettings> {
  return {
    maxFps: Math.round(clamp(settings?.maxFps ?? DEFAULT_RENDER_SETTINGS.maxFps, 1, 240)),
    resolutionScale: clamp(settings?.resolutionScale ?? DEFAULT_RENDER_SETTINGS.resolutionScale, 0.25, 1),
    maxSteps: Math.round(clamp(settings?.maxSteps ?? DEFAULT_RENDER_SETTINGS.maxSteps, 16, 160)),
    maxDistance: clamp(settings?.maxDistance ?? DEFAULT_RENDER_SETTINGS.maxDistance, 8, 120),
    shadows: settings?.shadows ?? DEFAULT_RENDER_SETTINGS.shadows,
    normalEpsilon: clamp(settings?.normalEpsilon ?? DEFAULT_RENDER_SETTINGS.normalEpsilon, 0.0008, 0.01),
    surfaceEpsilon: clamp(settings?.surfaceEpsilon ?? DEFAULT_RENDER_SETTINGS.surfaceEpsilon, 0.0008, 0.02),
    stereoSbs: settings?.stereoSbs ?? DEFAULT_RENDER_SETTINGS.stereoSbs,
    stereoBase: clamp(settings?.stereoBase ?? DEFAULT_RENDER_SETTINGS.stereoBase, 0, 1),
    stereoSwapEyes: settings?.stereoSwapEyes ?? DEFAULT_RENDER_SETTINGS.stereoSwapEyes,
    hitInteriorSurfaces: settings?.hitInteriorSurfaces ?? DEFAULT_RENDER_SETTINGS.hitInteriorSurfaces,
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
