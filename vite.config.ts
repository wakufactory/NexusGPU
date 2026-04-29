import { transform } from "esbuild";
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

export default defineConfig({
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
  plugins: [minifyNonSceneChunks()],
});
