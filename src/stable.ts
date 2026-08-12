import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "./types.js";

export function stableStringify(value: JsonValue): string {
  return stableStringifyValue(value, new WeakSet<object>());
}

function stableStringifyValue(value: JsonValue, seen: WeakSet<object>): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (seen.has(value))
    throw new TypeError(
      "Cannot deterministically serialize a cyclic JSON value",
    );
  seen.add(value);
  let result: string;
  if (Array.isArray(value))
    result = `[${value.map((item) => stableStringifyValue(item, seen)).join(",")}]`;
  else {
    const object = value as JsonObject;
    result = `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringifyValue(object[key]!, seen)}`,
      )
      .join(",")}}`;
  }
  seen.delete(value);
  return result;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashJson(value: JsonValue): string {
  return sha256(stableStringify(value));
}

export function cloneJsonOrUndefined<T extends JsonValue>(
  value: T | undefined,
): T | undefined {
  return value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as T);
}
