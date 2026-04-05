/**
 * Parsers and serializers for emulator config file formats:
 * INI, key=value, XML, JSON (built-in), YAML (simple line-based).
 */

// ── INI format (sections + key=value) ──────────────────────────────

export interface IniData {
  [section: string]: Record<string, string>;
}

export function parseIni(content: string): IniData {
  const result: IniData = {};
  let currentSection = "__global__";
  result[currentSection] = {};

  // Strip UTF-8 BOM — PPSSPP and some Windows apps write ini files with
  // a leading BOM that otherwise breaks section-header detection on line 1.
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  for (const rawLine of stripped.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[currentSection][key] = value;
    }
  }

  return result;
}

export function serializeIni(data: IniData): string {
  const lines: string[] = [];

  // Global keys first (no section header)
  if (data["__global__"]) {
    for (const [key, value] of Object.entries(data["__global__"])) {
      lines.push(`${key} = ${value}`);
    }
    if (Object.keys(data["__global__"]).length > 0) lines.push("");
  }

  for (const [section, entries] of Object.entries(data)) {
    if (section === "__global__") continue;
    lines.push(`[${section}]`);
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${key} = ${value}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Flatten an INI structure to a flat Record using "Section.Key" notation */
export function flattenIni(data: IniData): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [section, entries] of Object.entries(data)) {
    for (const [key, value] of Object.entries(entries)) {
      const flatKey =
        section === "__global__" ? key : `${section}.${key}`;
      flat[flatKey] = value;
    }
  }
  return flat;
}

/** Unflatten "Section.Key" notation back to IniData */
export function unflattenIni(flat: Record<string, string>): IniData {
  const data: IniData = {};
  for (const [flatKey, value] of Object.entries(flat)) {
    const dotIndex = flatKey.indexOf(".");
    let section: string;
    let key: string;
    if (dotIndex > 0) {
      section = flatKey.slice(0, dotIndex);
      key = flatKey.slice(dotIndex + 1);
    } else {
      section = "__global__";
      key = flatKey;
    }
    if (!data[section]) data[section] = {};
    data[section][key] = value;
  }
  return data;
}

// ── Flat key=value format (RetroArch, Snes9x, Project64) ──────────

export function parseKeyValue(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  for (const rawLine of stripped.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }

  return result;
}

export function serializeKeyValue(data: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key} = "${value}"`);
  }
  return lines.join("\n") + "\n";
}

// ── XML format (simple flat extraction for Cemu-style configs) ─────

export function parseXml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match simple <Tag>value</Tag> patterns
  const regex = /<(\w+)>([^<]*)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    result[match[1]] = match[2].trim();
  }
  return result;
}

export function serializeXml(
  data: Record<string, string>,
  originalContent: string
): string {
  let updated = originalContent;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`(<${key}>)[^<]*(</${key}>)`, "g");
    updated = updated.replace(regex, `$1${value}$2`);
  }
  return updated;
}

// ── YAML format (simple line-based for RPCS3-style flat configs) ───

export function parseYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  for (const rawLine of stripped.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }

  return result;
}

export function serializeYaml(
  data: Record<string, string>,
  originalContent: string
): string {
  let updated = originalContent;
  for (const [key, value] of Object.entries(data)) {
    // Replace existing key: value lines, preserving indentation
    const regex = new RegExp(`^(\\s*${escapeRegex(key)}\\s*:).*$`, "gm");
    updated = updated.replace(regex, `$1 ${value}`);
  }
  return updated;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
