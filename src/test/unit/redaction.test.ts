import assert from "node:assert/strict";
import test from "node:test";
import { redact, redactText, redactUnknown } from "../../redaction.js";
import { stableStringify } from "../../stable.js";

test("redacts sensitive object keys and token-shaped text", () => {
  assert.deepEqual(redact({ password: "secret", okay: "yes" }), {
    password: "[REDACTED]",
    okay: "yes",
  });
  assert.match(redactText("Bearer abcdefghijklmnopqrstuvwxyz"), /\[REDACTED\]/);
});

test("report sanitization handles cycles and non-JSON scalar values", () => {
  const value: Record<string, unknown> = { token: "do-not-leak" };
  value.self = value;
  value.count = BigInt(7);
  const sanitized = redactUnknown(value) as Record<string, unknown>;
  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.self, "[CIRCULAR]");
  assert.equal(sanitized.count, "[REDACTED]");
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => stableStringify(cyclic as never), /cyclic JSON value/);
  assert.throws(() => stableStringify({ count: BigInt(7) } as never), /BigInt/);
});
