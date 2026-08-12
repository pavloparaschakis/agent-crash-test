import assert from "node:assert/strict";
import test from "node:test";
import { evaluateJsonlRun } from "../../jsonl-evaluator.js";
import { parseJsonl } from "../../jsonl.js";
import type { CrashTestPack } from "../../types.js";

const pack: CrashTestPack = {
  version: 1,
  id: "jsonl/contract",
  name: "JSONL contract",
  protocol: "mcp",
  transport: "stdio",
  server: { command: "adapter-owned" },
  steps: [],
  effect_probes: [
    {
      id: "records",
      source: "json_command",
      command: "adapter-owned",
      path: "",
      safety: "explicit_unsafe_opt_in",
    },
  ],
  effect_contracts: [
    {
      id: "create-once",
      class: "create",
      description: "Create exactly once",
      tool: "create_record",
      intended: [{ effect: "records", expected: { count: 2 } }],
      cardinality: "exactly_once",
    },
  ],
  assertions: [
    {
      id: "one-call",
      type: "call_count",
      tool: "create_record",
      exactly: 1,
    },
  ],
};

function records(end = true): string {
  const input: Array<Record<string, unknown>> = [
    {
      type: "run_start",
      run_id: "run-1",
      adapter: "test-adapter",
      adapter_version: "1",
      protocol: "mcp",
      transport: "jsonl",
      determinism: "deterministic",
      physical_interception: true,
      state_observation: true,
      redaction_applied: true,
    },
    {
      type: "state_snapshot",
      run_id: "run-1",
      observer_id: "records",
      observer_status: "present",
      value: { count: 0 },
      redaction_applied: true,
    },
    ...[1, 2].flatMap((attempt) => [
      {
        type: "tool_call",
        run_id: "run-1",
        operation_id: `create-${attempt}`,
        tool: "create_record",
        arguments: { request_id: "same" },
        attempt,
        physical_call: true,
        redaction_applied: true,
      },
      {
        type: "tool_result",
        run_id: "run-1",
        operation_id: `create-${attempt}`,
        tool: "create_record",
        status: "success",
        commit_status: "committed",
        response_status: "returned",
        output: { ok: true },
        redaction_applied: true,
      },
    ]),
    {
      type: "state_snapshot",
      run_id: "run-1",
      observer_id: "records",
      observer_status: "changed",
      value: { count: 2 },
      redaction_applied: true,
    },
    ...(end
      ? [
          {
            type: "run_end",
            run_id: "run-1",
            status: "complete",
            redaction_applied: true,
          },
        ]
      : []),
  ];
  return input.map((record) => JSON.stringify(record)).join("\n");
}

test("JSONL evaluator feeds physical calls and observations into core contracts", () => {
  const result = evaluateJsonlRun(parseJsonl(records()), pack, {
    source: "/tmp/contract.yaml",
  });
  assert.equal(result.executionError, undefined);
  assert.equal(
    (result.effects[0]?.before as { count?: number } | undefined)?.count,
    0,
  );
  assert.equal(
    (result.effects[0]?.after as { count?: number } | undefined)?.count,
    2,
  );
  assert.equal(result.findings.length, 2);
  assert.deepEqual(result.findings.map((finding) => finding.id).sort(), [
    "create-once-cardinality",
    "one-call",
  ]);
});

test("JSONL evaluator fails closed when the adapter omits run_end", () => {
  const result = evaluateJsonlRun(parseJsonl(records(false)), pack, {
    source: "/tmp/contract.yaml",
  });
  assert.equal(result.executionError?.kind, "protocol");
  assert.equal(result.assertions.length, 0);
});
