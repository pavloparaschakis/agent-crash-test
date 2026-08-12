import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const node = process.execPath;
const cli = path.join(root, "dist", "cli.js");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(program, args, expected = 0) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  assert.equal(
    result.status,
    expected,
    `${program} ${args.join(" ")} returned ${result.status}; expected ${expected}`,
  );
}

try {
  run(npm, ["run", "check"]);
  run(npm, ["run", "action:check"]);
  run(npm, ["run", "package:check"]);
  run(npm, ["run", "demo"]);

  const output = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-acceptance-"),
  );
  const passingPack = "examples/packs/fixture-duplicate-call.yaml";
  const failingPack = "examples/packs/duplicate-call-duplicates.yaml";
  run(node, [cli, "run", passingPack, "--format", "json", "--output", output]);
  run(
    node,
    [cli, "run", failingPack, "--format", "json", "--output", output],
    1,
  );
  run(node, [cli, "doctor"]);

  const reports = await fs.readdir(output);
  assert.equal(
    reports.length,
    2,
    "acceptance run should write two JSON reports",
  );
  const failingReport = reports.find((file) => file.includes("demo-duplicate"));
  assert.ok(failingReport, "failing acceptance report should exist");
  const report = JSON.parse(
    await fs.readFile(path.join(output, failingReport), "utf8"),
  );
  assert.equal(report.schemaVersion, 1);
  assert.ok(
    report.reproduction?.command,
    "report should expose top-level reproduction metadata",
  );
  assert.equal(
    report.events.filter(
      (event) => event.physicalCall && event.kind !== "effect_probe",
    ).length,
    2,
  );
  assert.ok(report.findings[0]?.reproduction?.command);
  console.log(`Acceptance complete: ${reports.length} JSON reports verified.`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
