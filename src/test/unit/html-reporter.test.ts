import assert from "node:assert/strict";
import test from "node:test";
import { renderHtmlReport } from "../../html-reporter.js";
import type { RunResult } from "../../types.js";

function sampleResult(): RunResult {
  return {
    schemaVersion: 1,
    identity: {
      runId: "run-<unsafe>",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      runnerVersion: "0.1.0",
      reportSchemaVersion: 1,
      packSchemaVersion: 1,
      packId: "test/html",
      packSource: "pack.yaml",
      packSha256: "abcdef1234567890",
      platform: { os: "test", arch: "test", node: "test" },
      determinism: "deterministic",
    },
    pack: {
      id: "test/html",
      name: `<img src=x onerror="globalThis.pwned=true">`,
      source: "pack.yaml",
    },
    transport: "fixture",
    server: { fixture: "fixture.yaml", toolCount: 1 },
    manifest: [],
    mutations: [
      {
        id: "lost-response",
        type: "commit_then_response_lost",
        version: "1",
        parameters: {},
        result: "applied",
      },
    ],
    events: [
      {
        eventId: "event-1",
        sequence: 1,
        kind: "step",
        tool: `write</script><script>globalThis.pwned=true</script>`,
        arguments: {
          apiKey: "sk-abcdefghijklmnop",
          note: "token=raw-event-secret",
        },
        output: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz" },
        attempt: 1,
        mutationIds: ["lost-response"],
        durationMs: 2,
        physicalCall: true,
        redactionApplied: false,
      },
    ],
    effects: [
      {
        id: "rows",
        source: "fixture_state",
        path: "rows",
        value: 2,
        before: 0,
        after: 2,
        expected: 1,
        observed: 2,
        observerStatus: "changed",
        safety: "fixture",
      },
    ],
    assertions: [{ id: "once", passed: false }],
    findings: [
      {
        id: "duplicate-transition",
        severity: "error",
        status: "failed",
        category: "duplicate_transition",
        message: `<svg onload="globalThis.pwned=true"> token=raw-finding-secret`,
        evidence: { password: "raw-password", rows: 2 },
        expected: 1,
        observed: 2,
        evidenceEventIds: ["event-1"],
        remediation: `Use idempotency keys; never render </textarea>.`,
        reproduction: {
          command: `node cli.js --token=raw-command-secret '<script>'`,
          packPath: "pack.yaml",
        },
        redactionApplied: false,
      },
    ],
    reproduction: {
      command: `node cli.js --token=raw-top-level-secret '<script>'`,
      packPath: "pack.yaml",
    },
    executionWarnings: [`Unsafe <b>warning</b> secret=raw-warning-secret`],
    policy: {
      failOn: "error",
      networkBoundary: "not_enforced",
      credentialPolicy: "minimal_environment",
      processClosed: true,
    },
  };
}

test("HTML report escapes untrusted values and defensively redacts secrets", () => {
  const result = sampleResult();
  const originalName = result.pack.name;
  const html = renderHtmlReport(result, {
    title: `<title-breakout></title><script>bad()</script>`,
  });

  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<svg onload/);
  assert.doesNotMatch(html, /<script>globalThis\.pwned/);
  assert.match(
    html,
    /&lt;img src=x onerror=&quot;globalThis\.pwned=true&quot;&gt;/,
  );
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;globalThis\.pwned=true/);
  assert.match(html, /&lt;title-breakout&gt;/);

  for (const secret of [
    "abcdefghijklmnop",
    "raw-event-secret",
    "raw-finding-secret",
    "raw-password",
    "raw-command-secret",
    "raw-top-level-secret",
    "raw-warning-secret",
  ])
    assert.doesNotMatch(html, new RegExp(secret));
  assert.match(html, /\[REDACTED\]/);
  assert.match(html, /redacted again during HTML rendering/i);
  assert.equal(
    result.pack.name,
    originalName,
    "rendering must not mutate input",
  );
});

test("HTML report includes findings, filtering, timeline, and state diff", () => {
  const html = renderHtmlReport(sampleResult());

  assert.match(html, /id="report-search"/);
  assert.match(html, /data-severity-toggle value="error"/);
  assert.match(html, /id="findings"/);
  assert.match(html, /duplicate-transition/);
  assert.match(html, /id="state-diff"/);
  assert.match(html, />Before</);
  assert.match(html, />After</);
  assert.match(html, /id="timeline"/);
  assert.match(html, /Event evidence/);
  assert.match(html, /connect-src &#39;none&#39;|connect-src 'none'/);
  assert.match(html, /no telemetry or network requests/i);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href=/);
});

test("HTML report renders empty successful runs without failing", () => {
  const result = sampleResult();
  result.events = [];
  result.effects = [];
  result.assertions = [];
  result.findings = [];
  result.mutations = [];
  result.executionWarnings = [];

  const html = renderHtmlReport(result, {
    generatedAt: "2026-02-03T04:05:06.000Z",
  });
  assert.match(html, /verdict-pass/);
  assert.match(html, />PASS</);
  assert.match(html, /No findings match/);
  assert.match(html, /Completed 2026-02-03T04:05:06\.000Z/);
});
