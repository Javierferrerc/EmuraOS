import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { cpSync, writeFileSync } from "node:fs";
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
    // electron-updater reads `resources/app-update.yml` at runtime to know
    // which GitHub repo to poll. electron-builder normally writes it in its
    // onAfterPack hook — but we build the installer with `--prepackaged`,
    // which skips packing, so that hook never fires. Write it ourselves into
    // the packaged resources dir (sibling of app.asar) so the updater is
    // configured. Must stay in sync with the `publish` block in
    // electron-builder.yml.
    postPackage: async (_config, { outputPaths }) => {
      const appUpdateYml = [
        "provider: github",
        "owner: Javierferrerc",
        "repo: EmuraOS",
        "updaterCacheDirName: emuraos-updater",
        "",
      ].join("\n");
      for (const outputPath of outputPaths) {
        writeFileSync(
          path.join(outputPath, "resources", "app-update.yml"),
          appUpdateYml
        );
      }
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
