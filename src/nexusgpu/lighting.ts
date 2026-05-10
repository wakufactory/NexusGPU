import { DEFAULT_LIGHTING } from "./defaults";
import type { NexusLight, NexusLighting, ResolvedNexusLight, ResolvedNexusLighting } from "./types";

const LIGHT_TYPE_IDS = {
  directional: 0,
  point: 1,
  spot: 2,
} satisfies Record<ResolvedNexusLight["type"], number>;

export function resolveLighting(lighting: NexusLighting | undefined): ResolvedNexusLighting {
  const sourceLights = lighting?.lights && lighting.lights.length > 0 ? lighting.lights : [lighting];
  const lights = sourceLights.map((light) => resolveLight(light, lighting));
  const mainLight = lights[0] ?? DEFAULT_LIGHTING.mainLight;

  return {
    lights,
    mainLight,
    type: mainLight.type,
    direction: mainLight.direction,
    color: mainLight.color,
    intensity: mainLight.intensity,
  };
}

export function getLightTypeId(type: ResolvedNexusLight["type"]) {
  return LIGHT_TYPE_IDS[type];
}

function resolveLight(light: NexusLight | undefined, fallback: NexusLighting | undefined): ResolvedNexusLight {
  const defaultLight = DEFAULT_LIGHTING.mainLight;

  return {
    type: light?.type ?? fallback?.type ?? defaultLight.type,
    direction: light?.direction ?? fallback?.direction ?? defaultLight.direction,
    position: light?.position ?? fallback?.position ?? defaultLight.position,
    color: light?.color ?? fallback?.color ?? defaultLight.color,
    intensity: light?.intensity ?? fallback?.intensity ?? defaultLight.intensity,
    range: light?.range ?? fallback?.range ?? defaultLight.range,
  };
}
