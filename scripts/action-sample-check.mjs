import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sample = path.join(root, "examples", "action-sample-repo");
const cli = path.join(root, "dist", "cli.js");
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "agent-crash-test-action-sample-"),
);

function run(args, cwd, expected) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  assert.equal(
    result.status,
    expected,
    `CLI ${args.join(" ")} returned ${result.status}; expected ${expected}\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

async function assertArtifacts(directory, expectedFinding) {
  const files = (await fs.readdir(directory)).sort();
  assert.equal(
    files.length,
    2,
    "sample run should write Markdown and JSON artifacts",
  );
  assert.ok(files.some((file) => file.endsWith(".md")));
  const jsonFile = files.find((file) => file.endsWith(".json"));
  assert.ok(jsonFile);
  const report = JSON.parse(
    await fs.readFile(path.join(directory, jsonFile), "utf8"),
  );
  assert.equal(report.findings.length > 0, expectedFinding);
  assert.equal(report.policy.processClosed, true);
}

try {
  await fs.access(sample);
  const passingOutput = path.join(temporary, "passing");
  const failingOutput = path.join(temporary, "failing");
  run(
    [
      "run",
      path.join(sample, "tests/agent/passing.yaml"),
      "--format",
      "terminal,markdown,json",
      "--output",
      passingOutput,
      "--fail-on",
      "error",
    ],
    sample,
    0,
  );
  await assertArtifacts(passingOutput, false);
  run(
    [
      "run",
      path.join(sample, "tests/agent/failing.yaml"),
      "--format",
      "terminal,markdown,json",
      "--output",
      failingOutput,
      "--fail-on",
      "error",
    ],
    sample,
    1,
  );
  await assertArtifacts(failingOutput, true);
  console.log(
    "Action sample smoke test passed: passing and failing artifacts verified.",
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
