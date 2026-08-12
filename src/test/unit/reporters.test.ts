import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  isBlocking,
  markdownReport,
  terminalReport,
  writeReports,
} from "../../reporters.js";
import type { RunResult } from "../../types.js";

test("JSON reports redact secret-shaped values", async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "agent-crash-test-"));
  const result: RunResult = {
    schemaVersion: 1,
    identity: {
      runId: "run-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      runnerVersion: "0.1.0",
      reportSchemaVersion: 1,
      packSchemaVersion: 1,
      packId: "test/redaction",
      packSource: "pack.yaml",
      platform: { os: "test", arch: "test", node: "test" },
      determinism: "deterministic",
      packSha256: "abcdef1234567890",
    },
    pack: { id: "test/redaction", name: "redaction", source: "pack.yaml" },
    transport: "fixture",
    server: { fixture: "fixture.yaml", toolCount: 0 },
    manifest: [],
    mutations: [],
    events: [
      {
        eventId: "event-1",
        sequence: 1,
        kind: "step",
        stepId: "call",
        tool: "read",
        arguments: { token: "super-secret" },
        attempt: 1,
        output: { value: "Bearer abcdefghijklmnopqrstuvwxyz" },
        error: { kind: "server_error", message: "token=super-secret" },
        mutationIds: [],
        durationMs: 1,
        physicalCall: true,
        redactionApplied: true,
      },
    ],
    effects: [
      {
        id: "secret-effect",
        source: "fixture_state",
        path: "secret",
        value: "ghp_abcdefghijklmnopqrstuvwxyz",
        observed: "ghp_abcdefghijklmnopqrstuvwxyz",
        safety: "fixture",
      },
    ],
    assertions: [],
    findings: [],
    reproduction: {
      command: "cd /tmp && node dist/cli.js run pack.yaml",
      workingDirectory: "/tmp",
      packPath: "/tmp/pack.yaml",
    },
    executionWarnings: [],
    policy: {
      failOn: "error",
      networkBoundary: "not_enforced",
      credentialPolicy: "minimal_environment",
      processClosed: true,
    },
  };
  const written = await writeReports(result, output, ["json"]);
  const content = await fs.readFile(written.json!, "utf8");
  assert.match(content, /"reproduction"/);
  assert.match(
    markdownReport(result),
    /cd \/tmp && node dist\/cli\.js run pack\.yaml/,
  );
  assert.doesNotMatch(content, /super-secret/);
  assert.match(content, /\[REDACTED\]/);
  assert.doesNotMatch(terminalReport(result), /super-secret/);
  assert.doesNotMatch(markdownReport(result), /super-secret/);
  if (process.platform !== "win32") {
    const mode = (await fs.stat(written.json!)).mode & 0o777;
    assert.equal(mode, 0o600);
  }

  const collisionResult: RunResult = {
    ...result,
    pack: { ...result.pack, name: "same id, changed pack" },
    identity: { ...result.identity, packSha256: "fedcba9876543210" },
  };
  const collisionWritten = await writeReports(collisionResult, output, [
    "json",
  ]);
  assert.notEqual(written.json, collisionWritten.json);
  assert.equal((await fs.readdir(output)).length, 2);

  const extended = await writeReports(result, output, [
    "junit",
    "github-summary",
    "sarif",
  ]);
  assert.ok(extended.junit?.endsWith(".xml"));
  assert.match(await fs.readFile(extended.junit!, "utf8"), /<testsuite/);
  assert.match(
    await fs.readFile(extended["github-summary"]!, "utf8"),
    /Agent Crash Test/,
  );
  const sarif = JSON.parse(await fs.readFile(extended.sarif!, "utf8")) as {
    version: string;
  };
  assert.equal(sarif.version, "2.1.0");

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  (result.events[0] as unknown as { output: unknown }).output = cyclic;
  const cycleOutput = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-cycle-report-"),
  );
  const cycleWritten = await writeReports(result, cycleOutput, ["json"]);
  const cycleContent = await fs.readFile(cycleWritten.json!, "utf8");
  assert.match(cycleContent, /\[CIRCULAR\]/);

  result.findings = [
    {
      id: "informational",
      severity: "warning",
      status: "failed",
      message: "A non-blocking warning",
      evidenceEventIds: [],
      reproduction: {
        command: "node dist/cli.js run pack.yaml",
        packPath: "pack.yaml",
      },
      redactionApplied: true,
    },
  ];
  assert.match(markdownReport(result), /Status: PASS/);
  assert.equal(isBlocking(result, "error"), false);
  assert.equal(isBlocking(result, "warning"), true);
});
