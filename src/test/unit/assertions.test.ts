import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAssertions } from "../../assertions.js";

test("no_extra_transition fails on an observed forbidden effect", () => {
  const [result] = evaluateAssertions(
    [
      {
        id: "no-extra",
        type: "no_extra_transition",
        effect: "messages",
        expected: 0,
      },
    ],
    [],
    [
      {
        id: "messages",
        source: "fixture_state",
        path: "outbound.length",
        value: 1,
        safety: "fixture",
      },
    ],
    new Map(),
    [],
    { command: "node dist/cli.js run pack.yaml", source: "pack.yaml" },
  );
  assert.equal(result.passed, false);
  assert.match(result.finding?.message ?? "", /unexpected state transition/);
  assert.equal(result.finding?.status, "failed");
  assert.equal(result.finding?.firstDivergentEventId, undefined);
});

test("call_count max is a physical at-most bound and blocked calls are not physical", () => {
  const [result] = evaluateAssertions(
    [{ id: "at-most", type: "call_count", tool: "write", max: 1 }],
    [
      {
        eventId: "event-1",
        sequence: 1,
        kind: "step",
        tool: "write",
        arguments: {},
        attempt: 1,
        error: { kind: "permission_denied", message: "blocked" },
        mutationIds: [],
        durationMs: 0,
        physicalCall: false,
        redactionApplied: true,
      },
      {
        eventId: "event-2",
        sequence: 2,
        kind: "step",
        tool: "write",
        arguments: {},
        attempt: 1,
        output: { ok: true },
        mutationIds: [],
        durationMs: 0,
        physicalCall: true,
        redactionApplied: true,
      },
    ],
    [],
    new Map(),
    [],
    { command: "node", source: "pack.yaml" },
  );
  assert.equal(result.passed, true);
});

test("effect assertions fail when the declared effect was never observed", () => {
  const [positive, negative, transition] = evaluateAssertions(
    [
      { id: "positive", type: "effect_equals", effect: "missing", expected: 1 },
      {
        id: "negative",
        type: "effect_not_equals",
        effect: "missing",
        expected: 0,
      },
      {
        id: "transition",
        type: "no_extra_transition",
        effect: "missing",
        expected: 0,
      },
    ],
    [],
    [],
    new Map(),
    [],
    { command: "node", source: "pack.yaml" },
  );
  assert.equal(positive.passed, false);
  assert.equal(negative.passed, false);
  assert.equal(transition.passed, false);
});

test("must_not_call can scope a forbidden tool to one step", () => {
  const [result] = evaluateAssertions(
    [
      {
        id: "forbid-send-step",
        type: "must_not_call",
        tool: "send",
        step: "create",
      },
    ],
    [
      {
        eventId: "event-1",
        sequence: 1,
        kind: "step",
        stepId: "send-step",
        tool: "send",
        arguments: {},
        attempt: 1,
        mutationIds: [],
        durationMs: 0,
        physicalCall: true,
        redactionApplied: true,
      },
    ],
    [],
    new Map(),
    [],
    { command: "node", source: "pack.yaml" },
  );
  assert.equal(result.passed, true);
});
