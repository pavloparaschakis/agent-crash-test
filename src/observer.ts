import { spawn } from "node:child_process";
import path from "node:path";
import type { CallError, EffectProbe, JsonObject, JsonValue } from "./types.js";
import { redactText, redactUnknown } from "./redaction.js";

export interface JsonSnapshotOptions {
  packDirectory: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface JsonSnapshotResult {
  value?: JsonValue;
  error?: CallError;
  durationMs: number;
  timedOut: boolean;
}

export async function runJsonSnapshot(
  probe: EffectProbe,
  options: JsonSnapshotOptions,
): Promise<JsonSnapshotResult> {
  if (!probe.command)
    return {
      error: {
        kind: "configuration",
        message: `JSON snapshot probe ${probe.id} requires command.`,
        source: "observer",
      },
      durationMs: 0,
      timedOut: false,
    };

  const cwd = probe.cwd
    ? path.resolve(options.packDirectory, probe.cwd)
    : options.packDirectory;
  if (!isWithin(cwd, options.packDirectory))
    return {
      error: {
        kind: "configuration",
        message: `JSON snapshot probe ${probe.id} cwd escapes the pack directory.`,
        source: "observer",
      },
      durationMs: 0,
      timedOut: false,
    };
  const started = performance.now();
  const env = minimalEnvironment(probe.env);
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(probe.command, probe.args ?? [], {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: process.platform === "win32",
    });
  } catch (error) {
    return {
      error: {
        kind: "spawn",
        message: redactText(
          error instanceof Error ? error.message : String(error),
        ),
        source: "observer",
      },
      durationMs: Math.round(performance.now() - started),
      timedOut: false,
    };
  }
  let stdout = "";
  let stderr = "";
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let exceeded = false;
  let settled = false;
  const appendBounded = (
    current: string,
    chunk: Buffer | string,
    markTruncated: (value: boolean) => void,
  ): string => {
    const next = `${current}${String(chunk)}`;
    if (Buffer.byteLength(next, "utf8") <= options.maxOutputBytes) return next;
    markTruncated(true);
    return Buffer.from(next, "utf8")
      .subarray(0, options.maxOutputBytes)
      .toString("utf8");
  };

  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdout = appendBounded(stdout, chunk, (value) => {
      stdoutTruncated = value;
    });
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr = appendBounded(stderr, redactText(String(chunk)), (value) => {
      stderrTruncated = value;
    });
  });

  const result = await new Promise<JsonSnapshotResult>((resolve) => {
    const timer = setTimeout(() => {
      exceeded = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 250).unref();
    }, options.timeoutMs);
    timer.unref();

    child.once("error", (error) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        error: {
          kind: "spawn",
          message: redactText(error.message),
          source: "observer",
        },
        durationMs: Math.round(performance.now() - started),
        timedOut: exceeded,
      });
    });
    child.once("close", (code, signal) => {
      settled = true;
      clearTimeout(timer);
      const durationMs = Math.round(performance.now() - started);
      if (exceeded) {
        resolve({
          error: {
            kind: "timeout",
            message: `JSON snapshot probe ${probe.id} exceeded ${options.timeoutMs}ms.${stderr ? ` Stderr: ${stderr.trim()}` : ""}`,
            retryable: false,
            source: "observer",
          },
          durationMs,
          timedOut: true,
        });
        return;
      }
      if (stdoutTruncated || stderrTruncated) {
        resolve({
          error: {
            kind: "protocol",
            message: `JSON snapshot probe ${probe.id} exceeded the ${options.maxOutputBytes}-byte output limit.`,
            source: "observer",
          },
          durationMs,
          timedOut: false,
        });
        return;
      }
      if (code !== 0) {
        resolve({
          error: {
            kind: "server_error",
            message: `JSON snapshot probe ${probe.id} exited with ${signal ?? code}.${stderr ? ` Stderr: ${stderr.trim()}` : ""}`,
            source: "observer",
          },
          durationMs,
          timedOut: false,
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as unknown;
        resolve({
          value: toJsonValue(redactUnknown(parsed)),
          durationMs,
          timedOut: false,
        });
      } catch (error) {
        resolve({
          error: {
            kind: "protocol",
            message: `JSON snapshot probe ${probe.id} returned invalid JSON: ${redactText(error instanceof Error ? error.message : String(error))}`,
            source: "observer",
          },
          durationMs,
          timedOut: false,
        });
      }
    });
  });
  return result;
}

function minimalEnvironment(
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const permitted = [
    "PATH",
    "SystemRoot",
    "COMSPEC",
    "ComSpec",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
  ];
  const environment: Record<string, string> = {};
  for (const key of permitted) {
    const value = process.env[key];
    if (value !== undefined && !value.startsWith("()"))
      environment[key] = value;
  }
  return { ...environment, ...(overrides ?? {}) };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (value && typeof value === "object") {
    const result: JsonObject = {};
    for (const [key, nested] of Object.entries(value))
      result[key] = toJsonValue(nested);
    return result;
  }
  return null;
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
