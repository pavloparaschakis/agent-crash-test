import type { JsonObject, JsonValue } from "./types.js";

function isSecretKey(key: string): boolean {
  const normalized = key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  return (
    new Set([
      "authorization",
      "bearer",
      "token",
      "secret",
      "password",
      "cookie",
      "apikey",
      "privatekey",
      "accesskey",
      "refreshtoken",
      "session",
      "credential",
      "webhooksecret",
    ]).has(normalized) ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("accesskey") ||
    normalized.endsWith("cookie")
  );
}
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,})/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*[^\s,;&]+/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];

export const REDACTION_MARKER = "[REDACTED]";

export function redact(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const result: JsonObject = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = isSecretKey(key) ? REDACTION_MARKER : redact(nested);
    }
    return result;
  }
  return typeof value === "string" ? redactText(value) : value;
}

export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) =>
      current.replace(pattern, (match) => {
        if (
          /^(token|secret|password|api[_-]?key|authorization)\s*[:=]/i.test(
            match,
          )
        ) {
          return `${match.split(/[:=]/, 1)[0]}=${REDACTION_MARKER}`;
        }
        return REDACTION_MARKER;
      }),
    value,
  );
}

export function containsPotentialSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function redactUnknown(value: unknown): unknown {
  return redactUnknownValue(value, new WeakSet<object>());
}

function redactUnknownValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint" || typeof value === "function")
    return REDACTION_MARKER;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    let result: unknown[];
    try {
      result = value.map((nested) => redactUnknownValue(nested, seen));
    } catch (error) {
      result = [`[UNSERIALIZABLE: ${redactText(String(error))}]`];
    }
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const object = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    try {
      for (const [key, nested] of Object.entries(object))
        result[key] = isSecretKey(key)
          ? REDACTION_MARKER
          : redactUnknownValue(nested, seen);
    } catch (error) {
      result["error"] = `[UNSERIALIZABLE: ${redactText(String(error))}]`;
    }
    seen.delete(value);
    return result;
  }
  return value;
}
