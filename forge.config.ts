import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    asar: { unpack: "**/node_modules/koffi/**" },
    extraResource: ["src/data"],
  },
  makers: [
    new MakerSquirrel({ name: "emuraos" }),
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
