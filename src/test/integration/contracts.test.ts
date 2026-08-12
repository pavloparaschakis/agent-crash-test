import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

async function createPack(withDuplicate: boolean) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-contract-"),
  );
  await fs.writeFile(
    path.join(directory, "fixture.yaml"),
    `initial_state:
  invoices: []
tools:
  create_invoice:
    annotations:
      readOnlyHint: false
    result: { created: true }
    effects:
      - op: append
        path: invoices
        value: { id: "$args.request_id" }
  read_state:
    annotations:
      readOnlyHint: true
    result: "$state"
`,
    "utf8",
  );
  const source = path.join(directory, "pack.yaml");
  await fs.writeFile(
    source,
    `version: 1
id: test/effect-contract
name: Effect contract
protocol: mcp
transport: fixture
server:
  fixture: fixture.yaml
effect_probes:
  - id: invoice-count
    source: fixture_state
    path: invoices.length
effect_contracts:
  - id: create-once
    class: create
    description: Creation must be singular and idempotent.
    tool: create_invoice
    preconditions:
      - effect: invoice-count
        expected: 0
    intended:
      - effect: invoice-count
        expected: 1
    forbidden:
      - effect: invoice-count
        expected: 2
    cardinality: exactly_once
    authorization:
      argument: confirmed
      expected: true
    severity: blocker
    remediation: Use an idempotency key and require explicit confirmation.
steps:
  - id: create
    call: create_invoice
    arguments: { request_id: req_1, confirmed: true }
${
  withDuplicate
    ? `mutations:
  - id: duplicate
    type: duplicate_call
    applies_to: create_invoice
    seed: 1
`
    : ""
}assertions:
  - id: call-shape
    type: call_count
    tool: create_invoice
    exactly: ${withDuplicate ? 2 : 1}
`,
    "utf8",
  );
  return { source, pack: (await loadPack(source)).pack };
}

test("effect contracts pass with preconditions, intended state, cardinality, and authorization", async () => {
  const { source, pack } = await createPack(false);
  const result = await runPack(pack, { source });
  assert.equal(result.findings.length, 0);
  assert.ok(
    result.assertions.some(
      (assertion) => assertion.id === "create-once-cardinality",
    ),
  );
});

test("effect contracts fail on duplicate physical calls and forbidden state", async () => {
  const { source, pack } = await createPack(true);
  const result = await runPack(pack, { source });
  assert.ok(
    result.findings.some((finding) => finding.id === "create-once-intended-1"),
  );
  assert.ok(
    result.findings.some((finding) => finding.id === "create-once-forbidden-1"),
  );
  assert.ok(
    result.findings.some((finding) => finding.id === "create-once-cardinality"),
  );
  assert.ok(result.findings.every((finding) => finding.fingerprint?.value));
});
