import { clamp, normalizeDirectionVec3 } from "../math";
import type { NexusRenderSettings, NexusXrState, SceneSnapshot, Vec3 } from "../types";
import type { NexusRenderCamera, NexusRenderTargetView } from "./renderTypes";

type XrSessionLike = {
  requestAnimationFrame: (callback: (time: DOMHighResTimeStamp, frame: XrFrameLike) => void) => number;
  cancelAnimationFrame: (id: number) => void;
  requestReferenceSpace: (type: string) => Promise<unknown>;
  updateRenderState: (state: { layers?: unknown[] }) => void;
  end: () => Promise<void>;
  addEventListener: (type: "end", listener: () => void, options?: AddEventListenerOptions) => void;
  removeEventListener: (type: "end", listener: () => void) => void;
};

type XrFrameLike = {
  getViewerPose: (referenceSpace: unknown) => XrViewerPoseLike | null;
};

type XrViewerPoseLike = {
  views: readonly XrViewLike[];
};

type XrViewLike = {
  transform: {
    matrix: Float32Array | number[];
    position?: { x: number; y: number; z: number };
  };
  projectionMatrix: Float32Array | number[];
};

type XrGpuBindingLike = {
  getPreferredColorFormat: () => GPUTextureFormat;
  createProjectionLayer: (init?: { colorFormat?: GPUTextureFormat; scaleFactor?: number }) => unknown;
  getViewSubImage: (layer: unknown, view: XrViewLike) => {
    colorTexture: GPUTexture;
    viewport: { x: number; y: number; width: number; height: number };
    getViewDescriptor?: () => GPUTextureViewDescriptor;
  };
};

type WebXrSessionManagerOptions = {
  device: GPUDevice;
  xrCompatibleDevice: boolean;
  getRenderSettings: () => Required<NexusRenderSettings>;
  getColorFormat: () => GPUTextureFormat;
  setColorFormat: (format: GPUTextureFormat) => void;
  getSnapshot: () => SceneSnapshot | null;
  isRenderingEnabled: () => boolean;
  onFrameStats: (time: DOMHighResTimeStamp) => void;
  onSessionStart: () => void;
  onSessionEnd: () => void;
  renderView: (
    snapshot: SceneSnapshot,
    target: NexusRenderTargetView,
    camera: NexusRenderCamera,
    time: DOMHighResTimeStamp,
  ) => void;
};

const IDENTITY_MATRIX_4X4 = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

export class WebXrSessionManager {
  private state: NexusXrState = {
    supported: false,
    active: false,
    pending: true,
  };
  private onStateChange?: (state: NexusXrState) => void;
  private session: XrSessionLike | null = null;
  private referenceSpace: unknown = null;
  private binding: XrGpuBindingLike | null = null;
  private projectionLayer: unknown = null;
  private frameId = 0;
  private ending = false;

  constructor(private readonly options: WebXrSessionManagerOptions) {
    void this.checkSupport();
  }

  get active() {
    return Boolean(this.session);
  }

  setStateChangeHandler(handler: ((state: NexusXrState) => void) | undefined) {
    this.onStateChange = handler;
    handler?.(this.state);
  }

  async toggle() {
    if (this.session) {
      await this.stopSession();
      return;
    }

    await this.startSession();
  }

  async stopSession() {
    const session = this.session;
    if (!session || this.ending) {
      return;
    }

    this.ending = true;
    session.cancelAnimationFrame(this.frameId);
    this.frameId = 0;

    try {
      await session.end();
    } catch {
      this.handleSessionEnd();
    }
  }

  recreateProjectionLayer() {
    if (!this.session || !this.binding) {
      return;
    }

    try {
      this.createProjectionLayer();
    } catch (reason) {
      this.setState({
        supported: this.state.supported,
        active: Boolean(this.session),
        pending: false,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  resumeFrameLoop() {
    if (!this.session || this.frameId !== 0) {
      return;
    }

    this.frameId = this.session.requestAnimationFrame(this.frame);
  }

  private async checkSupport() {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported?: (mode: string) => Promise<boolean> } }).xr;
    const XRGpuBinding = (globalThis as { XRGPUBinding?: unknown }).XRGPUBinding;

    if (!this.options.xrCompatibleDevice || !xr?.isSessionSupported || !XRGpuBinding) {
      this.setState({ supported: false, active: false, pending: false });
      return;
    }

    try {
      const supported = await xr.isSessionSupported("immersive-vr");
      this.setState({ supported, active: false, pending: false });
    } catch (reason) {
      this.setState({
        supported: false,
        active: false,
        pending: false,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  private async startSession() {
    if (this.state.pending || this.session) {
      return;
    }

    const xr = (navigator as Navigator & {
      xr?: { requestSession?: (mode: string, options?: unknown) => Promise<XrSessionLike> };
    }).xr;
    const XRGpuBinding = (globalThis as {
      XRGPUBinding?: new (session: XrSessionLike, device: GPUDevice) => XrGpuBindingLike;
    }).XRGPUBinding;

    if (!this.state.supported || !xr?.requestSession || !XRGpuBinding) {
      this.setState({
        supported: false,
        active: false,
        pending: false,
        error: "WebXR with WebGPU is not available in this browser.",
      });
      return;
    }

    this.setState({ ...this.state, pending: true, error: undefined });

    try {
      const session = await xr.requestSession("immersive-vr", {
        requiredFeatures: ["webgpu"],
        optionalFeatures: ["local-floor"],
      });
      const referenceSpace = await requestReferenceSpace(session);
      const binding = new XRGpuBinding(session, this.options.device);
      const preferredColorFormat = binding.getPreferredColorFormat();
      if (preferredColorFormat !== this.options.getColorFormat()) {
        this.options.setColorFormat(preferredColorFormat);
      }

      this.session = session;
      this.referenceSpace = referenceSpace;
      this.binding = binding;
      this.ending = false;
      this.createProjectionLayer();
      session.addEventListener("end", this.handleSessionEnd);

      this.options.onSessionStart();
      this.setState({ supported: true, active: true, pending: false });
      this.frameId = session.requestAnimationFrame(this.frame);
    } catch (reason) {
      this.session = null;
      this.referenceSpace = null;
      this.binding = null;
      this.projectionLayer = null;
      this.setState({
        supported: this.state.supported,
        active: false,
        pending: false,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  private readonly handleSessionEnd = () => {
    const session = this.session;
    session?.removeEventListener("end", this.handleSessionEnd);
    session?.cancelAnimationFrame(this.frameId);
    this.session = null;
    this.referenceSpace = null;
    this.binding = null;
    this.projectionLayer = null;
    this.frameId = 0;
    this.ending = false;
    this.setState({ supported: this.state.supported, active: false, pending: false });
    this.options.onSessionEnd();
  };

  private setState(state: NexusXrState) {
    this.state = state;
    this.onStateChange?.(state);
  }

  private createProjectionLayer() {
    if (!this.session || !this.binding) {
      return;
    }

    const scaleFactor = clamp(this.options.getRenderSettings().resolutionScale, 0.2, 1);
    this.projectionLayer = this.binding.createProjectionLayer({
      colorFormat: this.options.getColorFormat(),
      scaleFactor,
    });
    this.session.updateRenderState({ layers: [this.projectionLayer] });
  }

  private readonly frame = (time: DOMHighResTimeStamp, frame: XrFrameLike) => {
    const session = this.session;
    const referenceSpace = this.referenceSpace;
    const binding = this.binding;
    const layer = this.projectionLayer;

    if (!session || !referenceSpace || !binding || !layer || !this.options.isRenderingEnabled()) {
      this.frameId = 0;
      return;
    }

    this.frameId = session.requestAnimationFrame(this.frame);
    this.options.onFrameStats(time);

    const snapshot = this.options.getSnapshot();
    if (!snapshot) {
      return;
    }

    const pose = frame.getViewerPose(referenceSpace);
    if (!pose) {
      return;
    }

    for (const view of pose.views) {
      const subImage = binding.getViewSubImage(layer, view);
      const viewport = subImage.viewport;
      this.options.renderView(
        snapshot,
        {
          view: subImage.colorTexture.createView(subImage.getViewDescriptor?.()),
          x: viewport.x,
          y: viewport.y,
          width: viewport.width,
          height: viewport.height,
          clearValue: { r: 0.02, g: 0.025, b: 0.028, a: 1 },
        },
        createXrRenderCamera(view, viewport),
        time,
      );
    }
  };
}

function createXrRenderCamera(
  view: XrViewLike,
  viewport: { x: number; y: number; width: number; height: number },
): NexusRenderCamera {
  const matrix = view.transform.matrix;
  const position: Vec3 = [
    matrix[12] ?? view.transform.position?.x ?? 0,
    matrix[13] ?? view.transform.position?.y ?? 0,
    matrix[14] ?? view.transform.position?.z ?? 0,
  ];
  const right: Vec3 = normalizeDirectionVec3([matrix[0] ?? 1, matrix[1] ?? 0, matrix[2] ?? 0]);
  const up: Vec3 = normalizeDirectionVec3([matrix[4] ?? 0, matrix[5] ?? 1, matrix[6] ?? 0]);
  const forward: Vec3 = normalizeDirectionVec3([-(matrix[8] ?? 0), -(matrix[9] ?? 0), -(matrix[10] ?? 1)]);

  return {
    width: viewport.width,
    height: viewport.height,
    viewportOrigin: [viewport.x, viewport.y],
    position,
    forward,
    right,
    up,
    fov: 0,
    projectionMode: "inverseProjection",
    inverseProjection: invertMatrix4(view.projectionMatrix),
  };
}

function invertMatrix4(matrix: Float32Array | number[]) {
  const m00 = matrix[0];
  const m01 = matrix[1];
  const m02 = matrix[2];
  const m03 = matrix[3];
  const m10 = matrix[4];
  const m11 = matrix[5];
  const m12 = matrix[6];
  const m13 = matrix[7];
  const m20 = matrix[8];
  const m21 = matrix[9];
  const m22 = matrix[10];
  const m23 = matrix[11];
  const m30 = matrix[12];
  const m31 = matrix[13];
  const m32 = matrix[14];
  const m33 = matrix[15];

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(determinant) < 1e-8) {
    return IDENTITY_MATRIX_4X4;
  }

  const invDet = 1 / determinant;
  return new Float32Array([
    (m11 * b11 - m12 * b10 + m13 * b09) * invDet,
    (m02 * b10 - m01 * b11 - m03 * b09) * invDet,
    (m31 * b05 - m32 * b04 + m33 * b03) * invDet,
    (m22 * b04 - m21 * b05 - m23 * b03) * invDet,
    (m12 * b08 - m10 * b11 - m13 * b07) * invDet,
    (m00 * b11 - m02 * b08 + m03 * b07) * invDet,
    (m32 * b02 - m30 * b05 - m33 * b01) * invDet,
    (m20 * b05 - m22 * b02 + m23 * b01) * invDet,
    (m10 * b10 - m11 * b08 + m13 * b06) * invDet,
    (m01 * b08 - m00 * b10 - m03 * b06) * invDet,
    (m30 * b04 - m31 * b02 + m33 * b00) * invDet,
    (m21 * b02 - m20 * b04 - m23 * b00) * invDet,
    (m11 * b07 - m10 * b09 - m12 * b06) * invDet,
    (m00 * b09 - m01 * b07 + m02 * b06) * invDet,
    (m31 * b01 - m30 * b03 - m32 * b00) * invDet,
    (m20 * b03 - m21 * b01 + m22 * b00) * invDet,
  ]);
}

async function requestReferenceSpace(session: XrSessionLike) {
  try {
    return await session.requestReferenceSpace("local");
  } catch {
    return session.requestReferenceSpace("local-floor");
  }
}
