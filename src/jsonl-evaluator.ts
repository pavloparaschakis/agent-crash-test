import path from "node:path";
import {
  evaluateAssertions,
  evaluateEffectContracts,
  evaluateStateContract,
} from "./assertions.js";
import type { JsonlRun } from "./jsonl.js";
import { hashJson } from "./stable.js";
import {
  MUTATION_ENGINE_VERSION,
  REPORT_SCHEMA_VERSION,
  type AssertionResult,
  type CallError,
  type CallEvent,
  type CrashTestPack,
  type EffectValue,
  type Finding,
  type JsonObject,
  type JsonValue,
  type MutationRecord,
  type RunResult,
  type Severity,
} from "./types.js";

export interface JsonlEvaluationOptions {
  source: string;
  failOn?: Severity;
  reproductionCommand?: string;
}

/** Evaluate a normalized language-neutral run through the core contracts. */
export function evaluateJsonlRun(
  run: JsonlRun,
  pack: CrashTestPack,
  options: JsonlEvaluationOptions,
): RunResult {
  const source = path.resolve(options.source);
  const events = callEvents(run);
  const effects = observedEffects(run);
  const mutations = mutationRecords(run, pack);
  const reproduction = {
    command:
      options.reproductionCommand ??
      `agent-crash-test bridge --contract ${quoteArg(source)} --input events.jsonl`,
    workingDirectory: process.cwd(),
    packPath: source,
    mutationIds: mutations
      .filter((mutation) => mutation.result === "applied")
      .map((mutation) => mutation.id),
  };
  const context = {
    command: reproduction.command,
    source,
    workingDirectory: reproduction.workingDirectory,
    mutationIds: reproduction.mutationIds,
  };
  const executionError = executionErrorFor(run);
  const assertions: AssertionResult[] = executionError
    ? []
    : [
        ...evaluateAssertions(
          pack.assertions,
          events,
          effects,
          new Map<string, JsonValue | undefined>(),
          [],
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
  attachFingerprints(findings, pack, mutations);
  const startedAt = new Date().toISOString();

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    identity: {
      runId: run.runId,
      startedAt,
      completedAt: startedAt,
      runnerVersion: "0.1.0",
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      packSchemaVersion: pack.version,
      packId: pack.id,
      packSource: source,
      packSha256: hashJson(pack as unknown as JsonValue),
      mutationSeed: undefined,
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version,
      },
      determinism: run.determinism,
    },
    pack: { id: pack.id, name: pack.name, source },
    transport: pack.transport,
    adapter: run.adapter,
    server: {
      command: pack.server.command,
      args: pack.server.args,
      cwd: pack.server.cwd,
      fixture: pack.server.fixture,
      toolCount: new Set(events.map((event) => event.tool)).size,
    },
    manifest: [],
    mutations,
    events,
    effects,
    assertions,
    findings,
    reproduction,
    executionWarnings: [...run.warnings],
    executionError,
    policy: {
      failOn: options.failOn ?? "error",
      networkBoundary: "not_enforced",
      credentialPolicy: "minimal_environment",
      processClosed: run.terminalStatus !== "inconclusive",
    },
  };
}

function callEvents(run: JsonlRun): CallEvent[] {
  const calls = run.events.filter(
    (event) =>
      (event.kind === "logical_call" || event.kind === "physical_call") &&
      event.tool,
  );
  return calls.map((event, index) => {
    const response = run.events.find(
      (candidate) =>
        candidate.kind === "response" &&
        candidate.operationId === event.operationId,
    );
    return {
      eventId: event.eventId,
      sequence: index + 1,
      parentEventId: event.parentEventId,
      kind: (event.attempt ?? 1) > 1 ? "retry" : "step",
      stepId: event.operationId,
      tool: event.tool!,
      arguments: isObject(event.arguments)
        ? (event.arguments as JsonObject)
        : {},
      attempt: event.attempt ?? 1,
      output: response?.outcome?.output,
      error: response?.outcome?.error,
      underlyingOutput: response?.outcome?.output,
      underlyingError: response?.outcome?.error,
      commitStatus: response?.outcome?.commitStatus,
      responseStatus: response?.outcome?.responseStatus,
      mutationPhase: event.mutationPhase ?? response?.mutationPhase,
      mutationIds: event.mutationIds ?? response?.mutationIds ?? [],
      mutationVersions: (event.mutationIds ?? response?.mutationIds)?.map(
        () => MUTATION_ENGINE_VERSION,
      ),
      durationMs: event.durationMs ?? response?.durationMs ?? 0,
      physicalCall: event.physicalCall,
      redactionApplied: true,
    };
  });
}

function observedEffects(run: JsonlRun): EffectValue[] {
  const snapshots = run.events.filter(
    (event) => event.kind === "state_snapshot" && event.observerId,
  );
  const ids = new Set(snapshots.map((event) => event.observerId!));
  return [...ids].map((id) => {
    const selected = snapshots.filter((event) => event.observerId === id);
    const first = selected[0]!;
    const last = selected.at(-1)!;
    const error: CallError | undefined =
      first.observerStatus === "inconclusive" ||
      last.observerStatus === "inconclusive"
        ? {
            kind: "protocol",
            message: `Adapter marked observer ${id} inconclusive.`,
            retryable: false,
            source: "jsonl-adapter",
          }
        : undefined;
    return {
      id,
      source: "json_command",
      path: "",
      value: last.observerValue,
      observed: last.observerValue,
      before: selected.length > 1 ? first.observerValue : undefined,
      after: last.observerValue,
      error,
      observerStatus: last.observerStatus,
      probeEventId: last.eventId,
      safety: "explicit_unsafe_opt_in",
    };
  });
}

function mutationRecords(run: JsonlRun, pack: CrashTestPack): MutationRecord[] {
  const appliedIds = new Set(
    run.events
      .filter((event) => event.kind === "mutation")
      .flatMap((event) => event.mutationIds ?? []),
  );
  const declared = pack.mutations ?? [];
  const unknown = [...appliedIds].filter(
    (id) => !declared.some((mutation) => mutation.id === id),
  );
  return [
    ...declared.map((mutation) => {
      const event = run.events.find((candidate) =>
        candidate.mutationIds?.includes(mutation.id),
      );
      return {
        id: mutation.id,
        type: mutation.type,
        version: mutation.version ?? MUTATION_ENGINE_VERSION,
        seed: mutation.seed,
        appliesTo: mutation.applies_to,
        occurrence: mutation.occurrence,
        requestedAtEvent: event?.eventId,
        appliedAtEvent: event?.eventId,
        parameters: {},
        phase: event?.mutationPhase ?? mutation.phase,
        result: appliedIds.has(mutation.id)
          ? ("applied" as const)
          : ("not_matched" as const),
      };
    }),
    ...unknown.map((id) => {
      const event = run.events.find((candidate) =>
        candidate.mutationIds?.includes(id),
      );
      return {
        id,
        type: "retryable_error" as const,
        version: MUTATION_ENGINE_VERSION,
        requestedAtEvent: event?.eventId,
        appliedAtEvent: event?.eventId,
        parameters: { adapter_declared: true },
        phase: event?.mutationPhase,
        result: "applied" as const,
      };
    }),
  ];
}

function executionErrorFor(run: JsonlRun): CallError | undefined {
  if (run.terminalStatus === "inconclusive")
    return {
      kind: "protocol",
      message:
        "Adapter run ended inconclusively; contracts were not evaluated.",
      retryable: false,
      source: "jsonl-adapter",
    };
  const transport = run.events.find(
    (event) => event.kind === "transport_error",
  );
  if (transport?.outcome?.error) return transport.outcome.error;
  if (run.terminalStatus === "failed")
    return {
      kind: "server_error",
      message: "Adapter reported a failed run.",
      retryable: false,
      source: "jsonl-adapter",
    };
  return undefined;
}

function attachFingerprints(
  findings: Finding[],
  pack: CrashTestPack,
  mutations: MutationRecord[],
): void {
  for (const finding of findings) {
    const inputs = [
      `pack:${pack.id}`,
      `assertion:${finding.id}`,
      `category:${finding.category ?? "assertion_failure"}`,
      ...mutations
        .filter((mutation) => mutation.result === "applied")
        .map((mutation) => `mutation:${mutation.id}@${mutation.version}`)
        .sort(),
    ];
    finding.fingerprint = {
      algorithm: "sha256",
      value: hashJson({ inputs }),
      inputs,
    };
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function quoteArg(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
