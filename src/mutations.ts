import type {
  AdvancedMutation,
  CallOutcome,
  JsonObject,
  JsonValue,
  Mutation,
  MutationConfig,
  MutationKind,
  MutationPhase,
  MutationRecord,
} from "./types.js";
import { MUTATION_ENGINE_VERSION } from "./types.js";

interface PriorSuccess {
  outcome: CallOutcome;
  eventId: string;
}

export interface PreflightDecision {
  outcome: CallOutcome;
  mutation: MutationConfig;
}

export class MutationController {
  private readonly calls = new Map<string, number>();
  private readonly previousSuccess = new Map<
    string,
    { outcome: CallOutcome; eventId: string }
  >();
  private readonly records: MutationRecord[] = [];

  constructor(
    private readonly mutations: MutationConfig[],
    private readonly defaultSeed?: number,
  ) {}

  matching(tool: string): MutationConfig[] {
    const occurrence = (this.calls.get(tool) ?? 0) + 1;
    this.calls.set(tool, occurrence);
    return this.mutations.filter(
      (mutation) =>
        (mutation.applies_to === undefined || mutation.applies_to === tool) &&
        (mutation.occurrence === undefined ||
          mutation.occurrence === occurrence),
    );
  }

  preflight(
    mutations: MutationConfig[],
    eventId?: string,
  ): PreflightDecision | undefined {
    const denied = mutations.find(
      (mutation) => mutation.type === "permission_denied",
    );
    if (denied) {
      this.record(denied, "blocked", eventId, {
        applicability: "matched_before_underlying_call",
        recovery: "request_authorization_or_choose_an_allowed_tool",
      });
      return {
        mutation: denied,
        outcome: {
          error: {
            kind: "permission_denied",
            message: `Injected permission denial (${denied.id})`,
            retryable: false,
            source: "mutation",
          },
          commitStatus: "not_attempted",
          responseStatus: "returned",
          mutationPhase: "before_underlying_call",
        },
      };
    }

    const limited = mutations.find(
      (mutation): mutation is AdvancedMutation =>
        mutation.type === "rate_limit",
    );
    if (!limited) return undefined;
    const retryAfterMs = Math.max(0, limited.retry_after_ms ?? 1000);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    this.record(limited, "blocked", eventId, {
      applicability: "matched_before_underlying_call",
      retry_after_ms: retryAfterMs,
      retry_after_header: String(retryAfterSeconds),
      recovery: "honor_retry_after_then_retry_with_bounded_backoff",
    });
    return {
      mutation: limited,
      outcome: {
        error: {
          kind: "rate_limit",
          code: 429,
          message: `Injected rate limit (${limited.id}); retry after ${retryAfterMs}ms`,
          retryable: true,
          source: "mutation",
          details: {
            retry_after_ms: retryAfterMs,
            retry_after_header: String(retryAfterSeconds),
            recovery: "honor_retry_after_then_retry_with_bounded_backoff",
          },
        },
        commitStatus: "not_attempted",
        responseStatus: "returned",
        mutationPhase: "before_underlying_call",
      },
    };
  }

  async after(
    original: CallOutcome,
    tool: string,
    mutations: MutationConfig[],
    eventId: string,
    duplicate: (mutation: Mutation) => Promise<CallOutcome>,
    requestContext?: JsonObject,
    budgetMs?: number,
  ): Promise<CallOutcome> {
    const prior = this.previousSuccess.get(contextKey(tool, requestContext));
    let result = original;
    for (const mutation of mutations) {
      result = await this.apply(
        result,
        tool,
        mutation,
        eventId,
        prior,
        duplicate,
        budgetMs,
      );
    }
    if (!original.error)
      this.previousSuccess.set(contextKey(tool, requestContext), {
        outcome: original,
        eventId,
      });
    return result;
  }

  recordsForReport(): MutationRecord[] {
    const applied = new Set(this.records.map((record) => record.id));
    const unmatched = this.mutations
      .filter((mutation) => !applied.has(mutation.id))
      .map((mutation) => this.toRecord(mutation, "not_matched"));
    return [...this.records, ...unmatched];
  }

  markFailed(mutations: MutationConfig[], eventId: string): void {
    for (const mutation of mutations) {
      if (
        !this.records.some(
          (record) =>
            record.id === mutation.id &&
            (record.appliedAtEvent === eventId ||
              record.requestedAtEvent === eventId),
        )
      )
        this.record(mutation, "failed", eventId);
    }
  }

  private async apply(
    original: CallOutcome,
    tool: string,
    mutation: MutationConfig,
    eventId: string,
    prior: PriorSuccess | undefined,
    duplicate: (mutation: Mutation) => Promise<CallOutcome>,
    budgetMs?: number,
  ): Promise<CallOutcome> {
    switch (mutation.type) {
      case "timeout":
        if ((mutation.duration_ms ?? 0) > 0) {
          const duration = mutation.duration_ms!;
          const delay =
            budgetMs === undefined
              ? duration
              : Math.min(duration, Math.max(1, budgetMs));
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (budgetMs !== undefined && duration > budgetMs) {
            this.record(mutation, "failed", eventId);
            throw new Error(
              `Injected timeout ${mutation.id} exceeded the remaining run budget.`,
            );
          }
        }
        this.record(mutation, "applied", eventId);
        return {
          error: {
            kind: "timeout",
            message: `Injected timeout (${mutation.id})`,
            retryable: true,
            source: "mutation",
          },
          commitStatus: original.error
            ? (original.commitStatus ?? "unknown")
            : "committed",
          responseStatus: "lost",
          mutationPhase: "after_commit_before_response",
        };
      case "retryable_error":
        this.record(mutation, "applied", eventId);
        return {
          error: {
            kind: "retryable_error",
            message: `Injected retryable error (${mutation.id})`,
            retryable: true,
            source: "mutation",
          },
          commitStatus: original.error ? "unknown" : "committed",
          responseStatus: "returned",
          mutationPhase: "after_response_before_client",
        };
      case "malformed_result":
        this.record(mutation, "applied", eventId);
        return {
          output: "__agent_crash_test_malformed_result__",
          raw: original.raw,
          commitStatus: original.error ? "unknown" : "committed",
          responseStatus: "corrupted",
          mutationPhase: "after_response_before_client",
        };
      case "stale_result":
        if (!prior) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_no_prior_success_for_context",
            target_event_id: eventId,
          });
          return original;
        }
        this.record(mutation, "applied", eventId, {
          source_event_id: prior.eventId,
          target_event_id: eventId,
        });
        return {
          ...prior.outcome,
          responseStatus: "returned",
          mutationPhase: "after_response_before_client",
        };
      case "commit_then_response_lost":
        this.record(mutation, "applied", eventId);
        return {
          error: {
            kind: "timeout",
            message: `Injected response loss after commit (${mutation.id})`,
            retryable: true,
            source: "mutation",
          },
          commitStatus: original.error
            ? (original.commitStatus ?? "unknown")
            : "committed",
          responseStatus: "lost",
          mutationPhase: "after_commit_before_response",
        };
      case "disconnect_after_commit":
        this.record(mutation, "applied", eventId);
        return {
          error: {
            kind: "transport_error",
            message: `Injected disconnect after commit (${mutation.id})`,
            retryable: true,
            source: "mutation",
          },
          commitStatus: original.error
            ? (original.commitStatus ?? "unknown")
            : "committed",
          responseStatus: "lost",
          mutationPhase: "client_visible_transport_failure",
        };
      case "partial_success":
        this.record(mutation, "applied", eventId);
        return {
          error: {
            kind: "retryable_error",
            message: `Injected partial success (${mutation.id})`,
            retryable: true,
            source: "mutation",
          },
          output: original.output,
          raw: original.raw,
          commitStatus: original.error
            ? (original.commitStatus ?? "unknown")
            : "committed",
          responseStatus: "returned",
          mutationPhase: "after_commit_before_response",
        };
      case "stale_read_then_conflicting_write":
        if (!prior) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_no_prior_success_for_context",
            target_event_id: eventId,
          });
          return original;
        }
        this.record(mutation, "applied", eventId, {
          source_event_id: prior.eventId,
          target_event_id: eventId,
        });
        return {
          ...prior.outcome,
          responseStatus: "returned",
          mutationPhase: "observer_only",
        };
      case "schema_drift": {
        if (original.output === undefined || !mutation.remove_path) {
          this.record(mutation, "failed", eventId, {
            reason:
              original.output === undefined
                ? "not_applicable_no_output"
                : "not_applicable_remove_path_required",
            recovery: "set_remove_path_to_an_existing_response_field",
          });
          return original;
        }
        const removed = removeAtPath(original.output, mutation.remove_path);
        if (!removed.changed) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_path_not_found",
            remove_path: mutation.remove_path,
            recovery: "verify_remove_path_against_the_current_tool_schema",
          });
          return original;
        }
        this.record(mutation, "applied", eventId, {
          applicability: "response_field_found",
          remove_path: mutation.remove_path,
          transformation: "field_removed",
          recovery:
            "treat_missing_optional_fields_as_absent_and_validate_required_fields",
        });
        return {
          ...original,
          output: removed.value,
          responseStatus: "corrupted",
          mutationPhase: "after_response_before_client",
        };
      }
      case "truncated_response": {
        if (original.output === undefined) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_no_output",
            recovery: "target_a_call_that_returns_a_response_body",
          });
          return original;
        }
        const limit = Math.max(0, mutation.truncate_after_bytes ?? 64);
        const serialized =
          typeof original.output === "string"
            ? original.output
            : JSON.stringify(original.output);
        const bytes = Buffer.from(serialized, "utf8");
        if (bytes.length <= limit) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_response_within_truncation_boundary",
            original_bytes: bytes.length,
            truncate_after_bytes: limit,
            recovery: "lower_truncate_after_bytes_or_target_a_larger_response",
          });
          return original;
        }
        const truncated = bytes.subarray(0, limit).toString("utf8");
        this.record(mutation, "applied", eventId, {
          applicability: "response_exceeds_truncation_boundary",
          original_bytes: bytes.length,
          delivered_bytes: Buffer.byteLength(truncated, "utf8"),
          truncate_after_bytes: limit,
          transformation: "utf8_byte_prefix_delivered",
          recovery:
            "reject_incomplete_payloads_without_replaying_unsafe_effects",
        });
        return {
          ...original,
          output: truncated,
          responseStatus: "corrupted",
          mutationPhase: "after_response_before_client",
        };
      }
      case "out_of_order_response":
        if (!prior) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_no_prior_success_for_context",
            target_event_id: eventId,
            representation: "prior_success_delivered_for_current_request",
            recovery:
              "exercise_at_least_two_calls_with_the_same_tool_and_request_context",
          });
          return original;
        }
        this.record(mutation, "applied", eventId, {
          applicability: "prior_success_exists_for_context",
          source_event_id: prior.eventId,
          target_event_id: eventId,
          representation: "prior_success_delivered_for_current_request",
          recovery:
            "correlate_responses_to_requests_and_ignore_late_or_duplicate_results",
        });
        return {
          ...prior.outcome,
          correlationId: original.correlationId,
          responseStatus: "returned",
          mutationPhase: "after_response_before_client",
        };
      case "corrupted_pagination_cursor": {
        if (original.output === undefined) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_no_output",
            recovery: "target_a_paginated_response",
          });
          return original;
        }
        const cursorPath =
          mutation.cursor_path ?? discoverCursorPath(original.output);
        if (!cursorPath) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_cursor_not_found",
            recovery: "set_cursor_path_or_target_a_paginated_response",
          });
          return original;
        }
        const replacement =
          mutation.replacement === undefined
            ? "__agent_crash_test_invalid_cursor__"
            : mutation.replacement;
        const corrupted = replaceAtPath(
          original.output,
          cursorPath,
          replacement,
        );
        if (!corrupted.changed) {
          this.record(mutation, "failed", eventId, {
            reason: "not_applicable_cursor_path_not_found",
            cursor_path: cursorPath,
            recovery: "verify_cursor_path_against_the_current_response",
          });
          return original;
        }
        this.record(mutation, "applied", eventId, {
          applicability: "cursor_field_found",
          cursor_path: cursorPath,
          transformation: "cursor_replaced_with_invalid_sentinel",
          recovery:
            "surface_cursor_errors_without_restarting_or_duplicating_processed_pages",
        });
        return {
          ...original,
          output: corrupted.value,
          responseStatus: "corrupted",
          mutationPhase: "after_response_before_client",
        };
      }
      case "slow_stream": {
        const duration = Math.max(0, mutation.duration_ms ?? 1000);
        await delayWithinBudget(
          duration,
          budgetMs,
          mutation,
          eventId,
          (extra) => this.record(mutation, "failed", eventId, extra),
        );
        this.record(mutation, "applied", eventId, {
          applicability: "response_delivery_boundary",
          duration_ms: duration,
          representation: "delayed_complete_response_no_intermediate_chunks",
          recovery:
            "use_progress_aware_deadlines_and_avoid_replaying_committed_effects",
        });
        return {
          ...original,
          commitStatus: original.error
            ? (original.commitStatus ?? "unknown")
            : "committed",
          responseStatus: original.responseStatus ?? "returned",
          mutationPhase: "during_underlying_call",
        };
      }
      case "progress_stall": {
        const duration = Math.max(0, mutation.duration_ms ?? 1000);
        await delayWithinBudget(
          duration,
          budgetMs,
          mutation,
          eventId,
          (extra) => this.record(mutation, "failed", eventId, extra),
        );
        this.record(mutation, "applied", eventId, {
          applicability: "response_delivery_boundary",
          duration_ms: duration,
          representation: "no_progress_until_timeout",
          recovery:
            "cancel_stalled_work_then_reconcile_commit_status_before_retry",
        });
        return {
          error: {
            kind: "timeout",
            message: `Injected progress stall (${mutation.id}) after ${duration}ms without progress`,
            retryable: true,
            source: "mutation",
            details: {
              stall_duration_ms: duration,
              progress_events: 0,
              recovery: "reconcile_commit_status_before_retry",
            },
          },
          commitStatus: original.error
            ? (original.commitStatus ?? "unknown")
            : "committed",
          responseStatus: "lost",
          mutationPhase: "during_underlying_call",
        };
      }
      case "rate_limit":
        this.record(mutation, "failed", eventId, {
          reason: "rate_limit_requires_preflight",
          recovery: "call_preflight_before_the_underlying_tool",
        });
        return original;
      case "duplicate_call":
        await duplicate(mutation as Mutation);
        this.record(mutation, "applied", eventId);
        return original;
      case "permission_denied":
        return original;
    }
  }

  private record(
    mutation: MutationConfig,
    result: MutationRecord["result"],
    eventId?: string,
    extraParameters?: JsonObject,
  ): void {
    this.records.push(
      this.toRecord(mutation, result, eventId, extraParameters),
    );
  }

  private toRecord(
    mutation: MutationConfig,
    result: MutationRecord["result"],
    eventId?: string,
    extraParameters?: JsonObject,
  ): MutationRecord {
    const parameters: JsonObject = {};
    if (mutation.duration_ms !== undefined)
      parameters.duration_ms = mutation.duration_ms;
    if ("retry_after_ms" in mutation && mutation.retry_after_ms !== undefined)
      parameters.retry_after_ms = mutation.retry_after_ms;
    if ("remove_path" in mutation && mutation.remove_path !== undefined)
      parameters.remove_path = mutation.remove_path;
    if (
      "truncate_after_bytes" in mutation &&
      mutation.truncate_after_bytes !== undefined
    )
      parameters.truncate_after_bytes = mutation.truncate_after_bytes;
    if ("cursor_path" in mutation && mutation.cursor_path !== undefined)
      parameters.cursor_path = mutation.cursor_path;
    if (mutation.occurrence !== undefined)
      parameters.occurrence = mutation.occurrence;
    if (mutation.type === "permission_denied")
      parameters.injection_phase = "preflight";
    else if (
      [
        "timeout",
        "retryable_error",
        "malformed_result",
        "stale_result",
        "duplicate_call",
        "commit_then_response_lost",
        "disconnect_after_commit",
        "partial_success",
        "stale_read_then_conflicting_write",
        "schema_drift",
        "truncated_response",
        "out_of_order_response",
        "corrupted_pagination_cursor",
        "slow_stream",
        "progress_stall",
      ].includes(mutation.type)
    )
      parameters.injection_phase = "after_underlying_call";
    Object.assign(parameters, extraParameters ?? {});
    return {
      id: mutation.id,
      type: mutation.type,
      version: mutation.version ?? MUTATION_ENGINE_VERSION,
      seed: mutation.seed ?? this.defaultSeed,
      appliesTo: mutation.applies_to,
      occurrence: mutation.occurrence,
      requestedAtEvent: eventId,
      appliedAtEvent: result === "applied" ? eventId : undefined,
      parameters,
      phase: mutation.phase ?? defaultMutationPhase(mutation.type),
      result,
    };
  }
}

function defaultMutationPhase(type: MutationKind): MutationPhase {
  switch (type) {
    case "permission_denied":
      return "before_underlying_call";
    case "timeout":
    case "commit_then_response_lost":
      return "after_commit_before_response";
    case "disconnect_after_commit":
      return "client_visible_transport_failure";
    case "malformed_result":
    case "stale_result":
    case "retryable_error":
    case "duplicate_call":
      return "after_response_before_client";
    case "partial_success":
      return "after_commit_before_response";
    case "stale_read_then_conflicting_write":
      return "observer_only";
    case "rate_limit":
      return "before_underlying_call";
    case "schema_drift":
    case "truncated_response":
    case "out_of_order_response":
    case "corrupted_pagination_cursor":
      return "after_response_before_client";
    case "slow_stream":
    case "progress_stall":
      return "during_underlying_call";
  }
}

async function delayWithinBudget(
  durationMs: number,
  budgetMs: number | undefined,
  mutation: MutationConfig,
  eventId: string,
  onFailure: (details: JsonObject) => void,
): Promise<void> {
  const delay =
    budgetMs === undefined
      ? durationMs
      : Math.min(durationMs, Math.max(1, budgetMs));
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (budgetMs !== undefined && durationMs > budgetMs) {
    onFailure({
      reason: "mutation_exceeded_remaining_run_budget",
      duration_ms: durationMs,
      remaining_budget_ms: budgetMs,
      recovery: "increase_the_run_budget_or_reduce_duration_ms",
      target_event_id: eventId,
    });
    throw new Error(
      `Injected ${mutation.type} ${mutation.id} exceeded the remaining run budget.`,
    );
  }
}

function removeAtPath(
  source: JsonValue,
  path: string,
): { value: JsonValue; changed: boolean } {
  return editAtPath(source, path, undefined, true);
}

function replaceAtPath(
  source: JsonValue,
  path: string,
  replacement: JsonValue,
): { value: JsonValue; changed: boolean } {
  return editAtPath(source, path, replacement, false);
}

function editAtPath(
  source: JsonValue,
  path: string,
  replacement: JsonValue | undefined,
  remove: boolean,
): { value: JsonValue; changed: boolean } {
  const segments = pathSegments(path);
  if (!segments.length) return { value: source, changed: false };
  const value = cloneJson(source);
  let parent: JsonValue = value;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(parent)) {
      const index = arrayIndex(segment, parent.length);
      if (index === undefined) return { value: source, changed: false };
      parent = parent[index]!;
    } else if (isJsonObject(parent) && segment in parent) {
      parent = parent[segment]!;
    } else return { value: source, changed: false };
  }
  const leaf = segments.at(-1)!;
  if (Array.isArray(parent)) {
    const index = arrayIndex(leaf, parent.length);
    if (index === undefined) return { value: source, changed: false };
    if (remove) parent.splice(index, 1);
    else parent[index] = replacement!;
    return { value, changed: true };
  }
  if (!isJsonObject(parent) || !(leaf in parent))
    return { value: source, changed: false };
  if (remove) delete parent[leaf];
  else parent[leaf] = replacement!;
  return { value, changed: true };
}

function discoverCursorPath(value: JsonValue): string | undefined {
  const cursorNames = new Set([
    "next_cursor",
    "nextCursor",
    "cursor",
    "continuation_token",
    "continuationToken",
  ]);
  const visit = (
    current: JsonValue,
    segments: string[],
  ): string | undefined => {
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index++) {
        const found = visit(current[index]!, [...segments, String(index)]);
        if (found) return found;
      }
      return undefined;
    }
    if (!isJsonObject(current)) return undefined;
    for (const key of Object.keys(current).sort())
      if (cursorNames.has(key)) return jsonPointer([...segments, key]);
    for (const key of Object.keys(current).sort()) {
      const found = visit(current[key]!, [...segments, key]);
      if (found) return found;
    }
    return undefined;
  };
  return visit(value, []);
}

function pathSegments(path: string): string[] {
  if (path.startsWith("/"))
    return path
      .slice(1)
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  const withoutRoot = path.startsWith("$.") ? path.slice(2) : path;
  return withoutRoot.split(".").filter(Boolean);
}

function jsonPointer(segments: string[]): string {
  return `/${segments
    .map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

function arrayIndex(segment: string, length: number): number | undefined {
  if (!/^\d+$/.test(segment)) return undefined;
  const index = Number(segment);
  return index < length ? index : undefined;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextKey(tool: string, requestContext?: JsonObject): string {
  const requestId =
    requestContext?.request_id ??
    requestContext?.idempotency_key ??
    requestContext?.idempotencyKey;
  return `${tool}:${typeof requestId === "string" || typeof requestId === "number" ? String(requestId) : "*"}`;
}
