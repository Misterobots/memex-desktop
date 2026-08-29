import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

/** Renderer-only config for the experimental Hero Badge Lab. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
  build: {
    outDir: "dist-hero-badges",
    emptyOutDir: true,
  },
});
