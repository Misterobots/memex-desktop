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
    // Web mode (runtime-urls.ts) calls same-origin /v1 and /api paths,
    // assuming a reverse proxy in front of production. The bare dev server
    // has none, so proxy those prefixes straight to the local runtime
    // (Agent_Swarm, port 8008) for `npm run dev` testing.  Keeping the
    // artifact route on that same runtime matters: generated media belongs
    // to its delivered_artifacts directory rather than Vite's static root.
    proxy: {
      "/delivered_artifacts": { target: "http://localhost:8008" },
      // TESTING ONLY: injects the identity header Traefik's Authentik
      // forwardAuth middleware would normally add in prod, so owner-scoped
      // routes (_resolve_owner_id) resolve correctly against the bare dev
      // server. Remove or parameterize before relying on this beyond a
      // single-user local test session.
      "/v1": {
        target: "http://localhost:8008",
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("X-authentik-username", "misterobots"));
        },
      },
      "/api": {
        target: "http://localhost:8008",
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => proxyReq.setHeader("X-authentik-username", "misterobots"));
        },
      },
      "/ollama": { target: "http://localhost:11434", rewrite: (p) => p.replace(/^\/ollama/, "") },
    },
  },

  build: {
    outDir: "dist",
  },
});
