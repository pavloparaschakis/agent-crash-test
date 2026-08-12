import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function fixturePack(
  contents: string,
  fixture = `initial_state:\n  invoices: []\n  outbound_messages: []\ntools:\n  create_invoice:\n    annotations:\n      readOnlyHint: false\n    result: { created: true }\n    effects:\n      - op: append\n        path: invoices\n        value: { id: inv_1 }\n  send_message:\n    annotations:\n      readOnlyHint: false\n    result: { sent: true }\n    effects:\n      - op: append\n        path: outbound_messages\n        value: { kind: email }\n  read_state:\n    annotations:\n      readOnlyHint: false\n    result: "$state"\n`,
): Promise<{
  source: string;
  pack: Awaited<ReturnType<typeof loadPack>>["pack"];
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-hardening-"),
  );
  await fs.writeFile(path.join(directory, "fixture.yaml"), fixture, "utf8");
  const source = path.join(directory, "pack.yaml");
  await fs.writeFile(
    source,
    contents.replaceAll("FIXTURE", "fixture.yaml"),
    "utf8",
  );
  return { source, pack: (await loadPack(source)).pack };
}

test("duplicate calls are two physical events and call_count sees both", async () => {
  const { source, pack } = await fixturePack(`version: 1
id: test/duplicate-trace
name: Duplicate trace
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
effect_probes:
  - id: invoice_count
    source: fixture_state
    path: invoices.length
steps:
  - id: create
    call: create_invoice
mutations:
  - id: duplicate
    type: duplicate_call
    applies_to: create_invoice
assertions:
  - id: two-physical-calls
    type: call_count
    tool: create_invoice
    exactly: 2
  - id: two-invoices
    type: effect_equals
    effect: invoice_count
    expected: 2
`);
  const result = await runPack(pack, { source });
  assert.deepEqual(
    result.events
      .filter((event) => event.tool === "create_invoice")
      .map((event) => [event.kind, event.physicalCall, event.parentEventId]),
    [
      ["step", true, undefined],
      ["duplicate", true, "event-1"],
    ],
  );
  assert.deepEqual(
    result.events
      .filter((event) => event.kind === "effect_probe")
      .map((event) => [event.tool, event.physicalCall]),
    [
      ["<fixture_state>", false],
      ["<fixture_state>", false],
    ],
  );
  assert.equal(
    result.assertions.every((assertion) => assertion.passed),
    true,
  );
  assert.equal(result.policy.processClosed, true);
});

test("duplicate server errors remain visible on the duplicate event", async () => {
  const { source, pack } = await fixturePack(
    `version: 1
id: test/duplicate-error
name: Duplicate error trace
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
steps:
  - id: fail
    call: fail
mutations:
  - id: duplicate-failure
    type: duplicate_call
    applies_to: fail
    occurrence: 1
assertions:
  - id: two-physical-failures
    type: call_count
    tool: fail
    exactly: 2
`,
    `tools:
  fail:
    error:
      kind: retryable_error
      message: deliberate duplicate failure
`,
  );
  const result = await runPack(pack, { source });
  const failures = result.events.filter((event) => event.tool === "fail");
  assert.deepEqual(
    failures.map((event) => [
      event.kind,
      event.error?.kind,
      event.parentEventId,
    ]),
    [
      ["step", "retryable_error", undefined],
      ["duplicate", "retryable_error", "event-1"],
    ],
  );
  assert.equal(
    result.mutations[0]?.parameters.injection_phase,
    "after_underlying_call",
  );
});

test("fixture state contracts detect requested and forbidden transitions", async () => {
  const { source, pack } = await fixturePack(`version: 1
id: test/state-contract
name: State contract
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
state_contract:
  effects:
    - path: invoices.length
      expected_delta: 1
  forbidden:
    - path: outbound_messages.length
      forbidden_change: increase
steps:
  - id: create
    call: create_invoice
  - id: send
    call: send_message
assertions:
  - id: create-result
    type: result_path_equals
    step: create
    path: created
    expected: true
`);
  const result = await runPack(pack, { source });
  const invoice = result.effects.find(
    (effect) => effect.path === "invoices.length",
  );
  const outbound = result.effects.find(
    (effect) => effect.path === "outbound_messages.length",
  );
  assert.deepEqual([invoice?.before, invoice?.after], [0, 1]);
  assert.deepEqual([outbound?.before, outbound?.after], [0, 1]);
  assert.equal(
    result.findings.some((finding) =>
      finding.message.includes("outbound_messages.length"),
    ),
    true,
  );
  assert.equal(
    result.findings.find((finding) =>
      finding.message.includes("outbound_messages.length"),
    )?.category,
    "extra_transition",
  );
  assert.equal(typeof result.findings[0]?.evidence, "object");
});

test("unsafe-by-default effect probes block before scenario execution", async () => {
  const { source, pack } = await fixturePack(`version: 1
id: test/probe-policy
name: Probe policy
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
effect_probes:
  - id: state
    source: tool
    tool: read_state
    path: invoices.length
    safety: declared_read_only
steps:
  - id: write
    call: create_invoice
assertions:
  - id: one-physical-write
    type: call_count
    tool: create_invoice
    exactly: 1
`);
  const result = await runPack(pack, { source });
  assert.equal(result.executionError?.source, "probe-policy");
  assert.equal(result.events.length, 0);
  assert.equal(result.policy.processClosed, true);

  const unsafe = await fixturePack(`version: 1
id: test/unsafe-probe-opt-in
name: Unsafe probe opt-in
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
execution:
  allow_unsafe_probes: true
effect_probes:
  - id: state
    source: tool
    tool: read_state
    path: invoices.length
    safety: explicit_unsafe_opt_in
steps:
  - id: read
    call: read_state
assertions:
  - id: read-count
    type: call_count
    tool: read_state
    exactly: 1
`);
  const withoutCliOptIn = await runPack(unsafe.pack, { source: unsafe.source });
  assert.equal(withoutCliOptIn.executionError?.source, "probe-policy");
  const withCliOptIn = await runPack(unsafe.pack, {
    source: unsafe.source,
    allowUnsafeProbes: true,
  });
  assert.equal(withCliOptIn.executionError, undefined);
  assert.match(withCliOptIn.executionWarnings.join("\n"), /explicitly unsafe/);
});

test("manifest contract gaps are reported as deterministic notices", async () => {
  const { source, pack } = await fixturePack(
    `version: 1
id: test/manifest-notices
name: Manifest notices
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
steps:
  - id: create
    call: create_invoice
assertions:
  - id: one-call
    type: call_count
    tool: create_invoice
    exactly: 1
`,
    `tools:
  create_invoice:
    result: { created: true }
`,
  );
  const result = await runPack(pack, { source });
  assert.equal(result.executionError, undefined);
  assert.match(
    result.executionWarnings.join("\n"),
    /tool create_invoice does not declare a description/,
  );
  assert.match(
    result.executionWarnings.join("\n"),
    /tool create_invoice has no annotations/,
  );
});

test("the same fixture run has stable semantic output", async () => {
  const source = path.join(root, "examples/packs/fixture-duplicate-call.yaml");
  const pack = (await loadPack(source)).pack;
  const left = await runPack(pack, { source, seed: 7 });
  const right = await runPack(pack, { source, seed: 7 });
  const third = await runPack(pack, { source, seed: 7 });
  const semantic = (result: typeof left) => ({
    pack: result.pack,
    transport: result.transport,
    manifest: result.manifest,
    mutations: result.mutations,
    events: result.events.map((event) => ({ ...event, durationMs: 0 })),
    effects: result.effects,
    assertions: result.assertions,
    findings: result.findings,
    executionWarnings: result.executionWarnings,
    executionError: result.executionError,
    policy: result.policy,
  });
  assert.deepEqual(semantic(left), semantic(right));
  assert.deepEqual(semantic(right), semantic(third));
});

test("a real hung stdio tool is bounded and the process is closed", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-hang-"),
  );
  const source = path.join(directory, "hang.yaml");
  await fs.writeFile(
    source,
    `version: 1
id: test/hang
name: Hanging tool
protocol: mcp
transport: stdio
server:
  command: ${process.execPath}
  args: [${path.join(root, "dist/examples/hanging-server.js")}]
  cwd: ${root}
execution:
  request_timeout_ms: 750
  max_run_ms: 3000
steps:
  - id: hang
    call: hang
assertions:
  - id: one-call
    type: call_count
    tool: hang
    exactly: 1
`,
    "utf8",
  );
  const pack = (await loadPack(source)).pack;
  const started = Date.now();
  const result = await runPack(pack, { source });
  assert.ok(Date.now() - started < 4000);
  assert.equal(result.events[0]?.error?.kind, "timeout");
  assert.equal(result.policy.processClosed, true);
});

test("a long injected delay cannot outlive max_run_ms", async () => {
  const { source, pack } = await fixturePack(`version: 1
id: test/bounded-mutation
name: Bounded mutation
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
execution:
  max_run_ms: 50
steps:
  - id: create
    call: create_invoice
mutations:
  - id: slow-timeout
    type: timeout
    duration_ms: 1000
assertions:
  - id: one-call
    type: call_count
    tool: create_invoice
    exactly: 1
`);
  const started = Date.now();
  const result = await runPack(pack, { source });
  assert.ok(Date.now() - started < 300);
  assert.equal(result.executionError?.kind, "timeout");
  assert.equal(result.policy.processClosed, true);
  assert.equal(result.mutations[0]?.result, "failed");
});

test("CLI distinguishes passing, assertion, usage, and target failures", async () => {
  const output = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-cli-"),
  );
  const passing = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "run",
      "examples/packs/fixture-duplicate-call.yaml",
      "--format",
      "json",
      "--output",
      output,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(passing.status, 0, passing.stderr);
  const assertion = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "run",
      "examples/packs/duplicate-call-duplicates.yaml",
      "--format",
      "json",
      "--output",
      output,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(assertion.status, 1, assertion.stderr);
  const usage = spawnSync(
    process.execPath,
    ["dist/cli.js", "run", path.join(output, "missing.yaml")],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(usage.status, 2);
  const missingValue = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "run",
      "examples/packs/fixture-duplicate-call.yaml",
      "--format",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(missingValue.status, 2);
  const target = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "discover",
      "--stdio",
      "agent-crash-test-command-that-does-not-exist",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(target.status, 3, target.stderr);
  const targetFailurePack = path.join(output, "target-failure.yaml");
  const targetFailureReports = path.join(output, "target-failure-reports");
  await fs.writeFile(
    targetFailurePack,
    `version: 1
id: test/target-failure
name: Target failure report
protocol: mcp
transport: stdio
server:
  command: agent-crash-test-command-that-does-not-exist
steps:
  - id: read
    call: read
assertions:
  - id: one-read
    type: call_count
    tool: read
    exactly: 1
`,
    "utf8",
  );
  const targetRun = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "run",
      targetFailurePack,
      "--format",
      "json",
      "--output",
      targetFailureReports,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(targetRun.status, 3, targetRun.stderr);
  const targetReports = await fs.readdir(targetFailureReports);
  assert.equal(targetReports.length, 1);
  const targetReport = JSON.parse(
    await fs.readFile(
      path.join(targetFailureReports, targetReports[0]!),
      "utf8",
    ),
  ) as { executionError?: { kind?: string } };
  assert.equal(targetReport.executionError?.kind, "spawn");
  const blocked = await fixturePack(`version: 1
id: test/cli-probe-policy
name: CLI probe policy
protocol: mcp
transport: fixture
server:
  fixture: FIXTURE
effect_probes:
  - id: unsafe-state
    source: tool
    tool: read_state
    path: invoices.length
    safety: declared_read_only
steps:
  - id: read
    call: read_state
assertions:
  - id: read-count
    type: call_count
    tool: read_state
    exactly: 1
`);
  const policy = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "run",
      blocked.source,
      "--format",
      "json",
      "--output",
      output,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(policy.status, 4, policy.stderr);
});
