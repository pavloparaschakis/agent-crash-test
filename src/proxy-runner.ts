import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  evaluateAssertions,
  evaluateEffectContracts,
  evaluateStateContract,
} from "./assertions.js";
import { getPath, jsonEqual } from "./json-path.js";
import { runJsonSnapshot } from "./observer.js";
import { runStdioProxy, type ProxyCapture } from "./proxy.js";
import { hashJson } from "./stable.js";
import {
  MUTATION_ENGINE_VERSION,
  REPORT_SCHEMA_VERSION,
  type AssertionResult,
  type CallError,
  type CallEvent,
  type CrashTestPack,
  type EffectProbe,
  type EffectValue,
  type Finding,
  type JsonObject,
  type JsonValue,
  type Mutation,
  type MutationRecord,
  type ProbeSafety,
  type RunResult,
  type Severity,
  type ToolManifest,
} from "./types.js";

const DEFAULT_OBSERVER_TIMEOUT_MS = 5_000;
const DEFAULT_OBSERVER_OUTPUT_BYTES = 1_048_576;

export interface ProxyPackRunOptions {
  source: string;
  failOn?: Severity;
  mutationTypes?: string[];
  seed?: number;
  requestTimeoutMs?: number;
  maxRunMs?: number;
  allowUnsafeProbes?: boolean;
  capturePath?: string;
  reproductionCommand?: string;
}

interface ObservationSet {
  effects: EffectValue[];
  events: CallEvent[];
  warnings: string[];
  error?: CallError;
}

/**
 * Run a crash-test pack as a transparent MCP stdio server. A real client uses
 * this process in place of the target server; when the client closes stdin the
 * captured physical traffic is evaluated by the same assertion engine used by
 * scripted packs.
 */
export async function runProxyPack(
  pack: CrashTestPack,
  options: ProxyPackRunOptions,
): Promise<RunResult> {
  const source = path.resolve(options.source);
  if (pack.transport !== "stdio" || !pack.server.command)
    throw new Error(
      "Real-client proxy testing requires a stdio pack with server.command.",
    );

  const startedAt = new Date().toISOString();
  const startedClock = Date.now();
  const selected = selectMutations(pack.mutations ?? [], options.mutationTypes);
  const before = await observeExternalState(pack, options, "before");
  let capture: ProxyCapture = emptyCapture(pack, source);
  let executionError = before.error;
  if (!executionError) {
    try {
      capture = await runStdioProxy({
        targetCommand: pack.server.command,
        targetArgs: pack.server.args,
        cwd: pack.server.cwd
          ? path.resolve(path.dirname(source), pack.server.cwd)
          : path.dirname(source),
        mutations: selected,
        capturePath: options.capturePath,
        requestTimeoutMs:
          options.requestTimeoutMs ?? pack.execution?.request_timeout_ms,
        maxRunMs: options.maxRunMs ?? pack.execution?.max_run_ms,
      });
    } catch (error) {
      executionError = {
        kind: "transport_error",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        source: "real-client-proxy",
      };
    }
  }
  const after = await observeExternalState(pack, options, "after");
  executionError ??= after.error;
  return evaluateProxyCapture(pack, capture, before, after, {
    ...options,
    source,
    selectedMutations: selected,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedClock,
    executionError,
  });
}

interface EvaluationOptions extends ProxyPackRunOptions {
  selectedMutations?: Mutation[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  executionError?: CallError;
}

/** Evaluate an existing proxy capture. Exported for adapters and replay tests. */
export function evaluateProxyCapture(
  pack: CrashTestPack,
  capture: ProxyCapture,
  before: ObservationSet = { effects: [], events: [], warnings: [] },
  after: ObservationSet = { effects: [], events: [], warnings: [] },
  options: EvaluationOptions,
): RunResult {
  const source = path.resolve(options.source);
  const selected =
    options.selectedMutations ??
    selectMutations(pack.mutations ?? [], options.mutationTypes);
  const proxyEvents = captureEvents(capture, before.events.length);
  const events = sequenceEvents([
    ...before.events,
    ...proxyEvents,
    ...after.events,
  ]);
  const effects = mergeObservations(before.effects, after.effects);
  const manifest = manifestFromCapture(capture);
  const reproduction = {
    command:
      options.reproductionCommand ??
      `agent-crash-test test ${quoteArg(source)} --format terminal,markdown,json`,
    packPath: source,
    workingDirectory: process.cwd(),
    mutationIds: selected.map((mutation) => mutation.id),
    seed: options.seed,
  };
  const context = {
    command: reproduction.command,
    source,
    workingDirectory: reproduction.workingDirectory,
    mutationIds: reproduction.mutationIds,
    seed: reproduction.seed,
  };
  const executionError = options.executionError;
  const assertions: AssertionResult[] = executionError
    ? []
    : [
        ...evaluateAssertions(
          pack.assertions,
          events,
          effects,
          new Map<string, JsonValue | undefined>(),
          manifest,
          context,
        ),
        ...(pack.state_contract
          ? evaluateStateContract(pack.state_contract, effects, events, context)
          : []),
        ...(pack.effect_contracts
          ? evaluateEffectContracts(
              pack.effect_contracts,
              effects,
              events,
              context,
            )
          : []),
      ];
  const findings = assertions.flatMap((assertion) =>
    assertion.finding ? [assertion.finding] : [],
  );
  attachFingerprints(findings, pack, selected);
  const mutations = mutationRecords(selected, capture, events);
  const failOn = options.failOn ?? "error";
  const startedAt = options.startedAt ?? capture.createdAt;
  const completedAt = options.completedAt ?? new Date().toISOString();

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    identity: {
      runId: capture.captureId || randomUUID(),
      startedAt,
      completedAt,
      runnerVersion: "0.1.0",
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      packSchemaVersion: pack.version,
      packId: pack.id,
      packSource: source,
      packSha256: hashJson(pack as unknown as JsonValue),
      serverManifestSha256: manifest.length
        ? hashJson(manifest as unknown as JsonValue)
        : undefined,
      mutationSeed: options.seed,
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version,
      },
      determinism: "partial",
    },
    pack: { id: pack.id, name: pack.name, source },
    transport: "stdio",
    adapter: {
      id: "mcp-stdio-real-client-proxy",
      version: "1",
      protocol: "mcp",
      transport: "stdio",
      realClient: true,
      physicalInterception: true,
      responseMutation: true,
      transportDisconnect: true,
      stateObservation: effects.length > 0,
      determinism: "partial",
      sandboxRequired: false,
      limitations: [
        "Model and client policy can be nondeterministic.",
        "Real-client effect observation currently requires an explicit local JSON snapshot observer; tool observers are marked inconclusive to prevent false passes.",
        "Host-network denial requires an external sandbox.",
      ],
    },
    server: {
      command: pack.server.command,
      args: pack.server.args,
      cwd: pack.server.cwd,
      toolCount: manifest.length,
    },
    manifest,
    mutations,
    events,
    effects,
    assertions,
    findings,
    reproduction,
    executionWarnings: [
      ...capture.warnings,
      ...before.warnings,
      ...after.warnings,
      ...(options.durationMs === undefined
        ? []
        : [`Real-client session completed in ${options.durationMs}ms.`]),
    ],
    executionError,
    policy: {
      failOn,
      networkBoundary: pack.execution?.network ?? "not_enforced",
      credentialPolicy: "minimal_environment",
      processClosed: true,
    },
  };
}

async function observeExternalState(
  pack: CrashTestPack,
  options: ProxyPackRunOptions,
  phase: "before" | "after",
): Promise<ObservationSet> {
  const effects: EffectValue[] = [];
  const events: CallEvent[] = [];
  const warnings: string[] = [];
  for (const probe of pack.effect_probes ?? []) {
    const safety: ProbeSafety = probe.safety ?? "declared_read_only";
    if (probe.source !== "json_command") {
      const error: CallError = {
        kind: "configuration",
        message: `Real-client proxy mode cannot safely sample ${probe.source} observer ${probe.id}; use an explicit local JSON snapshot observer.`,
        retryable: false,
        source: "real-client-observer",
      };
      effects.push({
        id: probe.id,
        source: probe.source,
        path: probe.path,
        value: undefined,
        observed: undefined,
        error,
        observerStatus: "inconclusive",
        safety,
      });
      warnings.push(error.message);
      continue;
    }
    const allowed =
      probe.safety === "explicit_unsafe_opt_in" &&
      pack.execution?.allow_unsafe_probes === true &&
      options.allowUnsafeProbes === true;
    if (!allowed) {
      const error: CallError = {
        kind: "configuration",
        message: `JSON snapshot observer ${probe.id} requires pack and CLI unsafe-probe opt-in.`,
        retryable: false,
        source: "probe-policy",
      };
      effects.push(inconclusiveEffect(probe, error, safety));
      return { effects, events, warnings, error };
    }
    const result = await runJsonSnapshot(probe, {
      packDirectory: path.dirname(path.resolve(options.source)),
      timeoutMs:
        pack.execution?.observer_timeout_ms ?? DEFAULT_OBSERVER_TIMEOUT_MS,
      maxOutputBytes:
        pack.execution?.max_observer_output_bytes ??
        DEFAULT_OBSERVER_OUTPUT_BYTES,
    });
    const observed =
      result.value === undefined
        ? undefined
        : getPath(result.value, probe.path);
    const eventId = `${phase}-probe-${events.length + 1}`;
    events.push({
      eventId,
      sequence: events.length + 1,
      kind: "effect_probe",
      tool: "<json_command>",
      arguments: { observer: probe.id, phase },
      attempt: 1,
      output: result.value,
      error: result.error,
      underlyingOutput: result.value,
      underlyingError: result.error,
      mutationIds: [],
      durationMs: result.durationMs,
      physicalCall: false,
      redactionApplied: true,
    });
    effects.push({
      id: probe.id,
      source: probe.source,
      path: probe.path,
      value: observed,
      observed,
      error: result.error,
      observerStatus: result.error
        ? "inconclusive"
        : observed === undefined
          ? "absent"
          : "present",
      probeEventId: eventId,
      safety,
    });
    if (result.error) {
      warnings.push(`${phase} observer ${probe.id}: ${result.error.message}`);
      return { effects, events, warnings, error: result.error };
    }
  }
  return { effects, events, warnings };
}

function inconclusiveEffect(
  probe: EffectProbe,
  error: CallError,
  safety: ProbeSafety,
): EffectValue {
  return {
    id: probe.id,
    source: probe.source,
    path: probe.path,
    value: undefined,
    observed: undefined,
    error,
    observerStatus: "inconclusive",
    safety,
  };
}

function mergeObservations(
  before: EffectValue[],
  after: EffectValue[],
): EffectValue[] {
  const ids = new Set([...before, ...after].map((effect) => effect.id));
  return [...ids].map((id) => {
    const initial = before.find((effect) => effect.id === id);
    const final = after.find((effect) => effect.id === id);
    const error = initial?.error ?? final?.error;
    const beforeValue = initial?.value;
    const afterValue = final?.value;
    return {
      ...(final ?? initial)!,
      value: afterValue,
      observed: afterValue,
      before: beforeValue,
      after: afterValue,
      error,
      observerStatus: error
        ? "inconclusive"
        : beforeValue === undefined && afterValue === undefined
          ? "absent"
          : jsonEqual(beforeValue, afterValue)
            ? "present"
            : "changed",
      probeEventId: final?.probeEventId ?? initial?.probeEventId,
    };
  });
}

function captureEvents(capture: ProxyCapture, offset: number): CallEvent[] {
  const physicalCounts = new Map<string, number>();
  const logicalCounts = new Map<string, number>();
  const requests = capture.events.filter(
    (event) => event.kind === "request" && event.tool,
  );
  const result: CallEvent[] = [];
  for (const request of requests) {
    const tool = request.tool!;
    const physical = request.side === "target" && request.physicalCall;
    const counts = physical ? physicalCounts : logicalCounts;
    const attempt = (counts.get(tool) ?? 0) + 1;
    counts.set(tool, attempt);
    const id = request.requestId;
    const duplicate =
      physical &&
      typeof id === "string" &&
      id.startsWith("agent-crash-test-duplicate-");
    const response = capture.events.find(
      (event) =>
        event.kind === "response" &&
        event.sequence > request.sequence &&
        event.requestId === id &&
        (physical ? event.side === "target" : event.side === "client"),
    );
    const visibleMutation = capture.events.find(
      (event) =>
        event.kind === "response" &&
        event.side === "client" &&
        event.tool === tool &&
        event.sequence > request.sequence &&
        event.mutationId,
    );
    const message = request.message;
    const args = rpcArguments(message);
    const parsed = rpcOutcome(response?.message);
    result.push({
      eventId: `proxy-event-${request.sequence}`,
      sequence: offset + result.length + 1,
      kind: duplicate ? "duplicate" : attempt > 1 ? "retry" : "step",
      stepId: physical ? undefined : `client-${tool}-${attempt}`,
      tool,
      arguments: args,
      attempt,
      output: parsed.output,
      error: parsed.error,
      underlyingOutput: parsed.output,
      underlyingError: parsed.error,
      commitStatus: visibleMutation?.commitStatus ?? response?.commitStatus,
      responseStatus:
        visibleMutation?.responseStatus ?? response?.responseStatus,
      mutationPhase: visibleMutation?.mutationPhase ?? response?.mutationPhase,
      mutationIds: [
        ...new Set(
          [visibleMutation?.mutationId, response?.mutationId].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      ],
      mutationVersions:
        visibleMutation?.mutationId || response?.mutationId
          ? [MUTATION_ENGINE_VERSION]
          : [],
      durationMs: 0,
      physicalCall: physical,
      redactionApplied: true,
    });
  }
  return result;
}

function rpcArguments(message: JsonValue | undefined): JsonObject {
  if (!isObject(message) || !isObject(message.params)) return {};
  return isObject(message.params.arguments)
    ? (message.params.arguments as JsonObject)
    : {};
}

function rpcOutcome(message: JsonValue | undefined): {
  output?: JsonValue;
  error?: CallError;
} {
  if (!isObject(message)) return {};
  if (isObject(message.error))
    return {
      error: {
        kind: "server_error",
        message:
          typeof message.error.message === "string"
            ? message.error.message
            : "MCP tool call failed.",
        code:
          typeof message.error.code === "number" ||
          typeof message.error.code === "string"
            ? message.error.code
            : undefined,
        source: "real-client-proxy",
      },
    };
  return message.result === undefined ? {} : { output: message.result };
}

function manifestFromCapture(capture: ProxyCapture): ToolManifest[] {
  for (const event of capture.events) {
    if (event.kind !== "response" || !isObject(event.message)) continue;
    const result = event.message.result;
    if (!isObject(result) || !Array.isArray(result.tools)) continue;
    return result.tools
      .filter(isObject)
      .filter((tool) => typeof tool.name === "string")
      .map((tool) => ({
        name: tool.name as string,
        description:
          typeof tool.description === "string" ? tool.description : undefined,
        inputSchema: isObject(tool.inputSchema)
          ? (tool.inputSchema as JsonObject)
          : undefined,
        outputSchema: isObject(tool.outputSchema)
          ? (tool.outputSchema as JsonObject)
          : undefined,
        annotations: isObject(tool.annotations)
          ? (tool.annotations as JsonObject)
          : undefined,
      }));
  }
  return [];
}

function mutationRecords(
  mutations: Mutation[],
  capture: ProxyCapture,
  events: CallEvent[],
): MutationRecord[] {
  return mutations.map((mutation) => {
    const applied = capture.events.find(
      (event) => event.kind === "mutation" && event.mutationId === mutation.id,
    );
    const matching = events.find(
      (event) =>
        event.physicalCall &&
        (!mutation.applies_to || event.tool === mutation.applies_to),
    );
    return {
      id: mutation.id,
      type: mutation.type,
      version: mutation.version ?? MUTATION_ENGINE_VERSION,
      seed: mutation.seed,
      appliesTo: mutation.applies_to,
      occurrence: mutation.occurrence,
      requestedAtEvent: matching?.eventId,
      appliedAtEvent: applied ? `proxy-event-${applied.sequence}` : undefined,
      parameters: {
        duration_ms: mutation.duration_ms ?? 0,
        occurrence: mutation.occurrence ?? 1,
      },
      phase: applied?.mutationPhase ?? mutation.phase,
      result: applied ? "applied" : "not_matched",
    };
  });
}

function attachFingerprints(
  findings: Finding[],
  pack: CrashTestPack,
  mutations: Mutation[],
): void {
  const mutationInputs = mutations
    .map(
      (mutation) =>
        `${mutation.id}@${mutation.version ?? MUTATION_ENGINE_VERSION}:${mutation.type}`,
    )
    .sort();
  for (const finding of findings) {
    const inputs = [
      `pack:${pack.id}`,
      `assertion:${finding.id}`,
      `category:${finding.category ?? "assertion_failure"}`,
      `effect:${finding.effectId ?? ""}`,
      ...mutationInputs,
    ];
    finding.fingerprint = {
      algorithm: "sha256",
      value: hashJson({
        packId: pack.id,
        assertionId: finding.id,
        category: finding.category ?? "assertion_failure",
        effectId: finding.effectId ?? null,
        expected: finding.expected ?? null,
        observed: finding.observed ?? null,
        mutations: mutationInputs,
      }),
      inputs,
    };
  }
}

function sequenceEvents(events: CallEvent[]): CallEvent[] {
  return events.map((event, index) => ({ ...event, sequence: index + 1 }));
}

function selectMutations(
  mutations: Mutation[],
  requested?: string[],
): Mutation[] {
  if (!requested?.length) return mutations;
  return mutations.filter(
    (mutation) =>
      requested.includes(mutation.id) || requested.includes(mutation.type),
  );
}

function emptyCapture(pack: CrashTestPack, source: string): ProxyCapture {
  return {
    schemaVersion: 1,
    captureId: randomUUID(),
    createdAt: new Date().toISOString(),
    target: {
      command: pack.server.command ?? "<missing>",
      args: pack.server.args ?? [],
      cwd: pack.server.cwd ?? path.dirname(source),
    },
    determinism: "partial",
    events: [],
    warnings: [],
  };
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function quoteArg(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
