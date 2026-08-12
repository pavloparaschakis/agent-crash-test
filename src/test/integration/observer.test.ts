import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function makePack(
  snapshotFile: string,
  commandArgs: string[],
  observerTimeoutMs = 1_000,
) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-observer-"),
  );
  const fixture = path.join(directory, "fixture.yaml");
  const packFile = path.join(directory, "pack.yaml");
  await fs.writeFile(
    fixture,
    "tools:\n  read:\n    result: { ok: true }\n",
    "utf8",
  );
  await fs.writeFile(
    packFile,
    `version: 1
id: test/json-snapshot-observer
name: JSON snapshot observer
protocol: mcp
transport: fixture
server:
  fixture: fixture.yaml
execution:
  allow_unsafe_probes: true
  observer_timeout_ms: ${observerTimeoutMs}
effect_probes:
  - id: file-state
    source: json_command
    command: ${JSON.stringify(process.execPath)}
    args: ${JSON.stringify(commandArgs)}
    env:
      SNAPSHOT_FILE: ${JSON.stringify(snapshotFile)}
    path: count
    safety: explicit_unsafe_opt_in
steps:
  - id: read
    call: read
assertions:
  - id: count-is-one
    type: effect_equals
    effect: file-state
    expected: 1
`,
    "utf8",
  );
  return { packFile, pack: (await loadPack(packFile)).pack };
}

test("JSON snapshot observer reads bounded local state and reports an effect", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-snapshot-"),
  );
  const snapshot = path.join(directory, "state.json");
  await fs.writeFile(snapshot, JSON.stringify({ count: 1 }), "utf8");
  const { packFile, pack } = await makePack(snapshot, [
    "-e",
    "const fs=require('fs'); process.stdout.write(fs.readFileSync(process.env.SNAPSHOT_FILE,'utf8'))",
  ]);
  const result = await runPack(pack, {
    source: packFile,
    allowUnsafeProbes: true,
  });
  assert.equal(result.executionError, undefined);
  assert.equal(result.findings.length, 0);
  assert.equal(result.effects[0]?.observerStatus, "present");
  assert.equal(result.effects[0]?.observed, 1);
  assert.equal(result.effects[0]?.before, 1);
  assert.equal(result.effects[0]?.after, 1);
  assert.equal(result.identity.determinism, "partial");
});

test("JSON snapshot observer timeout is inconclusive and cannot produce a false pass", async () => {
  const snapshot = path.join(
    await fs.mkdtemp(
      path.join(os.tmpdir(), "agent-crash-test-snapshot-timeout-"),
    ),
    "state.json",
  );
  await fs.writeFile(snapshot, JSON.stringify({ count: 1 }), "utf8");
  const { packFile, pack } = await makePack(
    snapshot,
    ["-e", "setTimeout(() => {}, 1000)"],
    100,
  );
  const result = await runPack(pack, {
    source: packFile,
    allowUnsafeProbes: true,
  });
  assert.equal(result.executionError?.kind, "timeout");
  assert.equal(result.assertions.length, 0);
  assert.equal(result.effects[0]?.observerStatus, "inconclusive");
});
