import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const node = process.execPath;
const cli = path.join(root, "dist", "cli.js");

function run(program, args, input = undefined) {
  const result = spawnSync(program, args, {
    cwd: root,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  assert.equal(
    result.status,
    0,
    `${program} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

const nodeStream = run(node, [
  path.join(root, "examples/adapters/jsonl-node-example.mjs"),
]);
const nodeBridge = JSON.parse(
  run(node, [cli, "bridge", "--format", "json"], nodeStream),
);
assert.equal(nodeBridge.terminalStatus, "complete");
assert.equal(
  nodeBridge.events.filter((event) => event.kind === "state_snapshot").length,
  1,
);

const python = process.platform === "win32" ? "python" : "python3";
const pythonProbe = spawnSync(python, ["--version"], {
  cwd: root,
  encoding: "utf8",
  stdio: "ignore",
});
if (pythonProbe.status === 0) {
  const pythonStream = run(python, [
    path.join(root, "examples/adapters/jsonl-python-example.py"),
  ]);
  const pythonBridge = JSON.parse(
    run(node, [cli, "bridge", "--format", "json"], pythonStream),
  );
  assert.equal(pythonBridge.terminalStatus, "complete");
  assert.equal(pythonBridge.adapter.id, "python-example");
} else {
  console.log(
    "Python is not installed; skipped the executable Python adapter example.",
  );
}

const consumer = run(node, [
  path.join(root, "examples/consumers/node-api-example.mjs"),
]);
assert.match(consumer, /All assertions passed\.|Assertions:/);
await fs.access(path.join(root, "examples/consumers/agent_crash_test.py"));
console.log("Adapter and consumer examples passed.");
