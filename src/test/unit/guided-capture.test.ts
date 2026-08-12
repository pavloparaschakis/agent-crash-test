import assert from "node:assert/strict";
import test from "node:test";
import {
  authorGuidedCapture,
  confirmGuidedCapture,
  proposeGuidedCapture,
  type GuidedCaptureConfirmations,
} from "../../guided-capture.js";
import { validatePackSemantics } from "../../pack.js";
import type { ProxyCapture, ProxyCaptureEvent } from "../../proxy.js";
import type { JsonObject } from "../../types.js";

function event(
  sequence: number,
  value: Partial<ProxyCaptureEvent>,
): ProxyCaptureEvent {
  return {
    sequence,
    timestamp: `2026-01-01T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    side: "client",
    kind: "request",
    physicalCall: false,
    ...value,
  };
}

function capture(
  calls: Array<{ tool: string; arguments?: JsonObject }> = [
    { tool: "create_invoice", arguments: { request_id: "req_1" } },
  ],
  toolMetadata: Array<{
    name: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  }> = [
    { name: "create_invoice", readOnlyHint: false },
    { name: "get_state", readOnlyHint: true },
  ],
  extraEvents: ProxyCaptureEvent[] = [],
): ProxyCapture {
  const events: ProxyCaptureEvent[] = [
    event(1, {
      side: "target",
      kind: "response",
      message: {
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: toolMetadata.map((tool) => ({
            name: tool.name,
            annotations: {
              ...(tool.readOnlyHint === undefined
                ? {}
                : { readOnlyHint: tool.readOnlyHint }),
              ...(tool.destructiveHint === undefined
                ? {}
                : { destructiveHint: tool.destructiveHint }),
            },
          })),
        },
      },
    }),
    ...calls.map((call, index) =>
      event(index + 2, {
        method: "tools/call",
        tool: call.tool,
        requestId: index + 10,
        message: {
          jsonrpc: "2.0",
          id: index + 10,
          method: "tools/call",
          params: { name: call.tool, arguments: call.arguments ?? {} },
        },
      }),
    ),
    ...extraEvents,
  ];
  return {
    schemaVersion: 1,
    captureId: "capture-random-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    target: { command: "node", args: ["server.js"], cwd: "." },
    determinism: "partial",
    events,
    warnings: [],
  };
}

function confirmations(
  overrides: Partial<GuidedCaptureConfirmations> = {},
): GuidedCaptureConfirmations {
  return {
    target: {
      confirmed: true,
      tool: "create_invoice",
      sideEffecting: true,
    },
    mutationProfile: { confirmed: true, value: "ambiguous-commit" },
    observer: {
      confirmed: true,
      id: "invoice-count",
      source: "tool",
      tool: "get_state",
      path: "invoices.length",
    },
    effect: {
      confirmed: true,
      class: "create",
      expected: 1,
      description: "Exactly one invoice must exist after creation.",
    },
    cardinality: { confirmed: true, value: "exactly_once" },
    forbidden: {
      confirmed: true,
      value: [
        {
          expected: 2,
          description: "A retry must not create a second invoice.",
        },
      ],
    },
    ordering: { confirmed: true, value: [] },
    ...overrides,
  };
}

test("classifies unannotated calls as ambiguous and detects ambiguous outcomes", () => {
  const ambiguousOutcome = event(8, {
    side: "client",
    kind: "response",
    tool: "update_profile",
    commitStatus: "committed",
    responseStatus: "lost",
    message: { jsonrpc: "2.0", id: 10, error: { code: -32001 } },
  });
  const proposal = proposeGuidedCapture(
    capture(
      [{ tool: "update_profile", arguments: { display_name: "Ada" } }],
      [{ name: "update_profile" }, { name: "get_state", readOnlyHint: true }],
      [ambiguousOutcome],
    ),
  );
  assert.equal(proposal.sideEffectingCalls.length, 0);
  assert.equal(proposal.ambiguousCalls[0]?.tool, "update_profile");
  assert.deepEqual(proposal.ambiguousCalls[0]?.outcomeSignals, [
    "committed_response_lost",
  ]);
  assert.equal(
    proposal.ambiguousCalls[0]?.mutationProfiles[0]?.id,
    "ambiguous-commit",
  );
});

test("groups duplicate logical calls and prioritizes duplicate delivery", () => {
  const proposal = proposeGuidedCapture(
    capture([
      { tool: "create_invoice", arguments: { request_id: "req_1" } },
      { tool: "create_invoice", arguments: { request_id: "req_1" } },
    ]),
  );
  assert.equal(proposal.calls[0]?.occurrences, 2);
  assert.equal(proposal.calls[0]?.argumentSamples.length, 1);
  assert.equal(
    proposal.calls[0]?.mutationProfiles[0]?.id,
    "duplicate-delivery",
  );
});

test("returns a review-required proposal when no tool calls were captured", () => {
  const proposal = proposeGuidedCapture(capture([]));
  assert.deepEqual(proposal.calls, []);
  assert.deepEqual(proposal.sideEffectingCalls, []);
  assert.ok(
    proposal.warnings.some((warning) => /no client tools\/call/i.test(warning)),
  );
  assert.throws(
    () => confirmGuidedCapture(proposal, confirmations()),
    /was not called in the capture/,
  );
});

test("refuses observers not proven read-only or explicitly approved", () => {
  const proposal = proposeGuidedCapture(capture());
  assert.throws(
    () =>
      confirmGuidedCapture(
        proposal,
        confirmations({
          observer: {
            confirmed: true,
            id: "unsafe-state",
            source: "tool",
            tool: "create_invoice",
            path: "invoices.length",
          },
        }),
      ),
    /Unsafe observer refused.*readOnlyHint=true/,
  );
  assert.throws(
    () =>
      confirmGuidedCapture(
        proposal,
        confirmations({
          observer: {
            confirmed: true,
            id: "shell-state",
            source: "json_command",
            command: "node",
            args: ["inspect-state.js"],
            path: "invoices.length",
            explicitUnsafeOptIn: false as unknown as true,
          },
        }),
      ),
    /Unsafe observer refused.*explicitUnsafeOptIn=true/,
  );
});

test("authors an explicitly approved JSON command observer", () => {
  const proposal = proposeGuidedCapture(capture());
  const review = confirmGuidedCapture(
    proposal,
    confirmations({
      observer: {
        confirmed: true,
        id: "database-state",
        source: "json_command",
        command: "node",
        args: ["inspect-state.js"],
        path: "invoices.length",
        explicitUnsafeOptIn: true,
      },
    }),
  );
  assert.equal(review.summary.observerSource, "json_command");
  assert.equal(review.summary.observerSafety, "explicit_unsafe_opt_in");
  assert.equal(review.pack.execution?.allow_unsafe_probes, true);
  assert.deepEqual(review.pack.effect_probes?.[0], {
    id: "database-state",
    source: "json_command",
    command: "node",
    args: ["inspect-state.js"],
    path: "invoices.length",
    safety: "explicit_unsafe_opt_in",
  });
});

test("requires every explicit confirmation and emits a validated pack", () => {
  const proposal = proposeGuidedCapture(
    capture([
      { tool: "get_state" },
      { tool: "create_invoice", arguments: { request_id: "req_1" } },
    ]),
  );
  const ordering = [
    {
      before: "get_state",
      after: "create_invoice",
      description: "State must be checked before creation.",
    },
  ];
  const review = confirmGuidedCapture(
    proposal,
    confirmations({ ordering: { confirmed: true, value: ordering } }),
  );
  assert.equal(review.summary.status, "ready");
  assert.equal(review.summary.validation, "passed");
  assert.equal(review.summary.observerSafety, "declared_read_only");
  assert.equal(review.summary.forbiddenExpectationCount, 1);
  assert.deepEqual(review.pack.effect_contracts?.[0]?.ordering, ordering);
  assert.equal(review.pack.effect_contracts?.[0]?.intended[0]?.expected, 1);
  assert.equal(review.pack.mutations?.[0]?.type, "commit_then_response_lost");
  validatePackSemantics(review.pack, "guided-test");

  assert.throws(
    () =>
      confirmGuidedCapture(
        proposal,
        confirmations({
          cardinality: {
            confirmed: false,
            value: "exactly_once",
          } as never,
        }),
      ),
    /Explicit confirmation is required for cardinality/,
  );
});

test("proposal and authored pack output are deterministic", () => {
  const firstCapture = capture();
  const secondCapture = {
    ...capture(),
    captureId: "different-random-id",
    createdAt: "2030-12-31T23:59:59.000Z",
    events: capture().events.map((value) => ({
      ...value,
      timestamp: "2030-12-31T23:59:59.000Z",
    })),
  };
  const firstProposal = proposeGuidedCapture(firstCapture);
  const secondProposal = proposeGuidedCapture(secondCapture);
  assert.deepEqual(firstProposal, secondProposal);
  assert.deepEqual(
    confirmGuidedCapture(firstProposal, confirmations()),
    confirmGuidedCapture(secondProposal, confirmations()),
  );
});

test("redacts sensitive captured inputs before proposal and pack generation", () => {
  const raw = capture([
    {
      tool: "create_invoice",
      arguments: {
        api_key: "sk-super-secret-value-123456789",
        note: "Bearer abcdefghijklmnopqrstuvwxyz",
      },
    },
  ]);
  raw.target.args.push("--token=secret-value");
  const proposal = proposeGuidedCapture(raw);
  const serializedProposal = JSON.stringify(proposal);
  assert.doesNotMatch(
    serializedProposal,
    /super-secret|abcdefghijklmnopqrstuvwxyz|secret-value/,
  );
  assert.match(serializedProposal, /\[REDACTED\]/);

  const review = authorGuidedCapture(raw, confirmations());
  const serializedPack = JSON.stringify(review.pack);
  assert.doesNotMatch(
    serializedPack,
    /super-secret|abcdefghijklmnopqrstuvwxyz|secret-value/,
  );
  assert.match(serializedPack, /\[REDACTED\]/);
});
