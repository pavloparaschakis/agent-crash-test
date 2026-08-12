import assert from "node:assert/strict";
import test from "node:test";
import { MutationController } from "../../mutations.js";

test("stale result returns the preceding successful response", async () => {
  const controller = new MutationController([
    { id: "stale", type: "stale_result", applies_to: "read", occurrence: 2 },
  ]);
  await controller.after(
    { output: { id: "first" } },
    "read",
    controller.matching("read"),
    "event-1",
    async () => ({ output: null }),
  );
  const outcome = await controller.after(
    { output: { id: "second" } },
    "read",
    controller.matching("read"),
    "event-2",
    async () => ({ output: null }),
  );
  assert.deepEqual(outcome.output, { id: "first" });
});

test("permission denial prevents the underlying call", () => {
  const controller = new MutationController([
    { id: "deny", type: "permission_denied" },
  ]);
  const outcome = controller.preflight(controller.matching("write"));
  assert.equal(outcome?.outcome.error?.kind, "permission_denied");
});

test("stale results are scoped by tool and retain their source event", async () => {
  const controller = new MutationController([
    {
      id: "stale-customer",
      type: "stale_result",
      applies_to: "get_customer",
      occurrence: 2,
    },
  ]);
  await controller.after(
    { output: { customer: { id: "cus_1" } } },
    "get_customer",
    controller.matching("get_customer"),
    "event-1",
    async () => ({ output: null }),
    { customer_id: "cus_1" },
  );
  await controller.after(
    { output: { invoice: { id: "inv_1" } } },
    "create_invoice",
    controller.matching("create_invoice"),
    "event-2",
    async () => ({ output: null }),
    { request_id: "req-1" },
  );
  const current = await controller.after(
    { output: { customer: { id: "cus_2" } } },
    "get_customer",
    controller.matching("get_customer"),
    "event-3",
    async () => ({ output: null }),
    { customer_id: "cus_2" },
  );
  assert.deepEqual(current.output, { customer: { id: "cus_1" } });
  assert.equal(
    controller.recordsForReport()[0]?.parameters.source_event_id,
    "event-1",
  );
});

test("a first-call stale mutation fails instead of borrowing another tool response", async () => {
  const controller = new MutationController([
    { id: "stale", type: "stale_result", applies_to: "read", occurrence: 1 },
  ]);
  await controller.after(
    { output: { written: true } },
    "write",
    controller.matching("write"),
    "event-1",
    async () => ({ output: null }),
  );
  const current = await controller.after(
    { output: { fresh: true } },
    "read",
    controller.matching("read"),
    "event-2",
    async () => ({ output: null }),
  );
  assert.deepEqual(current.output, { fresh: true });
  assert.equal(controller.recordsForReport()[0]?.result, "failed");
});

test("a delayed timeout mutation respects the remaining run budget", async () => {
  const controller = new MutationController([
    { id: "slow-timeout", type: "timeout", duration_ms: 250 },
  ]);
  const started = Date.now();
  await assert.rejects(
    controller.after(
      { output: { ok: true } },
      "write",
      controller.matching("write"),
      "event-1",
      async () => ({ output: null }),
      undefined,
      10,
    ),
    /remaining run budget/,
  );
  assert.ok(Date.now() - started < 100);
  assert.equal(controller.recordsForReport()[0]?.result, "failed");
});

test("expanded mutations preserve commit, response, and phase semantics", async () => {
  const cases = [
    {
      type: "commit_then_response_lost" as const,
      error: "timeout",
      commit: "committed" as const,
      response: "lost" as const,
      phase: "after_commit_before_response" as const,
    },
    {
      type: "disconnect_after_commit" as const,
      error: "transport_error",
      commit: "committed" as const,
      response: "lost" as const,
      phase: "client_visible_transport_failure" as const,
    },
    {
      type: "partial_success" as const,
      error: "retryable_error",
      commit: "committed" as const,
      response: "returned" as const,
      phase: "after_commit_before_response" as const,
    },
  ];
  for (const scenario of cases) {
    const controller = new MutationController([
      { id: scenario.type, type: scenario.type },
    ]);
    const outcome = await controller.after(
      { output: { partial: true } },
      "write",
      controller.matching("write"),
      "event-1",
      async () => ({ output: null }),
    );
    assert.equal(outcome.error?.kind, scenario.error);
    assert.equal(outcome.commitStatus, scenario.commit);
    assert.equal(outcome.responseStatus, scenario.response);
    assert.equal(outcome.mutationPhase, scenario.phase);
    assert.equal(controller.recordsForReport()[0]?.phase, scenario.phase);
  }
});

test("stale read then conflicting write is scoped to the same request context", async () => {
  const controller = new MutationController([
    {
      id: "stale-conflict",
      type: "stale_read_then_conflicting_write",
      applies_to: "read",
      occurrence: 2,
    },
  ]);
  await controller.after(
    { output: { version: 1 } },
    "read",
    controller.matching("read"),
    "event-1",
    async () => ({ output: null }),
    { request_id: "same" },
  );
  const outcome = await controller.after(
    { output: { version: 2 } },
    "read",
    controller.matching("read"),
    "event-2",
    async () => ({ output: null }),
    { request_id: "same" },
  );
  assert.deepEqual(outcome.output, { version: 1 });
  assert.equal(outcome.mutationPhase, "observer_only");
});

test("rate limit blocks before the call and exposes deterministic Retry-After details", () => {
  const controller = new MutationController([
    {
      id: "limited",
      type: "rate_limit",
      applies_to: "search",
      occurrence: 2,
      retry_after_ms: 1250,
    },
  ]);

  assert.equal(controller.preflight(controller.matching("search")), undefined);
  const decision = controller.preflight(
    controller.matching("search"),
    "event-2",
  );

  assert.equal(decision?.outcome.error?.kind, "rate_limit");
  assert.equal(decision?.outcome.error?.code, 429);
  assert.equal(decision?.outcome.error?.retryable, true);
  assert.equal(decision?.outcome.error?.details?.retry_after_ms, 1250);
  assert.equal(decision?.outcome.error?.details?.retry_after_header, "2");
  assert.equal(decision?.outcome.commitStatus, "not_attempted");
  assert.equal(decision?.outcome.mutationPhase, "before_underlying_call");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.recovery,
    "honor_retry_after_then_retry_with_bounded_backoff",
  );
});

test("schema drift removes a nested field without mutating the original output", async () => {
  const original = {
    output: { user: { id: "usr_1", profile: { email: "a@example.test" } } },
  };
  const controller = new MutationController([
    {
      id: "removed-email",
      type: "schema_drift",
      remove_path: "/user/profile/email",
    },
  ]);

  const outcome = await controller.after(
    original,
    "get_user",
    controller.matching("get_user"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.deepEqual(outcome.output, {
    user: { id: "usr_1", profile: {} },
  });
  assert.deepEqual(original.output.user.profile, {
    email: "a@example.test",
  });
  assert.equal(outcome.responseStatus, "corrupted");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.transformation,
    "field_removed",
  );
});

test("schema drift is a controlled no-op when its field does not exist", async () => {
  const controller = new MutationController([
    {
      id: "missing-field",
      type: "schema_drift",
      remove_path: "$.result.removed",
    },
  ]);
  const original = { output: { result: { retained: true } } };
  const outcome = await controller.after(
    original,
    "read",
    controller.matching("read"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.deepEqual(outcome, original);
  assert.equal(controller.recordsForReport()[0]?.result, "failed");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.reason,
    "not_applicable_path_not_found",
  );
});

test("truncated response delivers a deterministic UTF-8 byte prefix", async () => {
  const controller = new MutationController([
    {
      id: "truncated",
      type: "truncated_response",
      truncate_after_bytes: 12,
    },
  ]);
  const outcome = await controller.after(
    { output: { status: "complete", rows: [1, 2, 3] } },
    "export",
    controller.matching("export"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.equal(outcome.output, '{"status":"c');
  assert.equal(outcome.responseStatus, "corrupted");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.delivered_bytes,
    12,
  );
});

test("truncated response leaves short responses intact and explains applicability", async () => {
  const controller = new MutationController([
    {
      id: "too-short",
      type: "truncated_response",
      truncate_after_bytes: 20,
    },
  ]);
  const original = { output: "short" };
  const outcome = await controller.after(
    original,
    "read",
    controller.matching("read"),
    "event-1",
    async () => ({ output: null }),
  );
  assert.deepEqual(outcome, original);
  assert.equal(controller.recordsForReport()[0]?.result, "failed");
});

test("out-of-order response deterministically misdelivers the prior contextual result", async () => {
  const controller = new MutationController([
    {
      id: "late-response",
      type: "out_of_order_response",
      applies_to: "lookup",
      occurrence: 2,
    },
  ]);
  await controller.after(
    { output: { value: "first" }, correlationId: "request-1" },
    "lookup",
    controller.matching("lookup"),
    "event-1",
    async () => ({ output: null }),
    { request_id: "shared" },
  );
  const outcome = await controller.after(
    { output: { value: "second" }, correlationId: "request-2" },
    "lookup",
    controller.matching("lookup"),
    "event-2",
    async () => ({ output: null }),
    { request_id: "shared" },
  );

  assert.deepEqual(outcome.output, { value: "first" });
  assert.equal(outcome.correlationId, "request-2");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.representation,
    "prior_success_delivered_for_current_request",
  );
});

test("corrupted pagination discovers and replaces a nested cursor deterministically", async () => {
  const original = {
    output: {
      data: { items: [{ id: 1 }], next_cursor: "valid-next-page" },
    },
  };
  const controller = new MutationController([
    { id: "bad-cursor", type: "corrupted_pagination_cursor" },
  ]);
  const outcome = await controller.after(
    original,
    "list_items",
    controller.matching("list_items"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.deepEqual(outcome.output, {
    data: {
      items: [{ id: 1 }],
      next_cursor: "__agent_crash_test_invalid_cursor__",
    },
  });
  assert.equal(original.output.data.next_cursor, "valid-next-page");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.cursor_path,
    "/data/next_cursor",
  );
});

test("corrupted pagination is a controlled no-op without a cursor", async () => {
  const controller = new MutationController([
    { id: "bad-cursor", type: "corrupted_pagination_cursor" },
  ]);
  const original = { output: { items: [] } };
  assert.deepEqual(
    await controller.after(
      original,
      "list_items",
      controller.matching("list_items"),
      "event-1",
      async () => ({ output: null }),
    ),
    original,
  );
  assert.equal(
    controller.recordsForReport()[0]?.parameters.reason,
    "not_applicable_cursor_not_found",
  );
});

test("slow stream delays complete response delivery while preserving the result", async () => {
  const controller = new MutationController([
    { id: "slow", type: "slow_stream", duration_ms: 1 },
  ]);
  const outcome = await controller.after(
    { output: { complete: true } },
    "generate",
    controller.matching("generate"),
    "event-1",
    async () => ({ output: null }),
    undefined,
    100,
  );

  assert.deepEqual(outcome.output, { complete: true });
  assert.equal(outcome.mutationPhase, "during_underlying_call");
  assert.equal(
    controller.recordsForReport()[0]?.parameters.representation,
    "delayed_complete_response_no_intermediate_chunks",
  );
});

test("slow stream fails fast when it cannot fit the remaining run budget", async () => {
  const controller = new MutationController([
    { id: "too-slow", type: "slow_stream", duration_ms: 100 },
  ]);
  await assert.rejects(
    controller.after(
      { output: "done" },
      "generate",
      controller.matching("generate"),
      "event-1",
      async () => ({ output: null }),
      undefined,
      2,
    ),
    /remaining run budget/,
  );
  assert.equal(controller.recordsForReport()[0]?.result, "failed");
});

test("progress stall returns an actionable timeout after a committed result", async () => {
  const controller = new MutationController([
    { id: "stalled", type: "progress_stall", duration_ms: 0 },
  ]);
  const outcome = await controller.after(
    { output: { created: true } },
    "create",
    controller.matching("create"),
    "event-1",
    async () => ({ output: null }),
  );

  assert.equal(outcome.error?.kind, "timeout");
  assert.equal(outcome.error?.details?.progress_events, 0);
  assert.equal(outcome.commitStatus, "committed");
  assert.equal(outcome.responseStatus, "lost");
  assert.equal(outcome.mutationPhase, "during_underlying_call");
});

test("advanced mutations retain standard tool and occurrence applicability controls", () => {
  const types = [
    "rate_limit",
    "schema_drift",
    "truncated_response",
    "out_of_order_response",
    "corrupted_pagination_cursor",
    "slow_stream",
    "progress_stall",
  ] as const;

  for (const type of types) {
    const controller = new MutationController([
      { id: type, type, applies_to: "target", occurrence: 2 },
    ]);
    assert.deepEqual(controller.matching("other"), []);
    assert.deepEqual(controller.matching("target"), []);
    assert.equal(controller.matching("target")[0]?.type, type);
  }
});
