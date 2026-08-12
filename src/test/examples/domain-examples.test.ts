import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const python = process.env.PYTHON ?? "python3";

interface DomainResult {
  example: string;
  scenario: "broken" | "fixed";
  contract_passed: boolean;
  [key: string]: unknown;
}

function runDomain(directory: string, scenario: "broken" | "fixed") {
  const script = path.join(
    root,
    "examples",
    "domains",
    directory,
    "run_example.py",
  );
  const run = spawnSync(python, [script, "--scenario", scenario], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.equal(run.signal, null, run.stderr);
  assert.equal(run.status, scenario === "broken" ? 1 : 0, run.stderr);
  const result = JSON.parse(run.stdout) as DomainResult;
  assert.equal(result.scenario, scenario);
  assert.equal(result.contract_passed, scenario === "fixed");
  return result;
}

test("filesystem/code-agent example detects a duplicate edit and proves the fix", () => {
  const broken = runDomain("filesystem-code-agent", "broken");
  assert.equal(broken.example, "filesystem-code-agent");
  assert.equal(broken.attempts, 2);
  assert.equal(broken.physical_writes, 2);
  assert.equal(broken.generated_blocks, 2);
  assert.equal(broken.duplicate_definitions, 1);

  const fixed = runDomain("filesystem-code-agent", "fixed");
  assert.equal(fixed.physical_writes, 1);
  assert.equal(fixed.generated_blocks, 1);
  assert.equal(fixed.duplicate_definitions, 0);
});

test("SQLite example detects an ambiguous duplicate commit and proves idempotency", () => {
  const broken = runDomain("sqlite-ambiguous-commit", "broken");
  assert.equal(broken.example, "sqlite-ambiguous-commit");
  assert.equal(broken.attempts, 2);
  assert.equal(broken.committed_rows, 2);
  assert.deepEqual(broken.row_ids, [1, 2]);

  const fixed = runDomain("sqlite-ambiguous-commit", "fixed");
  assert.equal(fixed.committed_rows, 1);
  assert.deepEqual(fixed.row_ids, [1]);
  assert.equal(fixed.retry_inserted, false);
});

test("approval example detects send/deploy before approval and proves safe order", () => {
  const broken = runDomain("approval-send-deploy", "broken");
  assert.equal(broken.example, "approval-send-deploy");
  assert.deepEqual(broken.forbidden_preapproval_effects, [
    "deploy_production",
    "send_release_notice",
  ]);

  const fixed = runDomain("approval-send-deploy", "fixed");
  assert.deepEqual(fixed.forbidden_preapproval_effects, []);
  const events = fixed.events as Array<{ sequence: number; action: string }>;
  assert.deepEqual(
    events.map((event) => event.action),
    ["approve_release", "deploy_production", "send_release_notice"],
  );
});
