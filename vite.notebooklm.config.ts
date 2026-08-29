import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: { host: "127.0.0.1", port: 5175 },
  build: { outDir: "dist-notebooklm", emptyOutDir: true },
});
