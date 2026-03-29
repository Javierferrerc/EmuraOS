import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SystemDefinition } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SystemsRegistry {
  private systems: SystemDefinition[] = [];

  constructor(customPath?: string) {
    const projectRoot = resolve(__dirname, "..", "..");
    const dataPath =
      customPath ?? resolve(projectRoot, "src", "data", "systems.json");
    const raw = readFileSync(dataPath, "utf-8");
    this.systems = JSON.parse(raw) as SystemDefinition[];
  }

  getAll(): SystemDefinition[] {
    return this.systems;
  }

  getById(id: string): SystemDefinition | undefined {
    return this.systems.find((s) => s.id === id);
  }

  getByExtension(ext: string): SystemDefinition[] {
    const lower = ext.toLowerCase();
    return this.systems.filter((s) => s.extensions.includes(lower));
  }

  getIds(): string[] {
    return this.systems.map((s) => s.id);
  }
}
