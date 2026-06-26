import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir:   "dist-electron",
            sourcemap: true,
            rollupOptions: { external: ["electron", "node-pty"] },
          },
        },
      },
      {
        entry: "electron/preload-memex.ts",
        vite: {
          build: {
            outDir:   "dist-electron",
            sourcemap: true,
            lib: { formats: ["cjs"] },
            rollupOptions: { external: ["electron"] },
          },
        },
      },
      {
        entry: "electron/preload-quick.ts",
        vite: {
          build: {
            outDir:   "dist-electron",
            sourcemap: true,
            lib: { formats: ["cjs"] },
            rollupOptions: { external: ["electron"] },
          },
        },
      },
    ]),
    renderer(),
  ],

  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
  },

  build: {
    outDir: "dist",
  },
});
