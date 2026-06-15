import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The renderer `root` is src/electron/renderer, so Vite would look for .env
// there by default. Point envDir at the project root (where this config and the
// real .env live) so VITE_* vars (e.g. Supabase) reach the renderer. Only
// VITE_-prefixed vars are exposed to the client; other secrets stay server-side.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "src/electron/renderer",
  envDir: projectRoot,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(".vite", "renderer", "main_window"),
    emptyOutDir: true,
  },
});
