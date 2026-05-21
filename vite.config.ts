import { transform } from "esbuild";
import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function normalizePath(id: string): string {
  return id.replaceAll("\\", "/");
}

function isSceneModuleId(id: string): boolean {
  const normalizedId = normalizePath(id);
  return normalizedId.includes("/src/demo/scenes/") || /\/src\/apps\/[^/]+\/scenes\//.test(normalizedId);
}

function minifyNonSceneChunks(): Plugin {
  return {
    name: "minify-non-scene-chunks",
    async generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "chunk") {
          continue;
        }

        const isSceneChunk = Object.keys(asset.modules).some(isSceneModuleId);

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

function publicAssetsPlugin(): Plugin {
  const publicDir = resolve("public");
  let isBuild = false;

  function collectPublicFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const filePath = resolve(dir, entry.name);
      return entry.isDirectory() ? collectPublicFiles(filePath) : [filePath];
    });
  }

  function getPublicFile(relativePath: string): string | undefined {
    const filePath = resolve(publicDir, relativePath);
    const publicRelativePath = relative(publicDir, filePath);

    if (publicRelativePath.startsWith("..")) {
      return undefined;
    }

    try {
      return statSync(filePath).isFile() ? filePath : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    name: "nexusgpu-public-assets",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    buildStart() {
      if (!isBuild) {
        return;
      }

      for (const filePath of collectPublicFiles(publicDir)) {
        const fileName = relative(publicDir, filePath).replaceAll("\\", "/");
        this.emitFile({
          type: "asset",
          fileName: `assets/${fileName}`,
          source: readFileSync(filePath),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url ?? "/";
        const pathname = new URL(requestUrl, "http://localhost").pathname;

        if (!pathname.startsWith("/assets/")) {
          next();
          return;
        }

        const relativePath = decodeURIComponent(pathname.slice("/assets/".length));
        const filePath = getPublicFile(relativePath);

        if (!filePath) {
          next();
          return;
        }

        createReadStream(filePath).pipe(response);
      });
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
    readFileSync(resolve("src/demo/scenes/scenes.json"), "utf8"),
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
        return `export { DEFAULT_SCENE_ID, SCENES, getSceneDefinition } from "/src/demo/scenes/registry.ts";`;
      }

      const scene = getSingleSceneConfig();

      return `
        import * as sceneModule from ${jsonString(`/src/demo/scenes/${scene.module.replace(/^\.\//, "")}`)};

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
        const initialRenderSettingsKey = "initial" + "RenderSettings";
        const initialRenderSettings = sceneModule[initialRenderSettingsKey];
        const scene = {
          id: ${jsonString(scene.id)},
          title: ${jsonString(scene.title)},
          description: ${jsonString(scene.description)},
          initialParameters,
          initialRenderSettings,
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

function getBuildInput(mode: string): string | undefined {
  if (mode === "my-demo") {
    return resolve("my-demo.html");
  }

  if (mode === "sdfmap") {
    return resolve("sdfmap.html");
  }

  return undefined;
}

export default defineConfig(({ mode }) => ({
  base: "./",
  publicDir: false,
  build: {
    minify: false,
    cssMinify: true,
    rollupOptions: {
      input: getBuildInput(mode),
      output: {
        manualChunks(id) {
          const normalizedId = normalizePath(id);

          if (normalizedId.includes("/node_modules/")) {
            return "vendor";
          }

          if (normalizedId.includes("/src/nexusgpu/")) {
            return "nexusgpu";
          }

          if (isSceneModuleId(normalizedId)) {
            return "scenes";
          }
        },
      },
    },
  },
  plugins: [sceneRegistryPlugin(mode), publicAssetsPlugin(), minifyNonSceneChunks()],
}));
