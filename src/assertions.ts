import { getPath, jsonEqual } from "./json-path.js";
import { stateContractEffectId } from "./pack.js";
import type {
  Assertion,
  AssertionResult,
  CallEvent,
  EffectContract,
  EffectExpectation,
  EffectValue,
  Finding,
  JsonValue,
  Severity,
  StateContract,
  StateContractEffect,
  ToolManifest,
} from "./types.js";

export interface AssertionContext {
  command: string;
  source: string;
  workingDirectory?: string;
  mutationIds?: string[];
  seed?: number;
}

function relevantEventIds(
  events: CallEvent[],
  assertion: Assertion,
  effect?: EffectValue,
): string[] {
  const selected = assertion.tool
    ? events.filter((event) => event.tool === assertion.tool)
    : assertion.step
      ? events.filter((event) => event.stepId === assertion.step)
      : events.filter((event) => event.kind !== "effect_probe");
  const ids = selected.map((event) => event.eventId);
  if (effect?.probeEventId && !ids.includes(effect.probeEventId))
    ids.push(effect.probeEventId);
  return ids;
}

function firstDivergentEventId(
  events: CallEvent[],
  assertion: Assertion,
  effect?: EffectValue,
): string | undefined {
  if (effect?.probeEventId) {
    const probeIndex = events.findIndex(
      (event) => event.eventId === effect.probeEventId,
    );
    const scenarioEvents = events
      .slice(0, probeIndex < 0 ? events.length : probeIndex)
      .filter((event) => event.kind !== "effect_probe");
    if (scenarioEvents.length) return scenarioEvents.at(-1)?.eventId;
  }
  const relevant = events.filter(
    (event) =>
      event.kind !== "effect_probe" &&
      (assertion.tool
        ? event.tool === assertion.tool
        : assertion.step
          ? event.stepId === assertion.step
          : true),
  );
  return relevant.at(-1)?.eventId;
}

function failure(
  assertion: Assertion,
  context: AssertionContext,
  message: string,
  expected: JsonValue | undefined,
  observed: JsonValue | undefined,
  events: CallEvent[],
  effect?: EffectValue,
  evidence?: JsonValue,
  category: Finding["category"] = "assertion_failure",
): AssertionResult {
  const severity: Severity = assertion.severity ?? "error";
  const finding: Finding = {
    id: assertion.id,
    severity,
    status: "failed",
    category,
    message,
    effectId: effect?.id ?? assertion.effect,
    whyItMatters: assertion.why_it_matters,
    expected,
    observed,
    evidence,
    evidenceEventIds: relevantEventIds(events, assertion, effect),
    firstDivergentEventId: firstDivergentEventId(events, assertion, effect),
    remediation: assertion.remediation,
    reproduction: {
      command: context.command,
      workingDirectory: context.workingDirectory,
      packPath: context.source,
      mutationIds: context.mutationIds,
      seed: context.seed,
    },
    redactionApplied: true,
  };
  return { id: assertion.id, passed: false, finding };
}

function pass(id: string): AssertionResult {
  return { id, passed: true };
}

function display(value: JsonValue | undefined): string {
  return JSON.stringify(value ?? null);
}

function hasRepeatedInvocation(events: CallEvent[]): boolean {
  const scenario = events.filter(
    (event) => event.kind !== "effect_probe" && event.physicalCall,
  );
  return scenario.some(
    (event) => event.kind === "duplicate" || event.kind === "retry",
  );
}

function transitionCategory(
  expected: JsonValue | undefined,
  observed: JsonValue | undefined,
  events: CallEvent[],
): Finding["category"] {
  if (observed === undefined) return "missing_effect";
  if (typeof expected === "number" && typeof observed === "number") {
    if (observed < expected) return "missing_effect";
    if (observed > expected)
      return hasRepeatedInvocation(events)
        ? "duplicate_transition"
        : "extra_transition";
  }
  return "changed_effect";
}

export function evaluateAssertions(
  assertions: Assertion[],
  events: CallEvent[],
  effects: EffectValue[],
  captures: Map<string, JsonValue | undefined>,
  manifest: ToolManifest[],
  context: AssertionContext,
): AssertionResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case "effect_equals":
      case "state_path_equals": {
        const effect = effects.find((item) => item.id === assertion.effect);
        const value = assertion.path
          ? getPath(effect?.value, assertion.path)
          : effect?.value;
        if (!effect)
          return failure(
            assertion,
            context,
            `Effect ${assertion.effect} was not observed; the assertion cannot pass without an effect source.`,
            assertion.expected,
            undefined,
            events,
            undefined,
            undefined,
            "missing_effect",
          );
        if (effect.error)
          return failure(
            assertion,
            context,
            `Effect probe ${assertion.effect} failed with ${effect.error.kind}: ${effect.error.message}`,
            assertion.expected,
            undefined,
            events,
            effect,
            undefined,
            "probe_error",
          );
        return jsonEqual(value, assertion.expected)
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              `Expected effect ${assertion.effect} to equal ${display(assertion.expected)}, received ${display(value)}.`,
              assertion.expected,
              value,
              events,
              effect,
              { expected: assertion.expected ?? null, actual: value ?? null },
              transitionCategory(assertion.expected, value, events),
            );
      }
      case "no_extra_transition": {
        const effect = effects.find((item) => item.id === assertion.effect);
        if (!effect)
          return failure(
            assertion,
            context,
            `Effect ${assertion.effect} was not observed; the transition cannot be evaluated.`,
            assertion.expected,
            undefined,
            events,
            undefined,
            undefined,
            "missing_effect",
          );
        if (effect.error)
          return failure(
            assertion,
            context,
            `Effect probe ${assertion.effect} failed with ${effect.error.kind}: ${effect.error.message}`,
            assertion.expected,
            undefined,
            events,
            effect,
            undefined,
            "probe_error",
          );
        const value = assertion.path
          ? getPath(effect?.value, assertion.path)
          : effect?.value;
        const before = assertion.path
          ? getPath(effect?.before, assertion.path)
          : effect?.before;
        const after = assertion.path
          ? getPath(effect?.after ?? effect?.value, assertion.path)
          : (effect?.after ?? effect?.value);
        const violates = assertion.forbidden_change
          ? violatesChange(before, after, assertion.forbidden_change)
          : assertion.expected !== undefined
            ? !jsonEqual(after, assertion.expected)
            : !jsonEqual(before, after);
        return !violates
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              `Observed an unexpected state transition in ${assertion.effect}: expected ${display(assertion.expected)}, received ${display(after ?? value)}.`,
              assertion.expected,
              after ?? value,
              events,
              effect,
              { before: before ?? null, after: after ?? value ?? null },
              assertion.forbidden_change
                ? "extra_transition"
                : transitionCategory(
                    assertion.expected,
                    after ?? value,
                    events,
                  ),
            );
      }
      case "effect_not_equals": {
        const effect = effects.find((item) => item.id === assertion.effect);
        if (!effect)
          return failure(
            assertion,
            context,
            `Effect ${assertion.effect} was not observed; the negative assertion cannot pass without an effect source.`,
            assertion.expected,
            undefined,
            events,
            undefined,
            undefined,
            "missing_effect",
          );
        if (effect.error)
          return failure(
            assertion,
            context,
            `Effect probe ${assertion.effect} failed with ${effect.error.kind}: ${effect.error.message}`,
            assertion.expected,
            undefined,
            events,
            effect,
            undefined,
            "probe_error",
          );
        const value = assertion.path
          ? getPath(effect?.value, assertion.path)
          : effect?.value;
        return !jsonEqual(value, assertion.expected)
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              `Expected effect ${assertion.effect} not to equal ${display(assertion.expected)}.`,
              assertion.expected,
              value,
              events,
              effect,
              { actual: value ?? null },
              "changed_effect",
            );
      }
      case "must_not_call": {
        const calls = events.filter(
          (event) =>
            event.kind !== "effect_probe" &&
            event.physicalCall &&
            event.tool === assertion.tool &&
            (!assertion.step || event.stepId === assertion.step),
        );
        return calls.length === 0
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              `Tool ${assertion.tool} was called ${calls.length} time(s), but the contract forbids it.`,
              0,
              calls.length,
              events,
              undefined,
              calls as unknown as JsonValue,
            );
      }
      case "call_count": {
        const calls = events.filter(
          (event) =>
            event.kind !== "effect_probe" &&
            event.physicalCall &&
            event.tool === assertion.tool,
        );
        const expected = assertion.exactly;
        const atMost = assertion.at_most ?? assertion.max;
        const valid =
          atMost !== undefined
            ? calls.length <= atMost
            : expected !== undefined && calls.length === expected;
        return valid
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              atMost !== undefined
                ? `Expected ${assertion.tool} to be called at most ${atMost} time(s), received ${calls.length}.`
                : `Expected ${assertion.tool} to be called exactly ${expected ?? "a configured number of"} time(s), received ${calls.length}.`,
              expected ?? atMost,
              calls.length,
              events,
              undefined,
              calls as unknown as JsonValue,
            );
      }
      case "result_path_equals": {
        const captured = captures.get(assertion.step ?? "");
        const value = getPath(captured, assertion.path ?? "");
        return jsonEqual(value, assertion.expected)
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              `Expected result path ${assertion.path} from step ${assertion.step} to equal ${display(assertion.expected)}, received ${display(value)}.`,
              assertion.expected,
              value,
              events,
              undefined,
              { expected: assertion.expected ?? null, actual: value ?? null },
            );
      }
      case "annotation_matches": {
        const tool = manifest.find((item) => item.name === assertion.tool);
        const value = assertion.annotation
          ? tool?.annotations?.[assertion.annotation]
          : undefined;
        return jsonEqual(value, assertion.expected)
          ? pass(assertion.id)
          : failure(
              assertion,
              context,
              `Expected declared ${assertion.tool} annotation ${assertion.annotation} to equal ${display(assertion.expected)}.`,
              assertion.expected,
              value,
              events,
              undefined,
              { actual: value ?? null },
            );
      }
    }
  });
}

export function evaluateStateContract(
  contract: StateContract,
  effects: EffectValue[],
  events: CallEvent[],
  context: AssertionContext,
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const evaluate = (
    entry: StateContractEffect,
    forbidden: boolean,
    index: number,
  ) => {
    const effect =
      effects.find((item) => item.id === entry.effect) ??
      effects.find(
        (item) =>
          !entry.effect &&
          item.source === "fixture_state" &&
          item.path === entry.path,
      );
    const id = stateContractEffectId(entry, forbidden, index);
    const assertion: Assertion = {
      id,
      type: forbidden ? "no_extra_transition" : "effect_equals",
      effect: effect?.id ?? entry.effect ?? id,
      expected: entry.expected,
      forbidden_change: entry.forbidden_change,
      remediation: entry.description,
    };
    if (!effect) {
      results.push(
        failure(
          assertion,
          context,
          `State contract path ${entry.path} was not observed.`,
          entry.expected,
          undefined,
          events,
          undefined,
          { path: entry.path, observed: null },
          "missing_effect",
        ),
      );
      return;
    }
    const before = effect.before;
    const after = effect.after ?? effect.value;
    const passes = forbidden
      ? entry.forbidden_change
        ? !violatesChange(before, after, entry.forbidden_change)
        : jsonEqual(before, after)
      : entry.expected_delta !== undefined
        ? typeof before === "number" &&
          typeof after === "number" &&
          after - before === entry.expected_delta
        : entry.expected !== undefined
          ? jsonEqual(after, entry.expected)
          : true;
    results.push(
      passes
        ? pass(id)
        : failure(
            assertion,
            context,
            `State contract ${entry.path} did not match the expected transition.`,
            entry.expected_delta !== undefined
              ? entry.expected_delta
              : entry.expected,
            after,
            events,
            effect,
            {
              before: before ?? null,
              after: after ?? null,
              expectedDelta: entry.expected_delta ?? null,
            },
            forbidden
              ? "extra_transition"
              : entry.expected_delta !== undefined &&
                  typeof before === "number" &&
                  typeof after === "number"
                ? after - before < entry.expected_delta
                  ? "missing_effect"
                  : after - before > entry.expected_delta
                    ? hasRepeatedInvocation(events)
                      ? "duplicate_transition"
                      : "extra_transition"
                    : "changed_effect"
                : transitionCategory(entry.expected, after, events),
          ),
    );
  };
  (contract.effects ?? []).forEach((entry, index) =>
    evaluate(entry, false, index),
  );
  (contract.forbidden ?? []).forEach((entry, index) =>
    evaluate(entry, true, index),
  );
  return results;
}

/** Evaluate the versioned effect contract layer using the same finding model as v1 assertions. */
export function evaluateEffectContracts(
  contracts: EffectContract[],
  effects: EffectValue[],
  events: CallEvent[],
  context: AssertionContext,
): AssertionResult[] {
  const results: AssertionResult[] = [];
  for (const contract of contracts) {
    const base = (id: string, effect?: string): Assertion => ({
      id,
      type: "effect_equals",
      effect,
      expected: null,
      severity: contract.severity,
      remediation: contract.remediation,
      why_it_matters: contract.description,
    });
    for (const [index, expectation] of (contract.preconditions ?? []).entries())
      results.push(
        evaluateContractExpectation(
          contract,
          expectation,
          effects,
          events,
          context,
          base(`${contract.id}-precondition-${index + 1}`, expectation.effect),
          "before",
        ),
      );
    for (const [index, expectation] of contract.intended.entries())
      results.push(
        evaluateContractExpectation(
          contract,
          expectation,
          effects,
          events,
          context,
          base(`${contract.id}-intended-${index + 1}`, expectation.effect),
          "after",
        ),
      );
    for (const [index, expectation] of (contract.forbidden ?? []).entries())
      results.push(
        evaluateForbiddenExpectation(
          contract,
          expectation,
          effects,
          events,
          context,
          base(`${contract.id}-forbidden-${index + 1}`, expectation.effect),
        ),
      );
    if (contract.cardinality && contract.tool)
      results.push(
        evaluateCardinality(
          contract,
          events,
          context,
          base(`${contract.id}-cardinality`),
        ),
      );
    for (const [index, ordering] of (contract.ordering ?? []).entries())
      results.push(
        evaluateOrdering(
          contract,
          ordering.before,
          ordering.after,
          ordering.description,
          events,
          context,
          base(`${contract.id}-ordering-${index + 1}`),
        ),
      );
    if (contract.authorization?.argument && contract.tool)
      results.push(
        evaluateAuthorization(
          contract,
          events,
          context,
          base(`${contract.id}-authorization`),
        ),
      );
    if (contract.recovery && contract.tool)
      results.push(
        evaluateRecovery(
          contract,
          events,
          context,
          base(`${contract.id}-recovery`),
        ),
      );
  }
  return results;
}

function evaluateContractExpectation(
  contract: EffectContract,
  expectation: EffectExpectation,
  effects: EffectValue[],
  events: CallEvent[],
  context: AssertionContext,
  assertion: Assertion,
  phase: "before" | "after",
): AssertionResult {
  const effect = effects.find((item) => item.id === expectation.effect);
  const selected =
    phase === "before" ? effect?.before : (effect?.after ?? effect?.value);
  const before = expectation.path
    ? getPath(effect?.before, expectation.path)
    : effect?.before;
  const value = expectation.path
    ? getPath(selected, expectation.path)
    : selected;
  if (!effect)
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} references an unobserved effect ${expectation.effect}.`,
      expectation.expected,
      undefined,
      events,
      undefined,
      undefined,
      "missing_effect",
    );
  if (effect.error)
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} could not observe ${expectation.effect}: ${effect.error.message}`,
      expectation.expected,
      undefined,
      events,
      effect,
      undefined,
      "probe_error",
    );
  if (phase === "before" && effect.before === undefined)
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} requires a before snapshot for precondition ${expectation.effect}.`,
      expectation.expected,
      undefined,
      events,
      effect,
      undefined,
      "missing_effect",
    );
  const matches = expectation.forbidden_change
    ? phase === "after" &&
      !violatesChange(before, value, expectation.forbidden_change)
    : jsonEqual(value, expectation.expected);
  return matches
    ? pass(assertion.id)
    : failure(
        assertion,
        context,
        expectation.forbidden_change
          ? `Effect contract ${contract.id} expected ${expectation.effect} not to ${expectation.forbidden_change} between the before and after snapshots, but observed ${display(value)}.`
          : `Effect contract ${contract.id} expected ${expectation.effect} ${phase} the workflow to equal ${display(expectation.expected)}, received ${display(value)}.`,
        expectation.expected,
        value,
        events,
        effect,
        {
          expected: expectation.expected ?? null,
          actual: value ?? null,
          ...(expectation.forbidden_change
            ? {
                before: before ?? null,
                forbiddenChange: expectation.forbidden_change,
              }
            : {}),
        },
        expectation.forbidden_change
          ? "extra_transition"
          : transitionCategory(expectation.expected, value, events),
      );
}

function evaluateForbiddenExpectation(
  contract: EffectContract,
  expectation: EffectExpectation,
  effects: EffectValue[],
  events: CallEvent[],
  context: AssertionContext,
  assertion: Assertion,
): AssertionResult {
  const effect = effects.find((item) => item.id === expectation.effect);
  if (!effect)
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} references an unobserved forbidden effect ${expectation.effect}.`,
      expectation.expected,
      undefined,
      events,
      undefined,
      undefined,
      "missing_effect",
    );
  if (effect.error)
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} could not observe forbidden effect ${expectation.effect}: ${effect.error.message}`,
      expectation.expected,
      undefined,
      events,
      effect,
      undefined,
      "probe_error",
    );
  const after = expectation.path
    ? getPath(effect.after ?? effect.value, expectation.path)
    : (effect.after ?? effect.value);
  const before = expectation.path
    ? getPath(effect.before, expectation.path)
    : effect.before;
  const violated = expectation.forbidden_change
    ? violatesChange(before, after, expectation.forbidden_change)
    : expectation.expected !== undefined
      ? jsonEqual(after, expectation.expected)
      : before === undefined
        ? true
        : !jsonEqual(before, after);
  return violated
    ? failure(
        assertion,
        context,
        `Effect contract ${contract.id} observed forbidden transition ${expectation.effect}: ${display(after)}.`,
        expectation.expected,
        after,
        events,
        effect,
        { before: before ?? null, after: after ?? null },
        "extra_transition",
      )
    : pass(assertion.id);
}

function evaluateCardinality(
  contract: EffectContract,
  events: CallEvent[],
  context: AssertionContext,
  assertion: Assertion,
): AssertionResult {
  const calls = physicalToolEvents(events, contract.tool!);
  const count = calls.length;
  const valid =
    contract.cardinality === "exactly_once"
      ? count === 1
      : contract.cardinality === "at_least_once"
        ? count >= 1
        : count <= 1;
  return valid
    ? pass(assertion.id)
    : failure(
        assertion,
        context,
        `Effect contract ${contract.id} requires ${contract.cardinality} for ${contract.tool}; observed ${count} physical call(s).`,
        contract.cardinality === "exactly_once"
          ? 1
          : contract.cardinality === "at_least_once"
            ? 1
            : 1,
        count,
        events,
        undefined,
        calls as unknown as JsonValue,
        count > 1 ? "duplicate_transition" : "missing_effect",
      );
}

function evaluateOrdering(
  contract: EffectContract,
  beforeSelector: string,
  afterSelector: string,
  description: string | undefined,
  events: CallEvent[],
  context: AssertionContext,
  assertion: Assertion,
): AssertionResult {
  const before = events.find(
    (event) =>
      event.tool === beforeSelector ||
      event.stepId === beforeSelector ||
      event.eventId === beforeSelector,
  );
  const after = events.find(
    (event) =>
      event.tool === afterSelector ||
      event.stepId === afterSelector ||
      event.eventId === afterSelector,
  );
  if (before && after && before.sequence < after.sequence)
    return pass(assertion.id);
  return failure(
    assertion,
    context,
    description ??
      `Effect contract ${contract.id} requires ${beforeSelector} before ${afterSelector}.`,
    { before: beforeSelector, after: afterSelector },
    { before: before?.sequence ?? null, after: after?.sequence ?? null },
    events,
    undefined,
    undefined,
    "extra_transition",
  );
}

function evaluateAuthorization(
  contract: EffectContract,
  events: CallEvent[],
  context: AssertionContext,
  assertion: Assertion,
): AssertionResult {
  const calls = physicalToolEvents(events, contract.tool!);
  const expected = contract.authorization?.expected ?? true;
  const invalid = calls.filter(
    (event) =>
      !jsonEqual(
        getPath(event.arguments, contract.authorization!.argument!),
        expected,
      ),
  );
  return invalid.length === 0
    ? pass(assertion.id)
    : failure(
        assertion,
        context,
        `Effect contract ${contract.id} requires authorization argument ${contract.authorization?.argument} to equal ${display(expected)} for every physical ${contract.tool} call.`,
        expected,
        getPath(invalid[0]?.arguments, contract.authorization!.argument!),
        events,
        undefined,
        invalid as unknown as JsonValue,
        "assertion_failure",
      );
}

function evaluateRecovery(
  contract: EffectContract,
  events: CallEvent[],
  context: AssertionContext,
  assertion: Assertion,
): AssertionResult {
  const calls = physicalToolEvents(events, contract.tool!);
  const recovery = contract.recovery!;
  if (
    recovery.max_attempts !== undefined &&
    calls.length > recovery.max_attempts
  )
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} recovery exceeded max_attempts ${recovery.max_attempts} for ${contract.tool}.`,
      recovery.max_attempts,
      calls.length,
      events,
      undefined,
      calls as unknown as JsonValue,
      "duplicate_transition",
    );
  if (recovery.uncertain_outcome === "do_not_retry") {
    const uncertain = calls.find((event) => event.responseStatus === "lost");
    if (uncertain && calls.some((event) => event.sequence > uncertain.sequence))
      return failure(
        assertion,
        context,
        `Effect contract ${contract.id} forbids retrying ${contract.tool} after an uncertain outcome.`,
        1,
        calls.length,
        events,
        undefined,
        calls as unknown as JsonValue,
        "duplicate_transition",
      );
  }
  if (
    recovery.uncertain_outcome === "retry_with_same_key" &&
    calls.length > 1
  ) {
    const first = calls[0]?.arguments;
    if (calls.some((event) => !jsonEqual(event.arguments, first)))
      return failure(
        assertion,
        context,
        `Effect contract ${contract.id} requires the same arguments/idempotency key when retrying ${contract.tool}.`,
        first,
        calls.at(-1)?.arguments,
        events,
        undefined,
        calls as unknown as JsonValue,
        "changed_effect",
      );
  }
  if (recovery.uncertain_outcome === "query_before_retry") {
    const queryTool = recovery.query_tool!;
    for (const [index, call] of calls.entries()) {
      if (call.responseStatus !== "lost") continue;
      const next = calls[index + 1];
      if (
        next &&
        !events.some(
          (event) =>
            event.tool === queryTool &&
            event.physicalCall &&
            event.sequence > call.sequence &&
            event.sequence < next.sequence,
        )
      )
        return failure(
          assertion,
          context,
          `Effect contract ${contract.id} requires ${queryTool} before retrying ${contract.tool} after an uncertain outcome.`,
          queryTool,
          undefined,
          events,
          undefined,
          calls as unknown as JsonValue,
          "assertion_failure",
        );
    }
  }
  if (recovery.uncertain_outcome === "compensate")
    return failure(
      assertion,
      context,
      `Effect contract ${contract.id} declares compensate recovery, which requires an explicit compensation assertion and is not inferred by the core runner.`,
      "explicit-compensation-assertion",
      undefined,
      events,
      undefined,
      undefined,
      "probe_error",
    );
  return pass(assertion.id);
}

function physicalToolEvents(events: CallEvent[], tool: string): CallEvent[] {
  return events.filter(
    (event) =>
      event.tool === tool &&
      event.physicalCall &&
      event.kind !== "effect_probe",
  );
}

function violatesChange(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  change: "any" | "increase" | "decrease",
): boolean {
  if (change === "any") return !jsonEqual(before, after);
  if (typeof before !== "number" || typeof after !== "number")
    return !jsonEqual(before, after);
  return change === "increase" ? after > before : after < before;
}
