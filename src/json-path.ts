import type { JsonObject, JsonValue } from "./types.js";

export function getPath(
  value: JsonValue | undefined,
  path: string,
): JsonValue | undefined {
  if (!path) return value;
  const parts = tokenize(path);
  let current: JsonValue | undefined = value;

  for (const part of parts) {
    if (part === "length" && Array.isArray(current)) {
      current = current.length;
      continue;
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (current && typeof current === "object") {
      current = (current as JsonObject)[part];
      continue;
    }
    return undefined;
  }
  return current;
}

export function setPath(
  root: JsonObject,
  path: string,
  value: JsonValue,
): void {
  const parts = tokenize(path);
  if (parts.length === 0) throw new Error("A non-empty path is required");
  let current: JsonObject = root;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next))
      current[part] = {};
    current = current[part] as JsonObject;
  }
  current[parts.at(-1)!] = value;
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function jsonEqual(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tokenize(path: string): string[] {
  return path
    .replace(/\[([0-9]+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}
