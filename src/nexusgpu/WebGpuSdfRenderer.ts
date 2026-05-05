import { MAX_SDF_OBJECTS } from "./sdfShader";
import { assembleSdfShader, type CustomSdfFunctionShader } from "./shaders";
import { CUSTOM_SDF_PRIMITIVE_KIND_START, SDF_PRIMITIVE_KIND_IDS } from "./sdfKinds";
import type {
  NexusCanvasPixelSize,
  NexusRenderSettings,
  NexusRenderStats,
  SceneSnapshot,
  SdfNode,
  SdfSceneNode,
  Vec3,
} from "./types";

const CAMERA_FLOATS = 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4;
const CAMERA_BUFFER_SIZE = CAMERA_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const OBJECT_STRIDE_FLOATS = 24;
const OBJECT_BUFFER_SIZE = MAX_SDF_OBJECTS * OBJECT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

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
      this.renderOnce();
    }
  }

  /** デバッグUIから渡された描画品質設定を正規化し、必要なら内部解像度を更新する。 */
  setRenderSettings(settings: NexusRenderSettings | undefined) {
    this.renderSettings = normalizeRenderSettings(settings);
    this.resize();

    if (!this.renderingEnabled) {
      this.renderOnce();
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

    this.lastRenderTime = 0;
    this.lastFpsSampleTime = performance.now();
    this.frame();
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
    const records = compilePrimitiveRecords(snapshot.sceneNodes, (node) => this.getSdfKindId(node)).slice(0, MAX_SDF_OBJECTS);
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
    const sdfFunctions = unique(
      snapshot.nodes.flatMap((node) => (node.kind === "function" && node.sdfFunction ? [node.sdfFunction] : [])),
    );

    // 同じWGSL文字列は1つのcustom関数として共有し、scene内ではkind IDと関数名で参照する。
    const customSdfFunctions = sdfFunctions.map((sdfFunction, index) => {
      const functionName = `customSdfFunction${index}`;

      return {
        sdfFunction,
        kindId: CUSTOM_SDF_PRIMITIVE_KIND_START + index,
        ...createCustomSdfFunctionSource(sdfFunction, functionName),
      };
    });
    const customShaders = customSdfFunctions.map<CustomSdfFunctionShader>((customSdfFunction) => {
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
            acceptsColor: customSdfFunction.acceptsColor,
            acceptsSmoothness: customSdfFunction.acceptsSmoothness,
          },
        ];
      }),
    );

    // シーン木はGPU側で解釈せず、mapScene()のWGSLコードとして展開する。
    const mapSceneBody = createExpandedMapSceneBody(snapshot.sceneNodes, customSdfFunctionNames);
    const signature = [
      sdfFunctions.join("\n/* nexusgpu-sdf-function */\n"),
      createSceneTopologySignature(snapshot.sceneNodes),
    ].join("\n/* nexusgpu-scene-topology */\n");

    if (signature === this.shaderSignature) {
      return;
    }

    this.shaderSignature = signature;
    const pipelineState = this.createPipeline(customShaders, mapSceneBody);
    this.pipeline = pipelineState.pipeline;
    this.bindGroup = pipelineState.bindGroup;
  }

  /** 現在のcustom SDF関数とmapScene()からShader ModuleとRender Pipelineを作る。 */
  private createPipeline(customSdfFunctions: readonly CustomSdfFunctionShader[], mapSceneBody: string) {
    const shaderCode = assembleSdfShader(MAX_SDF_OBJECTS, customSdfFunctions, mapSceneBody);
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
        Math.min(countPrimitiveRecords(snapshot.sceneNodes), MAX_SDF_OBJECTS),
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

type SdfRecord = number[];
type GetSdfKindId = (node: SdfNode) => number;

/** シーン木を深さ優先でたどり、Storage Bufferへ積むprimitiveレコード列へ変換する。 */
function compilePrimitiveRecords(sceneNodes: readonly SdfSceneNode[], getSdfKindId: GetSdfKindId) {
  const records: SdfRecord[] = [];

  for (const node of sceneNodes) {
    appendPrimitiveRecord(node, records, getSdfKindId);
  }

  return records;
}

/** グループを除いた実primitive数を数え、camera.objectInfo.xへ渡す値に使う。 */
function countPrimitiveRecords(sceneNodes: readonly SdfSceneNode[]): number {
  return sceneNodes.reduce((count, node) => {
    if (node.type === "primitive") {
      return count + 1;
    }

    return count + countPrimitiveRecords(node.children);
  }, 0);
}

/** グループノードを展開し、葉のprimitiveだけをrecordsへ追加する。 */
function appendPrimitiveRecord(node: SdfSceneNode, records: SdfRecord[], getSdfKindId: GetSdfKindId) {
  if (node.type === "primitive") {
    records.push(createPrimitiveRecord(node.node, getSdfKindId(node.node)));
    return;
  }

  for (const child of node.children) {
    appendPrimitiveRecord(child, records, getSdfKindId);
  }
}

/** SdfNodeをWGSL側のSdfObject構造体と同じ24個のf32配列へ詰める。 */
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

type ExpandedSceneCompileState = {
  /** objects[]の何番目を参照するか。Storage Bufferへの詰め順と一致させる。 */
  primitiveIndex: number;
  /** 生成WGSL内の一時変数名を衝突させないための連番。 */
  tempIndex: number;
};

type ExpandedSceneCompileResult = {
  /** このnodeを評価するためのWGSL文列。 */
  code: string;
  /** codeの末尾で生成されたSceneHit変数名。 */
  hitName: string;
  /** 親グループがboolean演算時に使うsmoothness式。 */
  smoothnessExpression: string;
};

type CustomSdfFunctionCallSpec = {
  /** レンダラが割り当てたGPU側の安全な関数名。 */
  functionName: string;
  /** trueなら戻り値をSceneHitとしてそのまま使い、falseならf32距離としてSceneHitへ包む。 */
  returnsSceneHit: boolean;
  /** 関数呼び出しへobject.colorSmooth.rgbを渡すか。 */
  acceptsColor: boolean;
  /** 関数呼び出しへobject.colorSmooth.wを渡すか。 */
  acceptsSmoothness: boolean;
};

type CustomSdfFunctionNameMap = ReadonlyMap<string, CustomSdfFunctionCallSpec>;

/** scene tree全体を、Fragment Shaderから呼ぶmapScene(point)関数のWGSL bodyへ展開する。 */
function createExpandedMapSceneBody(
  sceneNodes: readonly SdfSceneNode[],
  customSdfFunctionNames: CustomSdfFunctionNameMap,
) {
  const state: ExpandedSceneCompileState = { primitiveIndex: 0, tempIndex: 0 };
  const chunks: string[] = [
    "fn mapScene(point: vec3<f32>) -> SceneHit {",
    "  var best = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);",
  ];

  for (const node of sceneNodes) {
    const result = compileExpandedSceneNode(node, state, customSdfFunctionNames);
    chunks.push(result.code);
    chunks.push(`  best = unionHit(best, ${result.hitName}, ${result.smoothnessExpression});`);
  }

  chunks.push("  return best;");
  chunks.push("}");

  return chunks.join("\n");
}

/** scene未設定時に使う空のmapScene()。背景距離を返して何もhitしない状態にする。 */
function createEmptyMapSceneBody() {
  return [
    "fn mapScene(point: vec3<f32>) -> SceneHit {",
    "  return SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);",
    "}",
  ].join("\n");
}

/** 1つのscene nodeを評価するWGSL片へ再帰的にコンパイルする。 */
function compileExpandedSceneNode(
  node: SdfSceneNode,
  state: ExpandedSceneCompileState,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
): ExpandedSceneCompileResult {
  if (node.type === "primitive") {
    const primitiveIndex = state.primitiveIndex;
    const hitName = nextTempName("hit", state);
    const objectName = nextTempName("object", state);
    const localPointName = nextTempName("localPoint", state);
    const hitExpression = createPrimitiveHitExpression(
      node.node,
      localPointName,
      objectName,
      customSdfFunctionNames,
    );

    state.primitiveIndex += 1;

    return {
      code: [
        `  let ${objectName} = objects[${primitiveIndex}u];`,
        `  let ${localPointName} = ${createLocalPointExpression(node.node, objectName)};`,
        `  let ${hitName} = ${hitExpression};`,
      ].join("\n"),
      hitName,
      smoothnessExpression: `${hitName}.smoothness`,
    };
  }

  const children = node.children.map((child) => compileExpandedSceneNode(child, state, customSdfFunctionNames));
  const hitName = nextTempName("groupHit", state);
  const smoothness = formatWgslFloat(node.smoothness);

  if (children.length === 0) {
    return {
      code: `  let ${hitName} = SceneHit(camera.renderInfo.y, vec3<f32>(0.72, 0.82, 0.9), 0.0);`,
      hitName,
      smoothnessExpression: smoothness,
    };
  }

  if (node.op === "not") {
    return {
      code: [children[0].code, `  let ${hitName} = notHit(${children[0].hitName});`].join("\n"),
      hitName,
      smoothnessExpression: smoothness,
    };
  }

  const lines = children.map((child) => child.code);
  lines.push(`  var ${hitName} = ${children[0].hitName};`);

  for (const child of children.slice(1)) {
    if (node.op === "and") {
      lines.push(`  ${hitName} = intersectHit(${hitName}, ${child.hitName}, ${smoothness});`);
    } else if (node.op === "subtract") {
      lines.push(`  ${hitName} = subtractHit(${hitName}, ${child.hitName}, ${smoothness});`);
    } else {
      lines.push(`  ${hitName} = unionHit(${hitName}, ${child.hitName}, ${smoothness});`);
    }
  }

  return {
    code: lines.join("\n"),
    hitName,
    smoothnessExpression: smoothness,
  };
}

/** rotation propが省略されていれば、WGSL上のquaternion計算を生成せず平行移動だけにする。 */
function createLocalPointExpression(node: SdfNode, objectName: string) {
  const translatedPoint = `point - ${objectName}.positionKind.xyz`;

  if (!node.hasRotation) {
    return translatedPoint;
  }

  return `rotateByQuaternion(${translatedPoint}, vec4<f32>(-${objectName}.rotation.xyz, ${objectName}.rotation.w))`;
}

/** 組み込みprimitiveまたはSdfFunction呼び出しをSceneHit式として生成する。 */
function createPrimitiveHitExpression(
  node: SdfNode,
  localPointName: string,
  objectName: string,
  customSdfFunctionNames: CustomSdfFunctionNameMap,
) {
  // f32距離だけを返す形式は、objectの色とsmoothnessで従来通りSceneHitへ包む。
  const createDefaultHit = (distanceExpression: string) =>
    `SceneHit(${distanceExpression}, ${objectName}.colorSmooth.rgb, ${objectName}.colorSmooth.w)`;

  if (node.kind === "sphere") {
    return createDefaultHit(`sdSphere(${localPointName}, ${objectName}.data0.x)`);
  }

  if (node.kind === "box") {
    return createDefaultHit(`sdBox(${localPointName}, ${objectName}.data0.xyz)`);
  }

  if (node.kind === "cylinder") {
    return createDefaultHit(`sdCylinder(${localPointName}, ${objectName}.data0.xy)`);
  }

  if (node.kind === "torus") {
    return createDefaultHit(`sdTorus(${localPointName}, ${objectName}.data0.xy)`);
  }

  if (node.kind === "ellipsoid") {
    return createDefaultHit(`sdEllipsoid(${localPointName}, ${objectName}.data0.xyz)`);
  }

  if (!node.sdfFunction) {
    throw new Error("SdfFunction requires a non-empty WGSL function string.");
  }

  const callSpec = customSdfFunctionNames.get(node.sdfFunction);
  if (!callSpec) {
    throw new Error("SdfFunction was not registered before scene shader expansion.");
  }

  const args = [
    localPointName,
    `${objectName}.data0`,
    `${objectName}.data1`,
    `${objectName}.data2`,
    ...(callSpec.acceptsColor ? [`${objectName}.colorSmooth.rgb`] : []),
    ...(callSpec.acceptsSmoothness ? [`${objectName}.colorSmooth.w`] : []),
  ].join(", ");
  const customCall = `${callSpec.functionName}(${args})`;

  // SceneHit形式はWGSL関数内で色とsmoothnessを決めるため、そのままmapScene()へ渡す。
  if (callSpec.returnsSceneHit) {
    return customCall;
  }

  return createDefaultHit(customCall);
}

/** pipeline再生成の要否を判定するため、scene treeの形だけを安定した文字列にする。 */
function createSceneTopologySignature(sceneNodes: readonly SdfSceneNode[]): string {
  return sceneNodes.map(createSceneNodeTopologySignature).join("|");
}

/** 1つのscene nodeをtopology signature用の短い文字列へ変換する。 */
function createSceneNodeTopologySignature(node: SdfSceneNode): string {
  if (node.type === "primitive") {
    const rotationSignature = node.node.hasRotation ? "rotated" : "unrotated";

    return node.node.kind === "function"
      ? `function:${rotationSignature}:${node.node.sdfFunction ?? ""}`
      : `${node.node.kind}:${rotationSignature}`;
  }

  return `group:${node.op}:${formatWgslFloat(node.smoothness)}(${node.children
    .map(createSceneNodeTopologySignature)
    .join(",")})`;
}

/** 生成WGSL内で使う一時変数名を発行する。 */
function nextTempName(prefix: string, state: ExpandedSceneCompileState) {
  const name = `${prefix}${state.tempIndex}`;
  state.tempIndex += 1;
  return name;
}

/** JSのnumberをWGSLのf32リテラルとして安全に埋め込む。 */
function formatWgslFloat(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0";
  }

  const rounded = Math.round(value * 1000000) / 1000000;
  return Number.isInteger(rounded) ? `${rounded}.0` : `${rounded}`;
}

/** 出現順を保ったまま重複を取り除く。 */
function unique(values: readonly string[]) {
  return [...new Set(values)];
}

/** SdfFunctionの入力文字列を、renderer管理の関数名を持つWGSL関数へ正規化する。 */
function createCustomSdfFunctionSource(source: string, functionName: string): CustomSdfFunctionCallSpec & { source: string } {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("SdfFunction requires a non-empty WGSL function string.");
  }

  const declaration = parseWgslFunctionDeclaration(trimmed);
  if (declaration) {
    // 関数全体が渡された場合は戻り値型と引数数を見て、SceneHit/color/smoothness対応を判定する。
    const renamedSource = trimmed.replace(
      new RegExp(`\\bfn\\s+${declaration.name}\\s*\\(`),
      `fn ${functionName}(`,
    );

    return {
      functionName,
      returnsSceneHit: declaration.returnType === "SceneHit",
      acceptsColor: declaration.parameterCount >= 5,
      acceptsSmoothness: declaration.parameterCount >= 6,
      source: renamedSource,
    };
  }

  const returnsSceneHit = /\bSceneHit\s*\(/.test(trimmed);
  const body = trimmed.includes(";") || /\breturn\b/.test(trimmed) ? trimmed : `return ${trimmed};`;
  const returnType = returnsSceneHit ? "SceneHit" : "f32";

  // body / 式形式は便利さ優先でcolorとsmoothnessを常に使えるラッパー関数にする。
  return {
    functionName,
    returnsSceneHit,
    acceptsColor: true,
    acceptsSmoothness: true,
    source: /* wgsl */ `
fn ${functionName}(point: vec3<f32>, data0: vec4<f32>, data1: vec4<f32>, data2: vec4<f32>, color: vec3<f32>, smoothness: f32) -> ${returnType} {
  ${body}
}
`,
  };
}

/** WGSL関数宣言から関数名、引数数、戻り値型だけを抜き出す。 */
function parseWgslFunctionDeclaration(source: string) {
  const match =
    source.match(/\bfn\s+(sdfFunction)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)/s) ??
    source.match(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)/s);
  if (!match) {
    return null;
  }

  const parameters = match[2].trim();

  return {
    name: match[1],
    parameterCount: parameters ? parameters.split(",").length : 0,
    returnType: match[3],
  };
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
