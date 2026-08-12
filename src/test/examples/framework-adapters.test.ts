import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseJsonl } from "../../jsonl.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const python = process.env.PYTHON ?? "python3";

function adapterPath(adapter: string): string {
  return path.join(root, "examples", "frameworks", adapter, "adapter.py");
}

function runAdapter(adapter: string, args: string[]) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
  };
  delete env.OPENAI_API_KEY;
  const run = spawnSync(python, [adapterPath(adapter), ...args], {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(run.signal, null, run.stderr);
  return run;
}

for (const adapter of ["mcp-agent", "openai-agents-sdk"]) {
  test(`${adapter} adapter emits valid deterministic JSONL for broken and fixed paths`, () => {
    for (const scenario of ["broken", "fixed"] as const) {
      const run = runAdapter(adapter, [
        "--mode",
        "offline",
        "--scenario",
        scenario,
      ]);
      assert.equal(run.status, scenario === "broken" ? 1 : 0, run.stderr);
      const normalized = parseJsonl(run.stdout);
      assert.equal(normalized.determinism, "deterministic");
      assert.equal(normalized.adapter.realClient, false);
      assert.equal(normalized.adapter.responseMutation, true);
      assert.equal(normalized.adapter.stateObservation, true);
      assert.equal(
        normalized.terminalStatus,
        scenario === "broken" ? "failed" : "complete",
      );
      assert.equal(
        normalized.events.filter((event) => event.kind === "physical_call")
          .length,
        2,
      );
      const snapshots = normalized.events.filter(
        (event) => event.kind === "state_snapshot",
      );
      assert.equal(snapshots.length, 2);
      assert.deepEqual(snapshots.at(-1)?.observerValue, {
        count: scenario === "broken" ? 2 : 1,
      });
    }
  });

  test(`${adapter} dependency check and real-mode skip never need credentials`, () => {
    const check = runAdapter(adapter, ["--mode", "check"]);
    assert.equal(check.status, 0, check.stderr);
    const availability = JSON.parse(check.stdout) as {
      adapter: string;
      available: boolean;
      status: string;
    };
    assert.equal(typeof availability.adapter, "string");
    assert.equal(typeof availability.available, "boolean");
    assert.ok(["available", "skipped"].includes(availability.status));

    const skipped = runAdapter(adapter, ["--mode", "real"]);
    assert.equal(skipped.status, 0, skipped.stderr);
    const skipResult = JSON.parse(skipped.stdout) as {
      status: string;
      reason: string;
    };
    assert.equal(skipResult.status, "skipped");
    assert.match(
      skipResult.reason,
      /is not installed|OPENAI_API_KEY is not set/,
    );
  });
}
