import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { inflateRawSync } from "node:zlib";
import type {
  DetectedEmulator,
  EmulatorDefinition,
  CoreDownloadProgress,
  ReadinessReport,
  EmulatorReadinessResult,
} from "./types.js";

export class EmulatorReadiness {
  /**
   * Validate detected emulators and auto-download missing RetroArch cores.
   * Standalone emulators are marked ready immediately.
   */
  async validateAndFix(
    detected: DetectedEmulator[],
    emulatorDefs: EmulatorDefinition[],
    onProgress?: (progress: CoreDownloadProgress) => void
  ): Promise<ReadinessReport> {
    const results: EmulatorReadinessResult[] = [];
    let totalFixed = 0;
    let totalErrors = 0;

    for (const emu of detected) {
      const def = emulatorDefs.find((d) => d.id === emu.id);
      if (!def || !def.coreUrls || Object.keys(def.coreUrls).length === 0) {
        // Standalone emulator — already self-sufficient
        results.push({
          emulatorId: emu.id,
          isReady: true,
          issues: [],
          fixed: [],
          errors: [],
        });
        continue;
      }

      const result = await this.validateEmulator(
        emu,
        def,
        onProgress
      );
      totalFixed += result.fixed.length;
      totalErrors += result.errors.length;
      results.push(result);
    }

    return { results, totalFixed, totalErrors };
  }

  private async validateEmulator(
    emu: DetectedEmulator,
    def: EmulatorDefinition,
    onProgress?: (progress: CoreDownloadProgress) => void
  ): Promise<EmulatorReadinessResult> {
    const coreUrls = def.coreUrls!;
    const emuDir = dirname(emu.executablePath);
    const issues: string[] = [];
    const fixed: string[] = [];
    const errors: string[] = [];

    // Deduplicate: multiple systems may share the same core DLL
    const uniqueCores = Object.entries(coreUrls);
    const total = uniqueCores.length;
    let current = 0;

    for (const [corePath, url] of uniqueCores) {
      current++;
      const absoluteCorePath = resolve(emuDir, corePath);
      const coreName = basename(corePath, ".dll").replace("_libretro", "");

      if (existsSync(absoluteCorePath)) {
        onProgress?.({
          current,
          total,
          coreName,
          status: "already_installed",
        });
        continue;
      }

      // Core is missing — attempt download
      issues.push(`Missing core: ${corePath}`);
      onProgress?.({
        current,
        total,
        coreName,
        status: "downloading",
      });

      try {
        const dllBuffer = await this.downloadAndExtractCore(url);

        // Ensure the cores directory exists
        mkdirSync(dirname(absoluteCorePath), { recursive: true });
        writeFileSync(absoluteCorePath, dllBuffer);

        fixed.push(corePath);
        onProgress?.({
          current,
          total,
          coreName,
          status: "installed",
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : String(err);
        errors.push(`${corePath}: ${msg}`);
        onProgress?.({
          current,
          total,
          coreName,
          status: "error",
        });
      }
    }

    return {
      emulatorId: emu.id,
      isReady: errors.length === 0,
      issues,
      fixed,
      errors,
    };
  }

  /**
   * Download a .dll.zip from the libretro buildbot and extract the DLL.
   * ZIP format: the DLL is the only (or first) file entry in a standard ZIP.
   */
  private async downloadAndExtractCore(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
    }

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    return this.extractDllFromZip(zipBuffer);
  }

  /**
   * Minimal ZIP extraction — reads the first file entry from a ZIP buffer.
   * Libretro buildbot ZIPs contain a single stored (uncompressed) or deflated DLL.
   * We use Node's built-in zlib for deflate decompression.
   */
  private extractDllFromZip(zipBuffer: Buffer): Buffer {
    // ZIP local file header signature: PK\x03\x04
    if (
      zipBuffer.length < 30 ||
      zipBuffer[0] !== 0x50 ||
      zipBuffer[1] !== 0x4b ||
      zipBuffer[2] !== 0x03 ||
      zipBuffer[3] !== 0x04
    ) {
      throw new Error("Invalid ZIP file");
    }

    const compressionMethod = zipBuffer.readUInt16LE(8);
    const compressedSize = zipBuffer.readUInt32LE(18);
    const fileNameLength = zipBuffer.readUInt16LE(26);
    const extraFieldLength = zipBuffer.readUInt16LE(28);
    const dataOffset = 30 + fileNameLength + extraFieldLength;

    const compressedData = zipBuffer.subarray(
      dataOffset,
      dataOffset + compressedSize
    );

    if (compressionMethod === 0) {
      // Stored (no compression)
      return Buffer.from(compressedData);
    } else if (compressionMethod === 8) {
      // Deflate
      return Buffer.from(inflateRawSync(compressedData));
    } else {
      throw new Error(
        `Unsupported ZIP compression method: ${compressionMethod}`
      );
    }
  }
}
