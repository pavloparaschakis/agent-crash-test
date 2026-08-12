import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const expectations: Record<string, string | undefined> = {
  "commit-then-response-lost-duplicates.yaml": "exactly-one-invoice",
  "confirmation-extra-effect.yaml": "no-message-without-confirmation",
  "disconnect-after-commit-duplicates.yaml": "exactly-one-invoice",
  "duplicate-call-duplicates.yaml": "exactly-one-invoice",
  "malformed-output.yaml": "customer-id-preserved",
  "partial-success-duplicates.yaml": "exactly-one-invoice",
  "permission-denied-no-effect.yaml": undefined,
  "retryable-error-duplicates.yaml": "one-effect-after-retry",
  "stale-read-conflict-lost-update.yaml": "second-customer-is-fresh",
  "stale-output.yaml": "second-customer-is-fresh",
  "timeout-retry-duplicates.yaml": "exactly-one-invoice",
};

for (const [file, finding] of Object.entries(expectations)) {
  test(`demo pack ${file} has its documented outcome`, async () => {
    const source = path.join(root, "examples/packs", file);
    const { pack } = await loadPack(source);
    const result = await runPack(pack, { source });
    assert.equal(result.findings[0]?.id, finding);
  });
}

test("the demo directory has all stdio scenario packs under test", async () => {
  const files = await fs.readdir(path.join(root, "examples/packs"));
  assert.deepEqual(
    [
      ...files.filter(
        (file) =>
          file.endsWith(".yaml") && file !== "fixture-duplicate-call.yaml",
      ),
    ].sort(),
    Object.keys(expectations).sort(),
  );
});
