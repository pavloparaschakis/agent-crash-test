import assert from "node:assert/strict";
import test from "node:test";
import { jsonlMarkdown, parseJsonl } from "../../jsonl.js";

const stream = [
  {
    type: "run_start",
    run_id: "run-1",
    adapter: "python-example",
    adapter_version: "1.0.0",
    protocol: "mcp",
    transport: "jsonl",
    determinism: "partial",
    redaction_applied: true,
  },
  {
    type: "tool_call",
    run_id: "run-1",
    operation_id: "op-1",
    tool: "create_issue",
    arguments: { title: "hello", token: "secret-value" },
    redaction_applied: true,
  },
  {
    type: "tool_result",
    run_id: "run-1",
    operation_id: "op-1",
    status: "unknown",
    commit_status: "committed",
    response_status: "lost",
    error: { kind: "transport_error", message: "response lost" },
    redaction_applied: true,
  },
  {
    type: "state_snapshot",
    run_id: "run-1",
    observer_id: "issues",
    source: "test-db",
    observer_status: "changed",
    value: { count: 1, token: "secret-value" },
    redaction_applied: true,
  },
  {
    type: "run_end",
    run_id: "run-1",
    status: "complete",
    redaction_applied: true,
  },
]
  .map((record) => JSON.stringify(record))
  .join("\n");

test("JSONL bridge normalizes operations, outcomes, and state snapshots", () => {
  const run = parseJsonl(stream);
  assert.equal(run.runId, "run-1");
  assert.equal(run.adapter.id, "python-example");
  assert.equal(run.events[1]?.kind, "logical_call");
  assert.equal(run.events[2]?.outcome?.commitStatus, "committed");
  assert.equal(run.events[2]?.outcome?.responseStatus, "lost");
  assert.equal(run.events[3]?.observerStatus, "changed");
  const observerValue = run.events[3]?.observerValue;
  assert.equal(
    Boolean(
      observerValue &&
        typeof observerValue === "object" &&
        "token" in observerValue,
    ),
    true,
  );
  assert.match(jsonlMarkdown(run), /python-example/);
});

test("JSONL bridge fails closed for missing redaction and unsupported records", () => {
  const missingRedaction = JSON.stringify({
    type: "run_start",
    run_id: "run-1",
    adapter: "example",
  });
  assert.throws(() => parseJsonl(missingRedaction), /redaction|run_start/);
  const unsupported = JSON.stringify({
    type: "unknown",
    run_id: "run-1",
    redaction_applied: true,
  });
  assert.throws(() => parseJsonl(unsupported), /Unsupported JSONL record type/);
  const invalidError = [
    stream
      .split("\n")
      .map((line) =>
        line.includes('"type":"tool_result"')
          ? line.replace('"transport_error"', '"not-an-error"')
          : line,
      )
      .join("\n"),
  ][0]!;
  assert.throws(() => parseJsonl(invalidError), /Invalid JSONL error kind/);
  const invalidObserverStatus = stream.replace('"changed"', '"unknown"');
  assert.throws(
    () => parseJsonl(invalidObserverStatus),
    /Invalid observer_status/,
  );
  const invalidMutationPhase = [
    JSON.stringify({
      type: "run_start",
      run_id: "run-3",
      adapter: "example",
      redaction_applied: true,
    }),
    JSON.stringify({
      type: "mutation",
      run_id: "run-3",
      mutation_id: "m-1",
      phase: "unknown",
      redaction_applied: true,
    }),
  ].join("\n");
  assert.throws(
    () => parseJsonl(invalidMutationPhase),
    /Invalid mutation phase/,
  );
});

test("JSONL bridge marks an unterminated stream inconclusive", () => {
  const input = [
    JSON.stringify({
      type: "run_start",
      run_id: "run-2",
      adapter: "example",
      redaction_applied: true,
    }),
  ].join("\n");
  const run = parseJsonl(input);
  assert.equal(run.terminalStatus, "inconclusive");
  assert.match(run.warnings[0] ?? "", /without run_end/);
});
