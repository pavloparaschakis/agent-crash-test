import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(root, "dist", "cli.js");

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  });
}

test("wrap emits a directly usable MCP client entry", () => {
  const result = run(["wrap", "examples/packs/duplicate-call-duplicates.yaml"]);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout) as {
    mcpServers?: Record<string, { command?: string; args?: string[] }>;
  };
  const entry = config.mcpServers?.["agent-crash-test"];
  assert.equal(entry?.command, process.execPath);
  assert.ok(entry?.args?.includes("test"));
  assert.ok(
    entry?.args?.some((value) =>
      value.endsWith("duplicate-call-duplicates.yaml"),
    ),
  );
});

test("bridge --contract produces a core contract verdict and report", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-bridge-contract-"),
  );
  const pack = path.join(directory, "contract.yaml");
  const input = path.join(directory, "events.jsonl");
  const output = path.join(directory, "reports");
  await fs.writeFile(
    pack,
    `version: 1
id: bridge/duplicate
name: Bridge duplicate contract
protocol: mcp
transport: stdio
server: { command: adapter-owned }
steps: []
assertions:
  - id: one-write
    type: call_count
    tool: create_record
    exactly: 1
`,
    "utf8",
  );
  const records = [
    {
      type: "run_start",
      run_id: "bridge-run",
      adapter: "integration-test",
      adapter_version: "1",
      protocol: "custom",
      transport: "jsonl",
      determinism: "deterministic",
      physical_interception: true,
      state_observation: false,
      redaction_applied: true,
    },
    ...[1, 2].flatMap((attempt) => [
      {
        type: "tool_call",
        run_id: "bridge-run",
        operation_id: `create-${attempt}`,
        tool: "create_record",
        arguments: { request_id: "same" },
        attempt,
        physical_call: true,
        redaction_applied: true,
      },
      {
        type: "tool_result",
        run_id: "bridge-run",
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
      type: "run_end",
      run_id: "bridge-run",
      status: "complete",
      redaction_applied: true,
    },
  ];
  await fs.writeFile(
    input,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
  const result = run([
    "bridge",
    "--input",
    input,
    "--contract",
    pack,
    "--format",
    "terminal,json",
    "--output",
    output,
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /Expected create_record to be called exactly 1 time/,
  );
  const reports = await fs.readdir(output);
  assert.equal(reports.filter((file) => file.endsWith(".json")).length, 1);
});

test("guided capture gates and authors a local JSON observer", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-guide-command-"),
  );
  const output = path.join(directory, "guided.yaml");
  const args = [
    "capture",
    "guide",
    "examples/guided/invoice-capture.json",
    "--output",
    output,
    "--target-tool",
    "create_invoice",
    "--mutation-profile",
    "ambiguous-commit",
    "--observer-command",
    "node inspect-state.js",
    "--observer-id",
    "invoice-count",
    "--observer-path",
    "invoices.length",
    "--effect-class",
    "create",
    "--expected",
    "1",
    "--cardinality",
    "exactly_once",
    "--description",
    "Exactly one invoice exists.",
  ];
  const refused = run(args);
  assert.equal(refused.status, 4);
  assert.match(refused.stderr, /--allow-unsafe-observer/);

  const accepted = run([...args, "--allow-unsafe-observer"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  const generated = await fs.readFile(output, "utf8");
  assert.match(generated, /source: json_command/);
  assert.match(generated, /allow_unsafe_probes: true/);
  assert.match(generated, /safety: explicit_unsafe_opt_in/);
});
