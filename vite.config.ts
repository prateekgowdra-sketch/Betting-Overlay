import { build as esbuildBuild } from "esbuild";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "";

function contentScriptBundlePlugin(): Plugin {
  return {
    name: "content-script-bundle",
    apply: "build",
    async closeBundle() {
      await esbuildBuild({
        absWorkingDir: rootDir,
        entryPoints: [resolve(rootDir, "src/content/index.tsx")],
        outfile: resolve(rootDir, "dist/assets/content.js"),
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["chrome114"],
        jsx: "automatic",
        loader: {
          ".css": "text"
        },
        define: {
          __API_BASE_URL__: JSON.stringify(apiBaseUrl)
        },
        minify: true
      });
    }
  };
}

export default defineConfig({
  define: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl)
  },
  plugins: [react(), contentScriptBundlePlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "popup.html"),
        background: resolve(rootDir, "src/background/index.ts")
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "assets/background.js";
          }

          return "assets/[name].js";
        }
      }
    }
  }
});
