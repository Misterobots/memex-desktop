import { defineConfig } from "vite";
import electron from "vite-plugin-electron";

/**
 * Memex Desktop — Claude Desktop architecture.
 *
 * The renderer is a minimal local shell (index.html / quick.html) that
 * provides the native title-bar drag region and error overlay.
 * All real UI is loaded by the WebContentsView from http://192.168.2.101:3300.
 *
 * No React renderer build needed — vite only compiles the Electron processes.
 */
export default defineConfig({
  plugins: [
    electron([
      {
        // Main process
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir:   "dist-electron",
            sourcemap: true,
            rollupOptions: {
              external: ["electron", "node-pty"],
            },
          },
        },
      },
      {
        // Local shell preload
        entry: "electron/preload.ts",
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
        // Memex WebContentsView preload (window.memex bridge)
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
        // Quick entry window preload
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
  ],

  server: {
    host: "0.0.0.0",
    port: 5173,
  },

  build: {
    outDir:        "dist",
    rollupOptions: { input: { main: "index.html" } },
  },
});
