import { validatePackSemantics } from "./pack.js";
import { redactUnknown } from "./redaction.js";
import { hashJson, stableStringify } from "./stable.js";
import type { ProxyCapture, ProxyCaptureEvent } from "./proxy.js";
import type {
  CrashTestPack,
  EffectClass,
  EffectExpectation,
  JsonObject,
  JsonValue,
  Mutation,
  MutationType,
  OrderingConstraint,
} from "./types.js";

export type GuidedCallClassification =
  | "side_effecting"
  | "read_only"
  | "ambiguous";

export type GuidedOutcomeSignal =
  | "committed_response_lost"
  | "unknown_commit"
  | "transport_failure";

export interface GuidedMutationProfile {
  id: "ambiguous-commit" | "disconnect-after-commit" | "duplicate-delivery";
  type:
    | "commit_then_response_lost"
    | "disconnect_after_commit"
    | "duplicate_call";
  rationale: string;
  retry: {
    maxAttempts: number;
    on: Array<"timeout" | "transport_error">;
  };
}

export interface GuidedWorkflowStep {
  id: string;
  sequence: number;
  tool: string;
  arguments: JsonObject;
}

export interface GuidedCallProposal {
  tool: string;
  classification: GuidedCallClassification;
  classificationReason: string;
  occurrences: number;
  firstSequence: number;
  argumentSamples: JsonObject[];
  outcomeSignals: GuidedOutcomeSignal[];
  mutationProfiles: GuidedMutationProfile[];
}

export interface GuidedObserverCandidate {
  tool: string;
  safety: "declared_read_only";
  reason: string;
}

export interface GuidedCaptureProposal {
  schemaVersion: 1;
  proposalId: string;
  target: ProxyCapture["target"];
  workflow: GuidedWorkflowStep[];
  calls: GuidedCallProposal[];
  sideEffectingCalls: GuidedCallProposal[];
  ambiguousCalls: GuidedCallProposal[];
  observerCandidates: GuidedObserverCandidate[];
  warnings: string[];
}

interface Confirmation<T> {
  confirmed: true;
  value: T;
}

export type GuidedObserverConfirmation =
  | {
      confirmed: true;
      id: string;
      source: "tool";
      tool: string;
      path: string;
      arguments?: JsonObject;
      description?: string;
    }
  | {
      confirmed: true;
      id: string;
      source: "json_command";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      path: string;
      description?: string;
      explicitUnsafeOptIn: true;
    };

export interface GuidedForbiddenExpectation {
  expected?: JsonValue;
  forbiddenChange?: "any" | "increase" | "decrease";
  description?: string;
}

export interface GuidedCaptureConfirmations {
  target: {
    confirmed: true;
    tool: string;
    sideEffecting: true;
  };
  mutationProfile: Confirmation<GuidedMutationProfile["id"]>;
  observer: GuidedObserverConfirmation;
  effect: {
    confirmed: true;
    class: EffectClass;
    expected: JsonValue;
    description: string;
  };
  cardinality: Confirmation<
    "zero_or_one" | "at_most_once" | "exactly_once" | "at_least_once"
  >;
  forbidden: Confirmation<GuidedForbiddenExpectation[]>;
  ordering: Confirmation<OrderingConstraint[]>;
}

export interface GuidedCaptureReviewSummary {
  status: "ready";
  proposalId: string;
  targetTool: string;
  targetClassification: GuidedCallClassification;
  capturedOccurrences: number;
  observerTool: string;
  observerSource: "tool" | "json_command";
  observerSafety: "declared_read_only" | "explicit_unsafe_opt_in";
  effectClass: EffectClass;
  cardinality: GuidedCaptureConfirmations["cardinality"]["value"];
  forbiddenExpectationCount: number;
  orderingConstraintCount: number;
  mutationProfile: GuidedMutationProfile["id"];
  mutationType: MutationType;
  redactionApplied: true;
  validation: "passed";
  warnings: string[];
}

export interface GuidedCaptureReview {
  summary: GuidedCaptureReviewSummary;
  pack: CrashTestPack;
}

interface ToolMetadata {
  name: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

interface CapturedCall {
  sequence: number;
  tool: string;
  arguments: JsonObject;
}

const OUTCOME_ORDER: GuidedOutcomeSignal[] = [
  "committed_response_lost",
  "unknown_commit",
  "transport_failure",
];

/**
 * Produce a deterministic, redacted proposal from an MCP proxy capture.
 * No observer is inferred from a name or description: only tools carrying an
 * explicit MCP readOnlyHint=true annotation become observer candidates.
 */
export function proposeGuidedCapture(
  capture: ProxyCapture,
): GuidedCaptureProposal {
  if (capture.schemaVersion !== 1)
    throw new Error(
      `Unsupported proxy capture schemaVersion ${String(capture.schemaVersion)}.`,
    );

  const safeCapture = redactUnknown(capture) as ProxyCapture;
  const metadata = collectToolMetadata(safeCapture.events);
  const workflow = collectCalls(safeCapture.events).map((call, index) => ({
    id: `captured-${index + 1}-${slugify(call.tool)}`,
    sequence: call.sequence,
    tool: call.tool,
    arguments: call.arguments,
  }));
  const grouped = new Map<string, CapturedCall[]>();
  for (const step of workflow) {
    const calls = grouped.get(step.tool) ?? [];
    calls.push({
      sequence: step.sequence,
      tool: step.tool,
      arguments: step.arguments,
    });
    grouped.set(step.tool, calls);
  }

  const calls = [...grouped.entries()]
    .map(([tool, capturedCalls]) => {
      const toolMetadata = metadata.get(tool);
      const classification = classifyTool(toolMetadata);
      const outcomeSignals = collectOutcomeSignals(safeCapture.events, tool);
      const occurrences = capturedCalls.length;
      return {
        tool,
        classification: classification.value,
        classificationReason: classification.reason,
        occurrences,
        firstSequence: capturedCalls[0]!.sequence,
        argumentSamples: uniqueArguments(capturedCalls),
        outcomeSignals,
        mutationProfiles:
          classification.value === "read_only"
            ? []
            : mutationProfiles(occurrences, outcomeSignals),
      } satisfies GuidedCallProposal;
    })
    .sort(
      (left, right) =>
        left.firstSequence - right.firstSequence ||
        left.tool.localeCompare(right.tool),
    );

  const observerCandidates = [...metadata.values()]
    .filter((tool) => tool.readOnlyHint === true)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (tool) =>
        ({
          tool: tool.name,
          safety: "declared_read_only",
          reason:
            "The captured MCP tools/list metadata explicitly declares readOnlyHint=true.",
        }) satisfies GuidedObserverCandidate,
    );

  const warnings = [
    ...safeCapture.warnings.map((warning) => String(warning)),
    ...(safeCapture.truncated
      ? [
          "The capture is truncated; review the original interaction before confirming this proposal.",
        ]
      : []),
    ...(workflow.length === 0
      ? ["The capture contains no client tools/call requests."]
      : []),
    ...(calls.some((call) => call.classification === "ambiguous")
      ? [
          "One or more called tools lack authoritative readOnlyHint metadata and require an explicit side-effecting confirmation.",
        ]
      : []),
    ...(observerCandidates.length === 0
      ? [
          "No safe observer was found. Add a tool with readOnlyHint=true and capture tools/list; this module will not invent an observer.",
        ]
      : []),
  ];
  const identity = {
    target: safeCapture.target,
    workflow,
    calls,
    observerCandidates,
  } as unknown as JsonValue;

  return {
    schemaVersion: 1,
    proposalId: `guided-${hashJson(identity).slice(0, 16)}`,
    target: safeCapture.target,
    workflow,
    calls,
    sideEffectingCalls: calls.filter(
      (call) => call.classification === "side_effecting",
    ),
    ambiguousCalls: calls.filter((call) => call.classification === "ambiguous"),
    observerCandidates,
    warnings,
  };
}

/**
 * Convert a proposal plus explicit human confirmations into a semantically
 * validated CrashTestPack. Tool observers must be proven read-only by captured
 * MCP metadata. Local JSON command observers require a separate, explicit
 * unsafe opt-in and are never inferred from the capture.
 */
export function confirmGuidedCapture(
  proposal: GuidedCaptureProposal,
  confirmations: GuidedCaptureConfirmations,
): GuidedCaptureReview {
  requireConfirmed(confirmations.target, "target tool");
  requireConfirmed(confirmations.mutationProfile, "mutation profile");
  requireConfirmed(confirmations.observer, "observer");
  requireConfirmed(confirmations.effect, "intended effect");
  requireConfirmed(confirmations.cardinality, "cardinality");
  requireConfirmed(confirmations.forbidden, "forbidden effects");
  requireConfirmed(confirmations.ordering, "ordering constraints");

  const target = proposal.calls.find(
    (call) => call.tool === confirmations.target.tool,
  );
  if (!target)
    throw new Error(
      `Confirmed target tool ${confirmations.target.tool} was not called in the capture.`,
    );
  if (target.classification === "read_only")
    throw new Error(
      `Confirmed target tool ${target.tool} is declared read-only and cannot be authored as a side effect.`,
    );
  if (confirmations.target.sideEffecting !== true)
    throw new Error(
      `Target tool ${target.tool} requires an explicit sideEffecting=true confirmation.`,
    );

  const observer = confirmations.observer;
  if (observer.source === "tool") {
    const safeObserver = proposal.observerCandidates.find(
      (candidate) => candidate.tool === observer.tool,
    );
    if (!safeObserver)
      throw new Error(
        `Unsafe observer refused: ${observer.tool} was not explicitly declared with readOnlyHint=true in the capture.`,
      );
  } else {
    if (observer.explicitUnsafeOptIn !== true)
      throw new Error(
        "Unsafe observer refused: json_command requires explicitUnsafeOptIn=true after manual review.",
      );
    requireNonEmpty(observer.command, "observer command");
  }
  requireNonEmpty(observer.id, "observer id");
  requireNonEmpty(observer.path, "observer path");
  requireNonEmpty(confirmations.effect.description, "effect description");

  const profile = target.mutationProfiles.find(
    (candidate) => candidate.id === confirmations.mutationProfile.value,
  );
  if (!profile)
    throw new Error(
      `Mutation profile ${confirmations.mutationProfile.value} was not proposed for ${target.tool}.`,
    );

  const forbidden = confirmations.forbidden.value.map((expectation, index) => {
    if (
      expectation.expected === undefined &&
      expectation.forbiddenChange === undefined
    )
      throw new Error(
        `Forbidden expectation ${index + 1} requires expected or forbiddenChange.`,
      );
    return {
      effect: observer.id,
      ...(expectation.expected !== undefined
        ? { expected: expectation.expected }
        : {}),
      ...(expectation.forbiddenChange !== undefined
        ? { forbidden_change: expectation.forbiddenChange }
        : {}),
      ...(expectation.description
        ? { description: expectation.description }
        : {}),
    } satisfies EffectExpectation;
  });

  const validSelectors = new Set([
    ...proposal.workflow.map((step) => step.id),
    ...proposal.workflow.map((step) => step.tool),
  ]);
  for (const [index, ordering] of confirmations.ordering.value.entries()) {
    requireNonEmpty(ordering.before, `ordering constraint ${index + 1} before`);
    requireNonEmpty(ordering.after, `ordering constraint ${index + 1} after`);
    if (
      !validSelectors.has(ordering.before) ||
      !validSelectors.has(ordering.after)
    )
      throw new Error(
        `Ordering constraint ${index + 1} must reference a captured tool or step id.`,
      );
  }

  const selectedStepIndex = proposal.workflow.findIndex(
    (step) => step.tool === target.tool,
  );
  const steps = proposal.workflow.map((step, index) => ({
    id: step.id,
    call: step.tool,
    arguments: step.arguments,
    ...(index === selectedStepIndex && profile.retry.maxAttempts > 1
      ? {
          retry: {
            max_attempts: profile.retry.maxAttempts,
            on: profile.retry.on,
          },
        }
      : { retry: { max_attempts: 1 } }),
  }));
  const mutation: Mutation = {
    id: `guided-${slugify(profile.id)}`,
    type: profile.type,
    applies_to: target.tool,
    occurrence: 1,
    seed: 1,
  };
  const contractId = `guided-${slugify(target.tool)}-contract`;
  const assertionId = `guided-${slugify(target.tool)}-captured-call-shape`;
  const pack: CrashTestPack = {
    version: 1,
    id: `guided/${slugify(target.tool)}-${proposal.proposalId.slice(-8)}`,
    name: `Crash contract for ${target.tool}`,
    description:
      "Generated from a redacted MCP capture after explicit human confirmation of the target, observer, effect, cardinality, forbidden effects, ordering, and mutation profile.",
    protocol: "mcp",
    transport: "stdio",
    server: {
      command: proposal.target.command,
      args: proposal.target.args,
      cwd: proposal.target.cwd,
    },
    execution: {
      request_timeout_ms: 10_000,
      max_run_ms: 60_000,
      ...(observer.source === "json_command"
        ? { allow_unsafe_probes: true }
        : {}),
    },
    tags: ["captured", "guided", "human-confirmed", "effect-contract"],
    effect_probes: [
      observer.source === "tool"
        ? {
            id: observer.id,
            source: "tool",
            tool: observer.tool,
            path: observer.path,
            ...(observer.arguments ? { arguments: observer.arguments } : {}),
            ...(observer.description
              ? { description: observer.description }
              : {}),
            safety: "declared_read_only",
          }
        : {
            id: observer.id,
            source: "json_command",
            command: observer.command,
            ...(observer.args?.length ? { args: observer.args } : {}),
            ...(observer.cwd ? { cwd: observer.cwd } : {}),
            ...(observer.env ? { env: observer.env } : {}),
            path: observer.path,
            ...(observer.description
              ? { description: observer.description }
              : {}),
            safety: "explicit_unsafe_opt_in",
          },
    ],
    effect_contracts: [
      {
        id: contractId,
        class: confirmations.effect.class,
        description: confirmations.effect.description,
        tool: target.tool,
        intended: [
          {
            effect: observer.id,
            expected: confirmations.effect.expected,
          },
        ],
        ...(forbidden.length ? { forbidden } : {}),
        cardinality: confirmations.cardinality.value,
        ...(confirmations.ordering.value.length
          ? { ordering: confirmations.ordering.value }
          : {}),
        severity: "blocker",
        remediation:
          "Make the side effect idempotent and reconcile uncertain outcomes before retrying.",
      },
    ],
    steps,
    mutations: [mutation],
    assertions: [
      {
        id: assertionId,
        type: "call_count",
        tool: target.tool,
        exactly: target.occurrences,
        severity: "warning",
        why_it_matters:
          "The captured call shape is supporting evidence; the confirmed effect contract is the blocking correctness gate.",
      },
    ],
    artifacts: {
      remediation:
        "Review machine-specific target paths and rerun the control and mutation cases before committing this generated pack.",
    },
  };

  validatePackSemantics(pack, `guided proposal ${proposal.proposalId}`);
  return {
    summary: {
      status: "ready",
      proposalId: proposal.proposalId,
      targetTool: target.tool,
      targetClassification: target.classification,
      capturedOccurrences: target.occurrences,
      observerTool:
        observer.source === "tool" ? observer.tool : observer.command,
      observerSource: observer.source,
      observerSafety:
        observer.source === "tool"
          ? "declared_read_only"
          : "explicit_unsafe_opt_in",
      effectClass: confirmations.effect.class,
      cardinality: confirmations.cardinality.value,
      forbiddenExpectationCount: forbidden.length,
      orderingConstraintCount: confirmations.ordering.value.length,
      mutationProfile: profile.id,
      mutationType: profile.type,
      redactionApplied: true,
      validation: "passed",
      warnings: proposal.warnings,
    },
    pack,
  };
}

/** Convenience entry point for parent CLI integration. */
export function authorGuidedCapture(
  capture: ProxyCapture,
  confirmations: GuidedCaptureConfirmations,
): GuidedCaptureReview {
  return confirmGuidedCapture(proposeGuidedCapture(capture), confirmations);
}

function collectCalls(events: ProxyCaptureEvent[]): CapturedCall[] {
  return events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.side === "client" &&
        event.kind === "request" &&
        event.method === "tools/call" &&
        typeof event.tool === "string" &&
        isObject(event.message),
    )
    .sort(
      (left, right) =>
        left.event.sequence - right.event.sequence || left.index - right.index,
    )
    .map(({ event }) => {
      const params =
        isObject(event.message) && isObject(event.message.params)
          ? event.message.params
          : {};
      return {
        sequence: event.sequence,
        tool: event.tool!,
        arguments: isObject(params.arguments) ? params.arguments : {},
      };
    });
}

function collectToolMetadata(
  events: ProxyCaptureEvent[],
): Map<string, ToolMetadata> {
  const metadata = new Map<string, ToolMetadata>();
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort(
      (left, right) =>
        left.event.sequence - right.event.sequence || left.index - right.index,
    );
  for (const { event } of ordered) {
    if (event.kind !== "response" || !isObject(event.message)) continue;
    const result = isObject(event.message.result) ? event.message.result : null;
    const tools = result && Array.isArray(result.tools) ? result.tools : [];
    for (const value of tools) {
      if (!isObject(value) || typeof value.name !== "string") continue;
      const annotations = isObject(value.annotations) ? value.annotations : {};
      const current = metadata.get(value.name) ?? { name: value.name };
      metadata.set(value.name, {
        name: value.name,
        readOnlyHint:
          typeof annotations.readOnlyHint === "boolean"
            ? annotations.readOnlyHint
            : current.readOnlyHint,
        destructiveHint:
          typeof annotations.destructiveHint === "boolean"
            ? annotations.destructiveHint
            : current.destructiveHint,
      });
    }
  }
  return metadata;
}

function classifyTool(metadata: ToolMetadata | undefined): {
  value: GuidedCallClassification;
  reason: string;
} {
  if (metadata?.readOnlyHint === true)
    return {
      value: "read_only",
      reason: "Captured MCP metadata declares readOnlyHint=true.",
    };
  if (metadata?.readOnlyHint === false || metadata?.destructiveHint === true)
    return {
      value: "side_effecting",
      reason:
        metadata.destructiveHint === true
          ? "Captured MCP metadata declares destructiveHint=true."
          : "Captured MCP metadata declares readOnlyHint=false.",
    };
  return {
    value: "ambiguous",
    reason:
      "Captured MCP metadata does not authoritatively classify this tool; human confirmation is required.",
  };
}

function collectOutcomeSignals(
  events: ProxyCaptureEvent[],
  tool: string,
): GuidedOutcomeSignal[] {
  const signals = new Set<GuidedOutcomeSignal>();
  for (const event of events) {
    if (event.tool !== tool) continue;
    if (event.commitStatus === "committed" && event.responseStatus === "lost")
      signals.add("committed_response_lost");
    else if (
      event.commitStatus === "unknown" &&
      (event.responseStatus === "lost" || event.kind === "transport_error")
    )
      signals.add("unknown_commit");
    if (event.kind === "transport_error") signals.add("transport_failure");
  }
  return OUTCOME_ORDER.filter((signal) => signals.has(signal));
}

function mutationProfiles(
  occurrences: number,
  outcomes: GuidedOutcomeSignal[],
): GuidedMutationProfile[] {
  const ambiguousCommit: GuidedMutationProfile = {
    id: "ambiguous-commit",
    type: "commit_then_response_lost",
    rationale:
      "Expose retries after the server commits an effect but the client never receives the response.",
    retry: { maxAttempts: 2, on: ["timeout"] },
  };
  const disconnect: GuidedMutationProfile = {
    id: "disconnect-after-commit",
    type: "disconnect_after_commit",
    rationale:
      "Test recovery when the transport disconnects after a committed side effect.",
    retry: { maxAttempts: 2, on: ["transport_error"] },
  };
  const duplicate: GuidedMutationProfile = {
    id: "duplicate-delivery",
    type: "duplicate_call",
    rationale:
      "Test whether duplicate physical delivery creates more than the confirmed effect cardinality.",
    retry: { maxAttempts: 1, on: [] },
  };
  if (outcomes.includes("committed_response_lost"))
    return [ambiguousCommit, duplicate, disconnect];
  return occurrences > 1
    ? [duplicate, ambiguousCommit, disconnect]
    : [ambiguousCommit, duplicate, disconnect];
}

function uniqueArguments(calls: CapturedCall[]): JsonObject[] {
  const seen = new Set<string>();
  const values: JsonObject[] = [];
  for (const call of calls) {
    const key = stableStringify(call.arguments);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(call.arguments);
  }
  return values;
}

function requireConfirmed(
  value: { confirmed?: boolean } | undefined,
  label: string,
): void {
  if (value?.confirmed !== true)
    throw new Error(`Explicit confirmation is required for ${label}.`);
}

function requireNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "captured-tool";
}
