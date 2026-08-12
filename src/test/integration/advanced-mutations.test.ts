import assert from "node:assert/strict";
import test from "node:test";
import { MutationController } from "../../mutations.js";

test("advanced mutations compose deterministically in declaration order", async () => {
  const controller = new MutationController([
    {
      id: "remove-version",
      type: "schema_drift",
      applies_to: "get_account",
      remove_path: "/account/version",
    },
    {
      id: "truncate",
      type: "truncated_response",
      applies_to: "get_account",
      truncate_after_bytes: 20,
    },
  ]);
  const outcome = await controller.after(
    {
      output: {
        account: {
          id: "acct_1",
          version: 7,
          status: "active",
        },
      },
    },
    "get_account",
    controller.matching("get_account"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.equal(outcome.output, '{"account":{"id":"ac');
  assert.deepEqual(
    controller
      .recordsForReport()
      .map((record) => [record.id, record.result, record.phase]),
    [
      ["remove-version", "applied", "after_response_before_client"],
      ["truncate", "applied", "after_response_before_client"],
    ],
  );
});

test("pagination corruption supports explicit array paths and custom replacements", async () => {
  const controller = new MutationController([
    {
      id: "replace-cursor",
      type: "corrupted_pagination_cursor",
      cursor_path: "/pages/0/continuation",
      replacement: null,
    },
  ]);
  const original = {
    output: {
      pages: [{ continuation: "opaque-1", items: [1] }],
    },
  };
  const outcome = await controller.after(
    original,
    "list",
    controller.matching("list"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.deepEqual(outcome.output, {
    pages: [{ continuation: null, items: [1] }],
  });
  assert.equal(original.output.pages[0]?.continuation, "opaque-1");
});

test("out-of-order misdelivery never crosses tool or request contexts", async () => {
  const controller = new MutationController([
    {
      id: "misordered",
      type: "out_of_order_response",
      applies_to: "lookup",
      occurrence: 2,
    },
  ]);
  await controller.after(
    { output: "context-a" },
    "lookup",
    controller.matching("lookup"),
    "event-1",
    async () => ({ output: null }),
    { request_id: "a" },
  );
  await controller.after(
    { output: "another-tool" },
    "other",
    controller.matching("other"),
    "event-2",
    async () => ({ output: null }),
    { request_id: "b" },
  );
  const current = await controller.after(
    { output: "context-b" },
    "lookup",
    controller.matching("lookup"),
    "event-3",
    async () => ({ output: null }),
    { request_id: "b" },
  );

  assert.equal(current.output, "context-b");
  assert.equal(controller.recordsForReport()[0]?.result, "failed");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.reason,
    "not_applicable_no_prior_success_for_context",
  );
});

test("rate limiting is preflight-only and never invokes the underlying duplicate hook", async () => {
  const controller = new MutationController([
    { id: "limited", type: "rate_limit", retry_after_ms: 500 },
  ]);
  const matched = controller.matching("send");
  const decision = controller.preflight(matched, "event-1");
  let underlyingCalls = 0;
  if (!decision)
    await controller.after(
      { output: "sent" },
      "send",
      matched,
      "event-1",
      async () => {
        underlyingCalls++;
        return { output: "sent" };
      },
    );

  assert.equal(underlyingCalls, 0);
  assert.equal(decision?.outcome.commitStatus, "not_attempted");
  assert.equal(controller.recordsForReport()[0]?.result, "blocked");
});
