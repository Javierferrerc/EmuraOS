import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { cpSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

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
      // Never bundle local env files into the asar. VITE_ vars are already
      // inlined at build time, so the raw .env is not needed at runtime.
      /^\/\.env($|\.)/,
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
        // On macOS the resources dir lives inside the .app bundle.
        const macAppName = readdirSync(outputPath).find((f) =>
          f.endsWith(".app")
        );
        const resourcesDir = macAppName
          ? path.join(outputPath, macAppName, "Contents", "Resources")
          : path.join(outputPath, "resources");
        writeFileSync(path.join(resourcesDir, "app-update.yml"), appUpdateYml);

        // Harden the packaged Electron binary via fuses (build-time flags that
        // can't be toggled at runtime). We flip them here rather than via
        // @electron-forge/plugin-fuses because that plugin isn't installed; the
        // @electron/fuses runtime ships transitively.
        //   - RunAsNode / EnableNodeCliInspectArguments / NodeOptions env:
        //     off → the binary can't be coerced into a general-purpose Node
        //     process (ELECTRON_RUN_AS_NODE, --inspect, NODE_OPTIONS).
        //   - OnlyLoadAppFromAsar: on → refuse to run app code from outside the
        //     packaged asar.
        //   - EnableCookieEncryption: on → encrypt the cookie store at rest.
        // NOTE: EnableEmbeddedAsarIntegrityValidation is intentionally left off
        // until code signing lands — enabling it without a proper
        // signed/integrity-injected build can prevent the app from starting.
        //
        // The Electron binary to flip differs per OS:
        //   win32:  <out>/<name>.exe
        //   darwin: <out>/<name>.app  (flipFuses accepts the bundle path)
        //   linux:  <out>/<name>     (extensionless executable)
        let fuseTarget: string | null = null;
        if (macAppName) {
          fuseTarget = path.join(outputPath, macAppName);
        } else {
          const exeName = readdirSync(outputPath).find((f) => {
            const full = path.join(outputPath, f);
            if (!statSync(full).isFile()) return false;
            if (f.toLowerCase().endsWith(".exe")) return true;
            // Linux: the executable is the package name with no extension.
            return f === "emuraos";
          });
          if (exeName) fuseTarget = path.join(outputPath, exeName);
        }
        if (fuseTarget) {
          await flipFuses(fuseTarget, {
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
            [FuseV1Options.EnableCookieEncryption]: true,
          });
        }
      }
    },
  },
  makers: [
    new MakerZIP({}, ["win32", "darwin", "linux"]),
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
