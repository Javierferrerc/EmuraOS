import { defineConfig } from "vite";
import { writeFileSync } from "node:fs";
import path from "node:path";

// The Forge Vite plugin hardcodes CJS output with .js extension.
// Since package.json has "type": "module", Node treats .js as ESM.
// This plugin writes a package.json with "type": "commonjs" to the
// output directory so Node treats the built .js files as CJS.
const cjsPackageJson = {
  name: "cjs-package-json",
  closeBundle() {
    const outDir = path.resolve(".vite", "build");
    writeFileSync(
      path.join(outDir, "package.json"),
      JSON.stringify({ type: "commonjs" })
    );
  },
};

export default defineConfig({
  resolve: {
    conditions: ["node"],
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
  plugins: [cjsPackageJson],
  build: {
    rollupOptions: {
      external: ["electron", "koffi"],
    },
  },
});
