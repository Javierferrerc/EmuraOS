import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type {
  EmulatorConfigSchema,
  EmulatorConfigData,
} from "./types.js";
import {
  parseIni,
  serializeIni,
  flattenIni,
  unflattenIni,
  parseKeyValue,
  serializeKeyValue,
  parseXml,
  serializeXml,
  parseYaml,
  serializeYaml,
} from "./config-parsers.js";

export class EmulatorConfigManager {
  private schemasDir: string;
  private schemaCache = new Map<string, EmulatorConfigSchema>();

  constructor(schemasDir: string) {
    this.schemasDir = schemasDir;
  }

  /** Load the JSON schema for an emulator. Falls back to generic.json. */
  getSchema(emulatorId: string): EmulatorConfigSchema {
    if (this.schemaCache.has(emulatorId)) {
      return this.schemaCache.get(emulatorId)!;
    }

    let schemaPath = path.join(this.schemasDir, `${emulatorId}.json`);
    if (!existsSync(schemaPath)) {
      schemaPath = path.join(this.schemasDir, "generic.json");
    }

    const schema: EmulatorConfigSchema = JSON.parse(
      readFileSync(schemaPath, "utf-8")
    );
    this.schemaCache.set(emulatorId, schema);
    return schema;
  }

  /** Resolve the config file path for an emulator. */
  getConfigPath(
    emulatorId: string,
    executablePath?: string
  ): string | null {
    const schema = this.getSchema(emulatorId);
    const appdata = process.env.APPDATA || "";
    const docs =
      process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "Documents")
        : "";
    const emuDir = executablePath ? path.dirname(executablePath) : "";

    for (const locationTemplate of schema.configLocations) {
      const resolved = locationTemplate
        .replace(/\{emuDir\}/g, emuDir)
        .replace(/\{appdata\}/g, appdata)
        .replace(/\{docs\}/g, docs);

      if (resolved && existsSync(resolved)) {
        return resolved;
      }
    }

    // Return the first template expanded (even if it doesn't exist yet)
    // so the UI can show where the file would be
    if (schema.configLocations.length > 0) {
      const first = schema.configLocations[0]
        .replace(/\{emuDir\}/g, emuDir)
        .replace(/\{appdata\}/g, appdata)
        .replace(/\{docs\}/g, docs);
      if (first && !first.includes("{")) return first;
    }

    return null;
  }

  /** Read the config file and return parsed settings + schema. */
  read(emulatorId: string, executablePath?: string): EmulatorConfigData {
    const schema = this.getSchema(emulatorId);
    const configPath = this.getConfigPath(emulatorId, executablePath);
    let settings: Record<string, string> = {};

    if (configPath && existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      settings = this.parseContent(content, schema.configFormat);
    }

    return {
      emulatorId,
      configPath,
      settings,
      schema,
    };
  }

  /** Write changed settings back to the config file. */
  write(
    emulatorId: string,
    changes: Record<string, string>,
    executablePath?: string
  ): void {
    const schema = this.getSchema(emulatorId);
    const configPath = this.getConfigPath(emulatorId, executablePath);
    if (!configPath) {
      throw new Error(
        `Cannot determine config path for emulator "${emulatorId}"`
      );
    }

    let existingContent = "";
    let existingSettings: Record<string, string> = {};

    if (existsSync(configPath)) {
      existingContent = readFileSync(configPath, "utf-8");
      existingSettings = this.parseContent(
        existingContent,
        schema.configFormat
      );
    }

    // Merge changes into existing settings
    const merged = { ...existingSettings, ...changes };
    const serialized = this.serializeContent(
      merged,
      schema.configFormat,
      existingContent
    );

    writeFileSync(configPath, serialized, "utf-8");
  }

  /** List emulator IDs that have dedicated schemas (not generic). */
  getAvailableSchemas(): string[] {
    return readdirSync(this.schemasDir)
      .filter((f) => f.endsWith(".json") && f !== "generic.json")
      .map((f) => f.replace(".json", ""));
  }

  private parseContent(
    content: string,
    format: EmulatorConfigSchema["configFormat"]
  ): Record<string, string> {
    switch (format) {
      case "ini":
        return flattenIni(parseIni(content));
      case "keyvalue":
        return parseKeyValue(content);
      case "json": {
        const obj = JSON.parse(content);
        return this.flattenJson(obj);
      }
      case "yaml":
        return parseYaml(content);
      case "xml":
        return parseXml(content);
      default:
        return parseKeyValue(content);
    }
  }

  private serializeContent(
    data: Record<string, string>,
    format: EmulatorConfigSchema["configFormat"],
    originalContent: string
  ): string {
    switch (format) {
      case "ini":
        return serializeIni(unflattenIni(data));
      case "keyvalue":
        return serializeKeyValue(data);
      case "json": {
        // Try to preserve original JSON structure
        let obj: Record<string, unknown> = {};
        if (originalContent) {
          try {
            obj = JSON.parse(originalContent);
          } catch {
            // start fresh
          }
        }
        this.applyFlatToJson(obj, data);
        return JSON.stringify(obj, null, 2) + "\n";
      }
      case "yaml":
        return serializeYaml(data, originalContent || "");
      case "xml":
        return serializeXml(data, originalContent || "");
      default:
        return serializeKeyValue(data);
    }
  }

  /** Flatten a nested JSON object to dot-notation keys. */
  private flattenJson(
    obj: unknown,
    prefix = ""
  ): Record<string, string> {
    const result: Record<string, string> = {};
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(
        obj as Record<string, unknown>
      )) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          Object.assign(result, this.flattenJson(value, fullKey));
        } else {
          result[fullKey] = String(value);
        }
      }
    }
    return result;
  }

  /** Apply flat dot-notation keys back to a nested JSON object. */
  private applyFlatToJson(
    obj: Record<string, unknown>,
    flat: Record<string, string>
  ): void {
    for (const [flatKey, value] of Object.entries(flat)) {
      const parts = flatKey.split(".");
      let current: Record<string, unknown> = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (
          !current[parts[i]] ||
          typeof current[parts[i]] !== "object"
        ) {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      // Try to preserve original types
      const lastKey = parts[parts.length - 1];
      const original = current[lastKey];
      if (typeof original === "boolean") {
        current[lastKey] = value === "true";
      } else if (typeof original === "number") {
        current[lastKey] = Number(value);
      } else {
        current[lastKey] = value;
      }
    }
  }
}
