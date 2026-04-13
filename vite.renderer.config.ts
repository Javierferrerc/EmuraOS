import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: "src/electron/renderer",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(".vite", "renderer", "main_window"),
    emptyOutDir: true,
  },
});
