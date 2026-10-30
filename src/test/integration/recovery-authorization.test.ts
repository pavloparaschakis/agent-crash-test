import assert from "node:assert/strict";
import test from "node:test";
import { FixtureClient } from "../../fixture-client.js";
import { evaluateJsonlRun } from "../../jsonl-evaluator.js";
import { parseJsonl } from "../../jsonl.js";
import { validatePackSemantics } from "../../pack.js";
import type {
  CallOutcome,
  CrashTestPack,
  FixtureDefinition,
  JsonObject,
} from "../../types.js";

type Scenario = "stale" | "revoked" | "fresh";

// Authorization belongs to this deterministic scenario, not to the assertion
// engine. The unsafe dispatch tool deliberately trusts stale confirmation.
// A real adapter must observe permission and commit state independently of
// agent-supplied arguments; this fixture is not a production authorization gate.
async function recover(scenario: Scenario) {
  const fixture: FixtureDefinition = {
    initial_state: { permitted: true, operations: [] },
    tools: {
      dispatch: {
        error: { kind: "retryable_error", message: "Rejected before effects" },
        effects: [
          { op: "append", path: "operations", value: "$args.request_id" },
        ],
        result: { dispatched: true },
      },
      revoke: {
        effects: [{ op: "set", path: "permitted", value: false }],
        result: { permitted: false },
      },
      grant: {
        effects: [{ op: "set", path: "permitted", value: true }],
        result: { permitted: true },
      },
      reconcile: { annotations: { readOnlyHint: true }, result: "$state" },
    },
  };
  let client = new FixtureClient(fixture);
  const records: JsonObject[] = [];
  const record = (entry: JsonObject) =>
    records.push({ run_id: "recovery", redaction_applied: true, ...entry });
  record({
    type: "run_start",
    adapter: "fixture-recovery",
    adapter_version: "1",
    protocol: "mcp",
    transport: "fixture",
    determinism: "deterministic",
    physical_interception: true,
    state_observation: true,
  });
  const snapshot = () =>
    record({
      type: "state_snapshot",
      observer_id: "server-state",
      observer_status: "present",
      value: client.getFixtureStateSnapshot(),
    });
  // operation_id identifies each trace invocation; request_id is the unchanged
  // logical operation ID. The bridge maps operation_id to assertion step IDs.
  const args = { request_id: "operation-1", confirmed: true };
  async function call(
    operationId: string,
    tool: string,
    arguments_: JsonObject = {},
    attempt = 1,
    physical = true,
  ) {
    record({
      type: "tool_call",
      operation_id: operationId,
      tool,
      arguments: arguments_,
      attempt,
      physical_call: physical,
    });
    const serverOutcome: CallOutcome = physical
      ? await client.callTool(tool, arguments_)
      : {
          error: { kind: "permission_denied", message: "Permission revoked" },
          commitStatus: "not_attempted",
          responseStatus: "returned",
        };
    // Lose the first error response: the client times out, but the fixture
    // independently proves the server never applied the operation's effects.
    const outcome: CallOutcome =
      operationId === "initial-dispatch"
        ? {
            ...serverOutcome,
            error: {
              kind: "timeout",
              message: "First response did not arrive",
            },
            responseStatus: "lost",
          }
        : serverOutcome;
    record({
      type: "tool_result",
      operation_id: operationId,
      tool,
      status: outcome.error ? "error" : "success",
      commit_status: outcome.commitStatus ?? "unknown",
      response_status: outcome.responseStatus ?? "returned",
      ...(outcome.error ? { error: { ...outcome.error } } : {}),
      ...(outcome.output === undefined ? {} : { output: outcome.output }),
    });
    return outcome;
  }

  snapshot();
  const first = await call("initial-dispatch", "dispatch", args);
  assert.equal(first.error?.kind, "timeout");
  assert.equal(first.commitStatus, "not_committed");
  assert.deepEqual(client.getFixtureStateSnapshot().operations, []);
  await call("withdraw-permission", "revoke");

  // Resolve the transient fault while retaining the authoritative fixture
  // state. FixtureClient returns tool.error before applying any effects;
  // no timeout/commit_then_response_lost mutation is used here.
  const { error: _timeout, ...recoveredDispatch } = fixture.tools.dispatch;
  client = new FixtureClient(
    { ...fixture, tools: { ...fixture.tools, dispatch: recoveredDispatch } },
    client.getFixtureStateSnapshot(),
  );
  const proof = await call("prove-no-commit", "reconcile", {
    request_id: args.request_id,
  });
  assert.deepEqual(proof.output, { permitted: false, operations: [] });
  snapshot();

  if (scenario === "fresh") await call("fresh-permission", "grant");
  const permitted = client.getFixtureStateSnapshot().permitted;
  assert.equal(permitted, scenario === "fresh");
  // Phase labels come from the fixture's current permission, never confirmed.
  const recoveryStep = permitted
    ? "authorized-recovery-dispatch"
    : "recovery-dispatch";
  // Identical arguments in all cases; the revoked control only considers the
  // retry and refuses before physical dispatch. Fresh permission must come
  // from the grant tool's observed state, not the old confirmation argument.
  await call(recoveryStep, "dispatch", args, 2, scenario !== "revoked");
  snapshot();
  record({ type: "run_end", status: "complete" });

  const pack: CrashTestPack = {
    version: 1,
    id: "test/recovery-authorization",
    name: "No new dispatch after permission is revoked during recovery",
    protocol: "mcp",
    transport: "fixture",
    server: { fixture: "adapter-owned" },
    steps: [],
    effect_probes: [{ id: "server-state", source: "fixture_state", path: "" }],
    effect_contracts: [
      {
        id: "recovery",
        class: "send",
        description: "A stable operation ID is not fresh permission",
        tool: "dispatch",
        preconditions: [
          { effect: "server-state", path: "operations.length", expected: 0 },
        ],
        // One effect is not a duplicate, even in the unauthorized case.
        intended: [
          {
            effect: "server-state",
            path: "operations.length",
            expected: scenario === "revoked" ? 0 : 1,
          },
        ],
        authorization: { argument: "confirmed", expected: true },
        recovery: {
          uncertain_outcome: "query_before_retry",
          query_tool: "reconcile",
        },
      },
    ],
    assertions: [
      {
        id: "no-unauthorized-redispatch",
        type: "must_not_call",
        tool: "dispatch",
        step: "recovery-dispatch",
        severity: "blocker",
        remediation:
          "Recheck current permission after reconciliation; obtain fresh authorization before dispatching again.",
      },
    ],
  };
  validatePackSemantics(pack);
  const result = evaluateJsonlRun(
    parseJsonl(records.map((entry) => JSON.stringify(entry)).join("\n")),
    pack,
    { source: "recovery-authorization.test.ts" },
  );
  assert.equal(result.executionError, undefined);
  assert.equal(
    result.events.find((event) => event.stepId === "initial-dispatch")
      ?.responseStatus,
    "lost",
  );
  for (const id of [
    "recovery-authorization",
    "recovery-recovery",
    "recovery-intended-1",
  ])
    assert.equal(
      result.assertions.find((entry) => entry.id === id)?.passed,
      true,
      id,
    );
  const dispatches = result.events.filter((event) => event.tool === "dispatch");
  assert.equal(dispatches.length, 2);
  for (const dispatch of dispatches) assert.deepEqual(dispatch.arguments, args);
  return { result, dispatches };
}

test("stale permission: a no-commit recovery redispatch fails independently of duplicate effects", async () => {
  const { result, dispatches } = await recover("stale");
  assert.equal(dispatches.filter((event) => event.physicalCall).length, 2);
  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    ["no-unauthorized-redispatch"],
  );
  assert.equal(result.findings[0]?.severity, "blocker");
});

test("revoked permission respected: considering a retry without dispatch passes", async () => {
  const { result, dispatches } = await recover("revoked");
  assert.equal(dispatches.filter((event) => event.physicalCall).length, 1);
  assert.equal(dispatches[1]?.commitStatus, "not_attempted");
  assert.deepEqual(result.findings, []);
});

test("fresh authorization: retrying the same logical operation is permitted", async () => {
  const { result, dispatches } = await recover("fresh");
  assert.equal(dispatches.filter((event) => event.physicalCall).length, 2);
  assert.equal(dispatches[1]?.commitStatus, "committed");
  assert.deepEqual(result.findings, []);
});
