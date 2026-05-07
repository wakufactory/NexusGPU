import { transform } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function normalizePath(id: string): string {
  return id.replaceAll("\\", "/");
}

function minifyNonSceneChunks(): Plugin {
  return {
    name: "minify-non-scene-chunks",
    async generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "chunk") {
          continue;
        }

        const isSceneChunk = Object.keys(asset.modules).some((id) => normalizePath(id).includes("/src/scenes/"));

        if (isSceneChunk) {
          continue;
        }

        const result = await transform(asset.code, {
          format: "esm",
          minify: true,
          sourcemap: false,
          target: "es2020",
        });

        asset.code = result.code;
      }
    },
  };
}

type SceneJsonConfig = {
  id: string;
  title: string;
  description: string;
  module: string;
};

const virtualSceneRegistryId = "virtual:nexusgpu-scene-registry";
const resolvedVirtualSceneRegistryId = `\0${virtualSceneRegistryId}`;

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getSingleSceneConfig(): SceneJsonConfig {
  const sceneId = process.env.VITE_NEXUSGPU_SCENE_ID?.trim();

  if (!sceneId) {
    throw new Error("VITE_NEXUSGPU_SCENE_ID is required for single-scene builds.");
  }

  const scenes = JSON.parse(
    readFileSync(resolve("src/scenes/scenes.json"), "utf8"),
  ) as SceneJsonConfig[];
  const scene = scenes.find((config) => config.id === sceneId);

  if (!scene) {
    throw new Error(`VITE_NEXUSGPU_SCENE_ID does not match any scene: ${sceneId}`);
  }

  return scene;
}

function sceneRegistryPlugin(mode: string): Plugin {
  return {
    name: "nexusgpu-scene-registry",
    resolveId(id) {
      return id === virtualSceneRegistryId ? resolvedVirtualSceneRegistryId : null;
    },
    load(id) {
      if (id !== resolvedVirtualSceneRegistryId) {
        return null;
      }

      if (mode !== "single-scene") {
        return `export { DEFAULT_SCENE_ID, SCENES, getSceneDefinition } from "/src/scenes/registry.ts";`;
      }

      const scene = getSingleSceneConfig();

      return `
        import * as sceneModule from ${jsonString(`/src/scenes/${scene.module.replace(/^\.\//, "")}`)};

        if (!sceneModule.Scene) {
          throw new Error(${jsonString(`${scene.id}.module must export a Scene component.`)});
        }

        function resolveParameterControls(initialParameters) {
          return (sceneModule.parameterControls ?? []).map((control) => {
            if (!(control.key in initialParameters)) {
              throw new Error(
                ${jsonString(`${scene.id}.parameterControls.`)} + control.key + " is missing from initialParameters.",
              );
            }

            if (typeof initialParameters[control.key] !== "number") {
              throw new Error(
                ${jsonString(`${scene.id}.parameterControls.`)} + control.key + " must point to a number parameter.",
              );
            }

            return control;
          });
        }

        const initialParameters = sceneModule.initialParameters ?? {};
        const scene = {
          id: ${jsonString(scene.id)},
          title: ${jsonString(scene.title)},
          description: ${jsonString(scene.description)},
          initialParameters,
          parameterControls: resolveParameterControls(initialParameters),
          Component: sceneModule.Scene,
        };

        export const SCENES = [scene];
        export const DEFAULT_SCENE_ID = scene.id;
        export function getSceneDefinition() {
          return scene;
        }
      `;
    },
    transformIndexHtml(html) {
      if (mode !== "single-scene") {
        return html;
      }

      const scene = getSingleSceneConfig();
      return html.replace(/<title>.*?<\/title>/, `<title>${escapeHtmlText(scene.title)}</title>`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    minify: false,
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = normalizePath(id);

          if (normalizedId.includes("/node_modules/")) {
            return "vendor";
          }

          if (normalizedId.includes("/src/nexusgpu/")) {
            return "nexusgpu";
          }

          if (normalizedId.includes("/src/scenes/")) {
            return "scenes";
          }
        },
      },
    },
  },
  plugins: [sceneRegistryPlugin(mode), minifyNonSceneChunks()],
}));
