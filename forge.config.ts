import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { cpSync } from "node:fs";
import path from "node:path";

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack:
        "{**/node_modules/koffi/**,**/node_modules/sharp/**,**/node_modules/@img/**}",
    },
    extraResource: ["src/data"],
    icon: "assets/icon",
    ignore: [
      /^\/config($|\/)/,
      /^\/roms($|\/)/,
      /^\/out($|\/)/,
      /^\/scripts($|\/)/,
      /^\/assets\/installer($|\/)/,
      /^\/electron-builder\.yml$/,
    ],
  },
  hooks: {
    // The Vite plugin only includes bundled output in the asar — native
    // modules marked as `external` are left out. Copy them into the
    // packaged app so `require()` resolves at runtime. sharp also needs
    // its platform package under @img (contains the .node + libvips DLLs).
    packageAfterCopy: async (_config, buildPath) => {
      const copyDir = (rel: string) => {
        cpSync(
          path.resolve(rel),
          path.join(buildPath, rel),
          { recursive: true }
        );
      };
      copyDir("node_modules/koffi");
      copyDir("node_modules/sharp");
      copyDir("node_modules/@img");
    },
  },
  makers: [
    new MakerZIP({}, ["win32"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/electron/main/index.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/electron/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
