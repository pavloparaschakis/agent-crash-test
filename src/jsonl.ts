import { redactUnknown } from "./redaction.js";
import type {
  AdapterCapabilities,
  CallError,
  CommitStatus,
  JsonObject,
  JsonValue,
  MutationPhase,
  NormalizedEvent,
  NormalizedEventKind,
  NormalizedOutcome,
  ResponseStatus,
} from "./types.js";

export interface JsonlReadOptions {
  maxLineBytes?: number;
  maxRecords?: number;
  maxInputBytes?: number;
  requireRedaction?: boolean;
}

export interface JsonlRun {
  schemaVersion: 1;
  runId: string;
  adapter: AdapterCapabilities;
  determinism: AdapterCapabilities["determinism"];
  events: NormalizedEvent[];
  terminalStatus: "complete" | "failed" | "inconclusive";
  warnings: string[];
}

const DEFAULT_MAX_LINE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_RECORDS = 10_000;
const DEFAULT_MAX_INPUT_BYTES = 32 * 1024 * 1024;
const supportedRecordTypes = new Set([
  "run_start",
  "discovery",
  "tool_call",
  "tool_result",
  "state_snapshot",
  "mutation",
  "transport_error",
  "run_end",
]);
const callErrorKinds: CallError["kind"][] = [
  "configuration",
  "spawn",
  "initialization",
  "protocol",
  "timeout",
  "transport_error",
  "retryable_error",
  "rate_limit",
  "permission_denied",
  "server_error",
  "internal",
];
const observerStatuses: NonNullable<NormalizedEvent["observerStatus"]>[] = [
  "present",
  "absent",
  "changed",
  "forbidden",
  "inconclusive",
];
const mutationPhases: MutationPhase[] = [
  "before_underlying_call",
  "during_underlying_call",
  "after_commit_before_response",
  "after_response_before_client",
  "client_visible_transport_failure",
  "observer_only",
];

/** Validate and normalize the language-neutral JSONL event stream. */
export function parseJsonl(
  input: string,
  options: JsonlReadOptions = {},
): JsonlRun {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  const maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const requireRedaction = options.requireRedaction ?? true;
  if (Buffer.byteLength(input, "utf8") > maxInputBytes)
    throw new Error(`JSONL input exceeds the ${maxInputBytes}-byte limit.`);
  const records = input.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!records.length) throw new Error("JSONL input is empty.");
  if (records.length > maxRecords)
    throw new Error(`JSONL input exceeds the ${maxRecords}-record limit.`);
  let runId: string | undefined;
  let adapter: AdapterCapabilities | undefined;
  let determinism: AdapterCapabilities["determinism"] = "partial";
  let terminalStatus: JsonlRun["terminalStatus"] | undefined;
  let sequence = 0;
  const events: NormalizedEvent[] = [];
  const warnings: string[] = [];
  const operationEvents = new Map<string, string>();

  for (const [index, line] of records.entries()) {
    if (Buffer.byteLength(line, "utf8") > maxLineBytes)
      throw new Error(
        `JSONL record ${index + 1} exceeds the ${maxLineBytes}-byte limit.`,
      );
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(
        `Invalid JSONL record ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if (!isObject(raw))
      throw new Error(`Invalid JSONL record ${index + 1}: expected an object.`);
    const type = stringField(raw, "type", index);
    if (!supportedRecordTypes.has(type))
      throw new Error(
        `Unsupported JSONL record type ${type} at record ${index + 1}.`,
      );
    const recordRunId = stringField(raw, "run_id", index);
    if (runId && recordRunId !== runId)
      throw new Error(
        `JSONL record ${index + 1} uses run_id ${recordRunId}, expected ${runId}.`,
      );
    runId ??= recordRunId;
    if (terminalStatus)
      throw new Error(`JSONL record ${index + 1} appears after run_end.`);

    switch (type) {
      case "run_start": {
        if (events.length || adapter)
          throw new Error("run_start must be the first JSONL record.");
        adapter = parseAdapter(raw.adapter, raw, index);
        determinism = adapter.determinism;
        events.push(
          eventBase(
            runId,
            ++sequence,
            "run_start",
            "runner",
            false,
            raw,
            requireRedaction,
          ),
        );
        break;
      }
      case "discovery":
        requireStarted(adapter, index);
        events.push(
          eventBase(
            runId,
            ++sequence,
            "discovery",
            "runner",
            false,
            raw,
            requireRedaction,
          ),
        );
        break;
      case "tool_call": {
        requireStarted(adapter, index);
        const tool = stringField(raw, "tool", index);
        const operationId = stringField(raw, "operation_id", index);
        requireContentRedaction(raw, requireRedaction, index);
        const physicalCall = raw.physical_call === true;
        const kind: NormalizedEventKind = physicalCall
          ? "physical_call"
          : "logical_call";
        const event = eventBase(
          runId,
          ++sequence,
          kind,
          "client_to_target",
          physicalCall,
          raw,
          requireRedaction,
        );
        event.tool = tool;
        event.operationId = operationId;
        event.arguments = jsonObjectField(raw, "arguments", index);
        event.attempt = integerField(raw, "attempt", false);
        event.parentEventId = stringOptional(raw, "parent_event_id");
        operationEvents.set(operationId, event.eventId);
        events.push(event);
        break;
      }
      case "tool_result": {
        requireStarted(adapter, index);
        const operationId = stringField(raw, "operation_id", index);
        requireContentRedaction(raw, requireRedaction, index);
        const outcome = parseOutcome(raw, index);
        const event = eventBase(
          runId,
          ++sequence,
          "response",
          "target_to_client",
          false,
          raw,
          requireRedaction,
        );
        event.operationId = operationId;
        event.outcome = outcome;
        event.parentEventId = operationEvents.get(operationId);
        event.tool = stringOptional(raw, "tool");
        events.push(event);
        break;
      }
      case "state_snapshot": {
        requireStarted(adapter, index);
        const observerId = stringField(raw, "observer_id", index);
        requireContentRedaction(raw, requireRedaction, index);
        const event = eventBase(
          runId,
          ++sequence,
          "state_snapshot",
          "observer",
          false,
          raw,
          requireRedaction,
        );
        event.observerId = observerId;
        event.observerStatus = parseObserverStatus(raw, index);
        event.observerSource = stringOptional(raw, "source");
        event.observerValue =
          raw.value === undefined
            ? undefined
            : toJsonValue(redactUnknown(raw.value));
        events.push(event);
        break;
      }
      case "mutation": {
        requireStarted(adapter, index);
        const event = eventBase(
          runId,
          ++sequence,
          "mutation",
          "runner",
          false,
          raw,
          requireRedaction,
        );
        event.mutationIds = [stringField(raw, "mutation_id", index)];
        event.mutationPhase = parseMutationPhase(raw, index);
        events.push(event);
        break;
      }
      case "transport_error": {
        requireStarted(adapter, index);
        const event = eventBase(
          runId,
          ++sequence,
          "transport_error",
          "runner",
          false,
          raw,
          requireRedaction,
        );
        event.outcome = parseOutcome(
          {
            ...raw,
            status: raw.status ?? "disconnected",
            response_status: raw.response_status ?? "lost",
          },
          index,
        );
        events.push(event);
        break;
      }
      case "run_end": {
        requireStarted(adapter, index);
        if (terminalStatus)
          throw new Error("JSONL stream contains duplicate run_end records.");
        const status = stringField(raw, "status", index);
        if (!["complete", "failed", "inconclusive"].includes(status))
          throw new Error(
            `Invalid run_end status ${status} at record ${index + 1}.`,
          );
        terminalStatus = status as JsonlRun["terminalStatus"];
        events.push(
          eventBase(
            runId,
            ++sequence,
            "run_end",
            "runner",
            false,
            raw,
            requireRedaction,
          ),
        );
        break;
      }
    }
  }
  if (!runId || !adapter)
    throw new Error("JSONL stream must begin with run_start.");
  if (!terminalStatus) {
    warnings.push(
      "JSONL stream ended without run_end; the normalized run is inconclusive.",
    );
    terminalStatus = "inconclusive";
  }
  if (events.some((event) => event.redactionApplied === false))
    throw new Error(
      "JSONL stream contains an event that is not marked redacted; set redaction_applied: true after applying redaction.",
    );
  return {
    schemaVersion: 1,
    runId,
    adapter,
    determinism,
    events,
    terminalStatus,
    warnings,
  };
}

export function jsonlMarkdown(run: JsonlRun): string {
  const safe = redactUnknown(run) as JsonlRun;
  const calls = safe.events.filter(
    (event) => event.kind === "logical_call" || event.kind === "physical_call",
  );
  const errors = safe.events.filter((event) => event.outcome?.error);
  return [
    `# Agent Crash Test JSONL bridge: ${safe.terminalStatus.toUpperCase()}`,
    "",
    `- Run: \`${safe.runId}\``,
    `- Adapter: \`${safe.adapter.id}@${safe.adapter.version}\``,
    `- Determinism: \`${safe.determinism}\``,
    `- Events: ${safe.events.length}`,
    `- Tool calls: ${calls.length}`,
    `- Errors: ${errors.length}`,
    "",
    "## Events",
    "",
    "| # | Kind | Tool | Operation | Status |",
    "|---:|---|---|---|---|",
    ...safe.events.map(
      (event) =>
        `| ${event.sequence} | ${event.kind} | ${escapeCell(event.tool ?? event.observerId ?? "—")} | ${escapeCell(event.operationId ?? "—")} | ${escapeCell(event.outcome?.status ?? "—")} |`,
    ),
    "",
    ...(safe.warnings.length
      ? ["## Warnings", "", ...safe.warnings.map((warning) => `- ${warning}`)]
      : []),
  ].join("\n");
}

function parseAdapter(
  value: JsonValue | undefined,
  raw: JsonObject,
  index: number,
): AdapterCapabilities {
  const source = isObject(value) ? value : raw;
  const id =
    stringOptional(source, "adapter") ?? stringOptional(source, "adapter_id");
  if (!id)
    throw new Error(
      `run_start record ${index + 1} requires adapter or adapter_id.`,
    );
  return {
    id,
    version: stringOptional(source, "adapter_version") ?? "0",
    protocol: stringOptional(source, "protocol") ?? "generic",
    transport: stringOptional(source, "transport") ?? "jsonl",
    realClient: source.real_client === true,
    physicalInterception: source.physical_interception === true,
    responseMutation: source.response_mutation === true,
    transportDisconnect: source.transport_disconnect === true,
    stateObservation: source.state_observation === true,
    determinism: parseDeterminism(source.determinism),
    sandboxRequired: source.sandbox_required === true,
    limitations: Array.isArray(source.limitations)
      ? source.limitations.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}

function parseDeterminism(
  value: JsonValue | undefined,
): AdapterCapabilities["determinism"] {
  return value === "deterministic" || value === "nondeterministic"
    ? value
    : "partial";
}

function parseOutcome(raw: JsonObject, index: number): NormalizedOutcome {
  const status = stringField(raw, "status", index);
  const validStatuses = [
    "success",
    "error",
    "timeout",
    "disconnected",
    "malformed",
    "unknown",
  ];
  if (!validStatuses.includes(status))
    throw new Error(
      `Invalid tool result status ${status} at record ${index + 1}.`,
    );
  const commitStatus = parseCommitStatus(raw.commit_status, index);
  const responseStatus = parseResponseStatus(raw.response_status, index);
  const error =
    raw.error === undefined ? undefined : parseError(raw.error, index);
  return {
    status: status as NormalizedOutcome["status"],
    output:
      raw.output === undefined
        ? undefined
        : toJsonValue(redactUnknown(raw.output)),
    error,
    commitStatus,
    responseStatus,
  };
}

function parseError(value: JsonValue, index: number): CallError {
  if (!isObject(value))
    throw new Error(`JSONL error at record ${index + 1} must be an object.`);
  const message = stringField(value, "message", index);
  const rawKind = value.kind;
  if (rawKind !== undefined && typeof rawKind !== "string")
    throw new Error(
      `JSONL error kind at record ${index + 1} must be a string.`,
    );
  const kind = rawKind === undefined ? "internal" : rawKind;
  if (!callErrorKinds.includes(kind as CallError["kind"]))
    throw new Error(`Invalid JSONL error kind ${kind} at record ${index + 1}.`);
  return {
    kind: kind as CallError["kind"],
    message,
    code:
      typeof value.code === "string" || typeof value.code === "number"
        ? value.code
        : undefined,
    retryable: value.retryable === true,
    source: stringOptional(value, "source"),
  };
}

function parseObserverStatus(
  raw: JsonObject,
  index: number,
): NormalizedEvent["observerStatus"] {
  const value = raw.observer_status;
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !observerStatuses.includes(
      value as NonNullable<NormalizedEvent["observerStatus"]>,
    )
  )
    throw new Error(`Invalid observer_status at JSONL record ${index + 1}.`);
  return value as NormalizedEvent["observerStatus"];
}

function parseMutationPhase(
  raw: JsonObject,
  index: number,
): MutationPhase | undefined {
  const value = raw.phase;
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !mutationPhases.includes(value as MutationPhase)
  )
    throw new Error(`Invalid mutation phase at JSONL record ${index + 1}.`);
  return value as MutationPhase;
}

function parseCommitStatus(
  value: JsonValue | undefined,
  index: number,
): CommitStatus {
  const allowed: CommitStatus[] = [
    "not_attempted",
    "not_committed",
    "committed",
    "unknown",
  ];
  if (value === undefined) return "unknown";
  if (typeof value !== "string" || !allowed.includes(value as CommitStatus))
    throw new Error(`Invalid commit_status at JSONL record ${index + 1}.`);
  return value as CommitStatus;
}

function parseResponseStatus(
  value: JsonValue | undefined,
  index: number,
): ResponseStatus {
  const allowed: ResponseStatus[] = [
    "not_returned",
    "returned",
    "corrupted",
    "lost",
  ];
  if (value === undefined)
    throw new Error(
      `JSONL tool result requires response_status at record ${index + 1}.`,
    );
  if (typeof value !== "string" || !allowed.includes(value as ResponseStatus))
    throw new Error(`Invalid response_status at JSONL record ${index + 1}.`);
  return value as ResponseStatus;
}

function eventBase(
  runId: string,
  sequence: number,
  kind: NormalizedEventKind,
  direction: NormalizedEvent["direction"],
  physicalCall: boolean,
  raw: JsonObject,
  requireRedaction: boolean,
): NormalizedEvent {
  const eventId = stringOptional(raw, "event_id") ?? `jsonl-event-${sequence}`;
  return {
    schemaVersion: 1,
    runId,
    eventId,
    sequence,
    timestamp: stringOptional(raw, "timestamp") ?? new Date(0).toISOString(),
    direction,
    kind,
    physicalCall,
    redactionApplied: raw.redaction_applied === true || !requireRedaction,
    durationMs: integerField(raw, "duration_ms", false),
  };
}

function requireStarted(
  adapter: AdapterCapabilities | undefined,
  index: number,
): void {
  if (!adapter)
    throw new Error(`JSONL record ${index + 1} appears before run_start.`);
}

function requireContentRedaction(
  raw: JsonObject,
  required: boolean,
  index: number,
): void {
  if (required && raw.redaction_applied !== true)
    throw new Error(
      `JSONL record ${index + 1} must set redaction_applied: true when content is present.`,
    );
}

function stringField(raw: JsonObject, key: string, index: number): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`JSONL record ${index + 1} requires non-empty ${key}.`);
  return value;
}

function stringOptional(raw: JsonObject, key: string): string | undefined {
  return typeof raw[key] === "string" ? (raw[key] as string) : undefined;
}

function integerField(
  raw: JsonObject,
  key: string,
  required: boolean,
): number | undefined {
  const value = raw[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`JSONL field ${key} must be a non-negative integer.`);
  return value;
}

function jsonObjectField(
  raw: JsonObject,
  key: string,
  index: number,
): JsonObject {
  const value = raw[key];
  if (value === undefined) return {};
  if (!isObject(value))
    throw new Error(
      `JSONL record ${index + 1} field ${key} must be an object.`,
    );
  return toJsonValue(redactUnknown(value)) as JsonObject;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function escapeCell(value: string): string {
  return value
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}
