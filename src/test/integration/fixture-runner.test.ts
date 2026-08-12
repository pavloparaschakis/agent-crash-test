import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("fixture runner applies an injected duplicate and evaluates effect assertions", async () => {
  const source = path.join(root, "examples/packs/fixture-duplicate-call.yaml");
  const { pack } = await loadPack(source);
  const result = await runPack(pack, {
    source,
    requestTimeoutMs: 1234,
    maxRunMs: 5678,
  });
  assert.equal(result.transport, "fixture");
  assert.equal(result.effects[0]?.value, 2);
  assert.equal(result.findings.length, 0);
  assert.equal(
    result.manifest.find((tool) => tool.name === "create_invoice")
      ?.outputSchema,
    undefined,
  );
  assert.match(result.reproduction.command, /--request-timeout-ms 1234/);
  assert.match(result.reproduction.command, /--max-run-ms 5678/);
});
