import { defineConfig } from "vite";
import { writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

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
  define: {
    "process.env.GDRIVE_API_KEY": JSON.stringify(process.env.GDRIVE_API_KEY ?? ""),
    "process.env.GDRIVE_ROOT_FOLDER_ID": JSON.stringify(process.env.GDRIVE_ROOT_FOLDER_ID ?? ""),
  },
  build: {
    rollupOptions: {
      // sharp ships platform-specific .node native addons; bundling it
      // through rollup/commonjs breaks its dynamic require of those
      // binaries at runtime. Keep it external so Node loads it straight
      // from node_modules at startup. Same reasoning as koffi.
      external: ["electron", "koffi", "sharp"],
    },
  },
});
