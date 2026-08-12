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

const cases = [
  {
    mutation: "timeout",
    control: "timeout-retry-idempotent.yaml",
    failing: "../packs/timeout-retry-duplicates.yaml",
  },
  {
    mutation: "retryable_error",
    control: "retryable-error-idempotent.yaml",
    failing: "../packs/retryable-error-duplicates.yaml",
  },
  {
    mutation: "malformed_result",
    control: "malformed-result-valid.yaml",
    failing: "../packs/malformed-output.yaml",
  },
  {
    mutation: "stale_result",
    control: "stale-result-fresh.yaml",
    failing: "../packs/stale-output.yaml",
  },
  {
    mutation: "duplicate_call",
    control: "duplicate-call-single.yaml",
    failing: "../packs/duplicate-call-duplicates.yaml",
  },
  {
    mutation: "permission_denied",
    control: "permission-denied-handled.yaml",
    failing: "permission-denied-incorrect-success.yaml",
  },
  {
    mutation: "commit_then_response_lost",
    control: "commit-then-response-lost-idempotent.yaml",
    failing: "../packs/commit-then-response-lost-duplicates.yaml",
  },
  {
    mutation: "disconnect_after_commit",
    control: "disconnect-after-commit-idempotent.yaml",
    failing: "../packs/disconnect-after-commit-duplicates.yaml",
  },
  {
    mutation: "partial_success",
    control: "partial-success-reconciled.yaml",
    failing: "../packs/partial-success-duplicates.yaml",
  },
  {
    mutation: "stale_read_then_conflicting_write",
    control: "stale-read-conflict-protected.yaml",
    failing: "../packs/stale-read-conflict-lost-update.yaml",
  },
];

for (const scenario of cases) {
  test(`${scenario.mutation} has a passing control and failing case`, async () => {
    const controlSource = path.join(
      root,
      "examples/controls",
      scenario.control,
    );
    const failingSource = path.join(
      root,
      "examples/controls",
      scenario.failing,
    );
    const control = await loadPack(controlSource);
    const failing = await loadPack(failingSource);
    const passingResult = await runPack(control.pack, {
      source: controlSource,
    });
    const failingResult = await runPack(failing.pack, {
      source: failingSource,
    });
    assert.equal(passingResult.findings.length, 0);
    assert.ok(
      failingResult.findings.length > 0,
      `${scenario.mutation} negative control should produce a finding`,
    );
    assert.ok(
      failing.pack.mutations?.some(
        (mutation) =>
          mutation.type === scenario.mutation && mutation.seed !== undefined,
      ),
      `${scenario.mutation} negative control must declare a stable seed`,
    );
  });
}
