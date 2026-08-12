import fs from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { redactUnknown } from "./redaction.js";
import { captureSourceHash } from "./proxy.js";
import type { CrashTestPack, JsonObject, JsonValue } from "./types.js";
import type { ProxyCapture, ProxyCaptureEvent } from "./proxy.js";

export interface CaptureLoadResult {
  capture: ProxyCapture;
  source: string;
}

export interface CaptureGenerationResult {
  pack: CrashTestPack;
  source: string;
  output: string;
  warnings: string[];
  callCount: number;
}

export interface CaptureGenerationOptions {
  name?: string;
}

/**
 * Load a bounded, redacted proxy capture. Capture files are evidence, not
 * executable configuration, so the loader validates the envelope before a
 * generated pack is allowed to reference any of its values.
 */
export async function loadCapture(
  filePath: string,
): Promise<CaptureLoadResult> {
  const source = path.resolve(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(source, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid capture ${source}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!isObject(parsed))
    throw new Error(`Invalid capture ${source}: expected a JSON object.`);
  if (parsed.schemaVersion !== 1)
    throw new Error(
      `Invalid capture ${source}: unsupported schemaVersion ${String(parsed.schemaVersion)}.`,
    );
  if (!isObject(parsed.target) || typeof parsed.target.command !== "string")
    throw new Error(`Invalid capture ${source}: target.command is required.`);
  if (!Array.isArray(parsed.events))
    throw new Error(`Invalid capture ${source}: events must be an array.`);
  if (
    parsed.sourceSha256 !== undefined &&
    (typeof parsed.sourceSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(parsed.sourceSha256))
  )
    throw new Error(
      `Invalid capture ${source}: sourceSha256 must be a lowercase SHA-256 hex digest.`,
    );
  const events = parsed.events.filter(isObject).map(normalizeEvent);
  if (events.length !== parsed.events.length)
    throw new Error(
      `Invalid capture ${source}: every event must be an object.`,
    );
  const capture: ProxyCapture = {
    schemaVersion: 1,
    captureId:
      typeof parsed.captureId === "string" ? parsed.captureId : "unknown",
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date(0).toISOString(),
    target: {
      command: parsed.target.command,
      args: Array.isArray(parsed.target.args)
        ? parsed.target.args.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      cwd:
        typeof parsed.target.cwd === "string"
          ? parsed.target.cwd
          : process.cwd(),
    },
    sourceSha256:
      typeof parsed.sourceSha256 === "string" ? parsed.sourceSha256 : undefined,
    determinism: "partial",
    events,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    truncated: parsed.truncated === true,
  };
  const redacted = redactUnknown(capture) as ProxyCapture;
  if (
    redacted.sourceSha256 &&
    redacted.sourceSha256 !== captureSourceHash(redacted)
  )
    redacted.warnings.push(
      "Capture source SHA-256 does not match the redacted target/events; treat the capture as modified or incomplete.",
    );
  return { capture: redacted, source };
}

/**
 * Turn a capture into a deliberately review-required scripted pack. The
 * generated pack replays observed tools against the captured target server;
 * it does not pretend to reproduce the original agent's policy.
 */
export async function generateStarterPack(
  capturePath: string,
  outputPath: string,
  options: CaptureGenerationOptions = {},
): Promise<CaptureGenerationResult> {
  const loaded = await loadCapture(capturePath);
  const calls = logicalToolCalls(loaded.capture.events);
  if (!calls.length)
    throw new Error(
      `Capture ${loaded.source} contains no client tools/call requests to replay.`,
    );

  const slug = slugify(
    `${loaded.capture.target.command}-${loaded.capture.captureId.slice(0, 8)}`,
  );
  const counts = new Map<string, number>();
  const steps = calls.map((call, index) => {
    const count = (counts.get(call.tool) ?? 0) + 1;
    counts.set(call.tool, count);
    return {
      id: `captured-${index + 1}-${slugify(call.tool)}`,
      call: call.tool,
      arguments: call.arguments,
      retry: { max_attempts: 1 },
    };
  });
  const assertions = [...counts.entries()].map(([tool, exactly]) => ({
    id: `captured-${slugify(tool)}-count`,
    type: "call_count" as const,
    tool,
    exactly,
    severity: "warning" as const,
    why_it_matters:
      "A generated replay establishes the observed call shape; add effect and recovery assertions before treating it as a reliability gate.",
    remediation:
      "Declare the intended state transition and a forbidden duplicate or unauthorized transition.",
  }));
  const pack: CrashTestPack = {
    version: 1,
    id: `captured/${slug}`,
    name:
      options.name ??
      `Captured workflow replay: ${loaded.capture.target.command}`,
    description: `Generated from a local Agent Crash Test proxy capture${loaded.capture.sourceSha256 ? ` (source SHA-256 ${loaded.capture.sourceSha256})` : ""}. Review redaction, target paths, effect probes, and recovery expectations before enabling this pack as a CI gate.`,
    protocol: "mcp",
    transport: "stdio",
    server: {
      command: loaded.capture.target.command,
      args: loaded.capture.target.args,
      cwd: loaded.capture.target.cwd,
    },
    execution: {
      request_timeout_ms: 10_000,
      max_run_ms: 60_000,
    },
    tags: ["captured", "review-required", "starter-pack"],
    steps,
    assertions,
    artifacts: {
      remediation:
        "Replace call-count-only assertions with effect/state contracts and explicit recovery expectations before using this pack as a blocking CI test.",
    },
  };
  const output = path.resolve(outputPath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await fs.writeFile(temporary, stringify(pack), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporary, output);
  const warnings = [
    ...loaded.capture.warnings,
    ...(loaded.capture.truncated
      ? [
          "The capture was truncated by a configured event or byte limit; the generated pack is incomplete.",
        ]
      : []),
    ...(loaded.capture.sourceSha256
      ? [`Capture source SHA-256: ${loaded.capture.sourceSha256}`]
      : [
          "The capture has no source SHA-256; treat its provenance as incomplete and review it before reuse.",
        ]),
    "Generated packs replay observed client tool calls directly against the captured server; they do not reproduce the original agent's decision policy.",
    "Review and replace machine-specific server.cwd, arguments, and call-count-only assertions before committing the pack.",
    "No effect observer was inferred from the capture. Add a safe fixture, declared read-only tool, or explicitly approved snapshot observer.",
  ];
  return {
    pack,
    source: loaded.source,
    output,
    warnings,
    callCount: calls.length,
  };
}

interface CapturedToolCall {
  tool: string;
  arguments: JsonObject;
}

function logicalToolCalls(events: ProxyCaptureEvent[]): CapturedToolCall[] {
  return events
    .filter(
      (event) =>
        event.side === "client" &&
        event.kind === "request" &&
        event.method === "tools/call" &&
        typeof event.tool === "string" &&
        isObject(event.message),
    )
    .map((event) => {
      const message = event.message;
      const params =
        isObject(message) && isObject(message.params) ? message.params : {};
      return {
        tool: event.tool!,
        arguments: isObject(params.arguments) ? params.arguments : {},
      };
    });
}

function normalizeEvent(value: Record<string, JsonValue>): ProxyCaptureEvent {
  const event = value as unknown as ProxyCaptureEvent;
  if (typeof event.sequence !== "number" || typeof event.kind !== "string")
    throw new Error("Capture event requires numeric sequence and kind.");
  return event;
}

function isObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "captured-workflow";
}
