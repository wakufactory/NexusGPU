import type { NexusTextureSource } from "../types";

export const MAX_SCENE_TEXTURES = 4;
export const SCENE_SAMPLER_BINDING_START = 2;
export const SCENE_TEXTURE_BINDING_START = SCENE_SAMPLER_BINDING_START + MAX_SCENE_TEXTURES;

type NormalizedTextureSource = {
  src: string;
  crossOrigin?: HTMLImageElement["crossOrigin"];
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
>;

type TextureLoadResult = {
  index: number;
  texture: GPUTexture;
};

export class SceneTextureBindings {
  private readonly fallbackTexture: GPUTexture;
  private textureSlots: GPUTexture[];
  private samplerSlots: GPUSampler[];
  private textureSignature = "";
  private loadGeneration = 0;
  private destroyed = false;

  constructor(private readonly device: GPUDevice) {
    this.fallbackTexture = createFallbackTexture(device);
    this.textureSlots = Array.from({ length: MAX_SCENE_TEXTURES }, () => this.fallbackTexture);
    this.samplerSlots = Array.from({ length: MAX_SCENE_TEXTURES }, (_value, index) =>
      this.createSampler(undefined, index),
    );
  }

  setTextures(
    textures: readonly NexusTextureSource[] | undefined,
    onChanged: () => void,
  ) {
    const normalizedTextures = Array.from({ length: MAX_SCENE_TEXTURES }, (_value, index) =>
      normalizeTextureSource(textures?.[index]),
    );
    const textureSignature = JSON.stringify(normalizedTextures);

    if (this.textureSignature === textureSignature) {
      return;
    }

    this.textureSignature = textureSignature;
    const generation = ++this.loadGeneration;
    this.samplerSlots = normalizedTextures.map((source, index) => this.createSampler(source, index));
    this.replaceTextureSlots(Array.from({ length: MAX_SCENE_TEXTURES }, () => this.fallbackTexture));
    onChanged();

    void Promise.all(
      normalizedTextures.map((source, index) =>
        source.src
          ? loadTexture(this.device, source.src, source.crossOrigin)
              .then((texture): TextureLoadResult => ({ index, texture }))
              .catch((reason: unknown) => {
                console.warn("[NexusGPU] Failed to load texture", source.src, reason);
                return null;
              })
          : null,
      ),
    ).then((results) => {
      if (this.destroyed || generation !== this.loadGeneration) {
        for (const result of results) {
          result?.texture.destroy();
        }
        return;
      }

      const loadedTextureSlots = Array.from({ length: MAX_SCENE_TEXTURES }, (_value, index) => {
        const result = results.find((candidate) => candidate?.index === index);
        return result?.texture ?? this.fallbackTexture;
      });
      this.replaceTextureSlots(loadedTextureSlots);
      onChanged();
    });
  }

  createBindGroupEntries(): GPUBindGroupEntry[] {
    return [
      ...this.samplerSlots.map((sampler, index) => ({
        binding: SCENE_SAMPLER_BINDING_START + index,
        resource: sampler,
      })),
      ...this.textureSlots.map((texture, index) => ({
        binding: SCENE_TEXTURE_BINDING_START + index,
        resource: texture.createView(),
      })),
    ];
  }

  destroy() {
    this.destroyed = true;
    this.loadGeneration += 1;
    this.destroyTextureSlots();
    this.fallbackTexture.destroy();
  }

  private createSampler(source: NormalizedTextureSource | undefined, index: number) {
    return this.device.createSampler({
      label: `NexusGPU Texture Sampler ${index}`,
      addressModeU: source?.addressModeU ?? "repeat",
      addressModeV: source?.addressModeV ?? "repeat",
      addressModeW: source?.addressModeW ?? "repeat",
      magFilter: source?.magFilter ?? "linear",
      minFilter: source?.minFilter ?? "linear",
      mipmapFilter: source?.mipmapFilter ?? "linear",
      lodMinClamp: source?.lodMinClamp,
      lodMaxClamp: source?.lodMaxClamp,
      maxAnisotropy: source?.maxAnisotropy,
    });
  }

  private replaceTextureSlots(nextTextureSlots: GPUTexture[]) {
    this.destroyTextureSlots();
    this.textureSlots = nextTextureSlots;
  }

  private destroyTextureSlots() {
    for (const texture of this.textureSlots) {
      if (texture !== this.fallbackTexture) {
        texture.destroy();
      }
    }
  }
}

function normalizeTextureSource(source: NexusTextureSource | undefined): NormalizedTextureSource {
  if (!source) {
    return { src: "" };
  }

  if (typeof source === "string") {
    return { src: source };
  }

  return {
    src: source.src,
    crossOrigin: source.crossOrigin,
    addressModeU: source.addressModeU,
    addressModeV: source.addressModeV,
    addressModeW: source.addressModeW,
    magFilter: source.magFilter,
    minFilter: source.minFilter,
    mipmapFilter: source.mipmapFilter,
    lodMinClamp: source.lodMinClamp,
    lodMaxClamp: source.lodMaxClamp,
    maxAnisotropy: source.maxAnisotropy,
  };
}

async function loadTexture(
  device: GPUDevice,
  src: string,
  crossOrigin: HTMLImageElement["crossOrigin"] | undefined,
) {
  const image = new Image();
  if (crossOrigin !== undefined) {
    image.crossOrigin = crossOrigin;
  }

  image.src = src;
  await image.decode();

  const bitmap = await createImageBitmap(image);
  const texture = device.createTexture({
    label: `NexusGPU Texture ${src}`,
    size: [bitmap.width, bitmap.height, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    { width: bitmap.width, height: bitmap.height },
  );
  bitmap.close();

  return texture;
}

function createFallbackTexture(device: GPUDevice) {
  const texture = device.createTexture({
    label: "NexusGPU Fallback Texture",
    size: [1, 1, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.writeTexture(
    { texture },
    new Uint8Array([255, 255, 255, 255]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    { width: 1, height: 1 },
  );

  return texture;
}
