import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  startHostedService,
  stopHostedService,
  type HostedServiceOptions,
  type HostedRunRecord,
  type HostedRunSummary,
  type StartedHostedService,
} from "../../hosted-service.js";
import type { RunResult } from "../../types.js";

const API_TOKEN = "local-test-token-with-32-characters";

async function loopbackSkipReason(): Promise<string | undefined> {
  const server = http.createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES")
      return `loopback sockets are unavailable in this test environment (${code})`;
    throw error;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const networkSkip = await loopbackSkipReason();

function runResult(runId = "run-1"): RunResult {
  return {
    schemaVersion: 1,
    identity: {
      runId,
      startedAt: "2026-08-03T00:00:00.000Z",
      completedAt: "2026-08-03T00:00:01.000Z",
      runnerVersion: "0.1.0",
      reportSchemaVersion: 1,
      packSchemaVersion: 1,
      packId: "test/hosted-service",
      packSource: "examples/packs/fixture-duplicate-call.yaml",
      packSha256: "abcdef1234567890",
      platform: { os: "test", arch: "test", node: "20" },
      determinism: "deterministic",
    },
    pack: {
      id: "test/hosted-service",
      name: "Hosted service integration",
      source: "examples/packs/fixture-duplicate-call.yaml",
    },
    transport: "fixture",
    server: { fixture: "examples/fixtures/invoice.yaml", toolCount: 1 },
    manifest: [],
    mutations: [],
    events: [
      {
        eventId: "event-1",
        sequence: 1,
        kind: "step",
        stepId: "read",
        tool: "read_state",
        arguments: {},
        attempt: 1,
        output: { count: 1 },
        mutationIds: [],
        durationMs: 1,
        physicalCall: true,
        redactionApplied: true,
      },
    ],
    effects: [],
    assertions: [],
    findings: [],
    reproduction: {
      command: "agent-crash-test run pack.yaml",
      packPath: "pack.yaml",
    },
    executionWarnings: [],
    policy: {
      failOn: "error",
      networkBoundary: "not_enforced",
      credentialPolicy: "minimal_environment",
      processClosed: true,
    },
  };
}

async function createService(
  overrides: Partial<HostedServiceOptions> = {},
): Promise<{
  directory: string;
  service: StartedHostedService;
  cleanup(): Promise<void>;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-hosted-"),
  );
  const service = await startHostedService({
    dataDirectory: directory,
    apiToken: API_TOKEN,
    port: 0,
    ...overrides,
  });
  return {
    directory,
    service,
    async cleanup() {
      await service.stop();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

async function request(
  service: StartedHostedService,
  pathname: string,
  init: RequestInit = {},
  token: string | null = API_TOKEN,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${service.url}${pathname}`, { ...init, headers });
}

async function upload(
  service: StartedHostedService,
  run: RunResult,
): Promise<{ response: Response; summary: HostedRunSummary }> {
  const response = await request(service, "/v1/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(run),
  });
  return {
    response,
    summary: (await response.json()) as HostedRunSummary,
  };
}

test(
  "health is public while run APIs require a constant Bearer token",
  { skip: networkSkip },
  async (t) => {
    const context = await createService();
    t.after(() => context.cleanup());

    assert.equal(context.service.host, "127.0.0.1");
    const health = await request(context.service, "/health", {}, null);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      service: "agent-crash-test-hosted",
      storageSchemaVersion: 1,
    });
    assert.equal(health.headers.get("access-control-allow-origin"), null);

    const missing = await request(context.service, "/v1/runs", {}, null);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("www-authenticate") ?? "", /Bearer/);
    const incorrect = await request(
      context.service,
      "/v1/runs",
      {},
      "incorrect-but-long-enough-token",
    );
    assert.equal(incorrect.status, 401);
    assert.equal((await request(context.service, "/v1/runs")).status, 200);

    const preflight = await request(
      context.service,
      "/v1/runs",
      { method: "OPTIONS", headers: { Origin: "https://example.test" } },
      null,
    );
    assert.equal(preflight.status, 405);
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
  },
);

test(
  "upload, list, read, delete, and atomic file lifecycle are consistent",
  { skip: networkSkip },
  async (t) => {
    const context = await createService();
    t.after(() => context.cleanup());

    const created = await upload(context.service, runResult());
    assert.equal(created.response.status, 201);
    assert.equal(
      created.response.headers.get("location"),
      `/v1/runs/${created.summary.id}`,
    );
    assert.match(created.summary.id, /^[0-9a-f-]{36}$/);
    assert.equal(created.summary.runId, "run-1");
    assert.equal(created.summary.findingCount, 0);

    const listedResponse = await request(context.service, "/v1/runs?limit=10");
    assert.equal(listedResponse.status, 200);
    const listed = (await listedResponse.json()) as {
      runs: HostedRunSummary[];
      count: number;
      total: number;
    };
    assert.equal(listed.count, 1);
    assert.equal(listed.total, 1);
    assert.equal(listed.runs[0].id, created.summary.id);

    const readResponse = await request(
      context.service,
      `/v1/runs/${created.summary.id}`,
    );
    assert.equal(readResponse.status, 200);
    const stored = (await readResponse.json()) as HostedRunRecord;
    assert.equal(stored.storageSchemaVersion, 1);
    assert.deepEqual(stored.run, runResult());

    const runFiles = await fs.readdir(path.join(context.directory, "runs"));
    assert.deepEqual(runFiles, [`${created.summary.id}.json`]);
    if (process.platform !== "win32") {
      const fileMode =
        (await fs.stat(path.join(context.directory, "runs", runFiles[0])))
          .mode & 0o777;
      assert.equal(fileMode, 0o600);
    }

    assert.equal(
      (
        await request(context.service, `/v1/runs/${created.summary.id}`, {
          method: "DELETE",
        })
      ).status,
      204,
    );
    assert.equal(
      (await request(context.service, `/v1/runs/${created.summary.id}`)).status,
      404,
    );
    assert.equal(
      (
        await request(context.service, `/v1/runs/${created.summary.id}`, {
          method: "DELETE",
        })
      ).status,
      404,
    );
  },
);

test(
  "secret-shaped or non-redacted RunResults are rejected without persistence",
  { skip: networkSkip },
  async (t) => {
    const context = await createService();
    t.after(() => context.cleanup());

    const secretKeyRun = runResult("secret-key");
    secretKeyRun.events[0].arguments = { api_token: "plain-text-secret" };
    const secretKey = await upload(context.service, secretKeyRun);
    assert.equal(secretKey.response.status, 422);
    assert.equal(
      (secretKey.summary as unknown as { error: { code: string } }).error.code,
      "potential_secret_detected",
    );

    const secretTextRun = runResult("secret-text");
    secretTextRun.executionWarnings = [
      "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
    ];
    const secretText = await upload(context.service, secretTextRun);
    assert.equal(secretText.response.status, 422);

    const flagRun = runResult("bad-flag");
    flagRun.events[0].redactionApplied = false;
    const flag = await upload(context.service, flagRun);
    assert.equal(flag.response.status, 422);

    const redactedRun = runResult("redacted");
    redactedRun.events[0].arguments = { api_token: "[REDACTED]" };
    assert.equal(
      (await upload(context.service, redactedRun)).response.status,
      201,
    );

    const listed = (await (
      await request(context.service, "/v1/runs")
    ).json()) as { total: number };
    assert.equal(listed.total, 1);
  },
);

test(
  "body, collection, list, and retained-run count limits are enforced",
  { skip: networkSkip },
  async (t) => {
    const bodyContext = await createService({ maxBodyBytes: 512 });
    t.after(() => bodyContext.cleanup());
    const oversized = runResult("oversized");
    oversized.executionWarnings = ["x".repeat(1_000)];
    assert.equal(
      (await upload(bodyContext.service, oversized)).response.status,
      413,
    );

    const countContext = await createService({
      maxCollectionEntries: 1,
      maxStoredRuns: 2,
      maxListLimit: 1,
    });
    t.after(() => countContext.cleanup());
    const tooManyEvents = runResult("too-many-events");
    tooManyEvents.events.push({
      ...tooManyEvents.events[0],
      eventId: "event-2",
    });
    assert.equal(
      (await upload(countContext.service, tooManyEvents)).response.status,
      413,
    );

    const first = await upload(countContext.service, runResult("first"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await upload(countContext.service, runResult("second"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const third = await upload(countContext.service, runResult("third"));
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 201);
    assert.equal(third.response.status, 201);

    assert.equal(
      (await request(countContext.service, `/v1/runs/${first.summary.id}`))
        .status,
      404,
    );
    assert.equal(
      (await request(countContext.service, `/v1/runs/${second.summary.id}`))
        .status,
      200,
    );
    assert.equal(
      (await request(countContext.service, `/v1/runs/${third.summary.id}`))
        .status,
      200,
    );
    assert.equal(
      (await request(countContext.service, "/v1/runs?limit=2")).status,
      400,
    );
    const retained = (await (
      await request(countContext.service, "/v1/runs?limit=1")
    ).json()) as { count: number; total: number };
    assert.equal(retained.count, 1);
    assert.equal(retained.total, 2);
  },
);

test(
  "encoded traversal and arbitrary identifiers cannot escape the run store",
  { skip: networkSkip },
  async (t) => {
    const context = await createService();
    t.after(() => context.cleanup());
    const sentinel = path.join(context.directory, "sentinel.json");
    await fs.writeFile(sentinel, "do not delete", "utf8");

    for (const target of [
      "/v1/runs/%2e%2e%2fsentinel",
      "/v1/runs/%252e%252e%252fsentinel",
      "/v1/runs/not-a-server-generated-id",
    ]) {
      const response = await request(context.service, target, {
        method: "DELETE",
      });
      assert.equal(response.status, 400, target);
    }
    assert.equal(await fs.readFile(sentinel, "utf8"), "do not delete");
  },
);

test(
  "time retention expires records and removes their files",
  { skip: networkSkip },
  async (t) => {
    const context = await createService({ retentionMs: 40 });
    t.after(() => context.cleanup());
    const created = await upload(context.service, runResult("short-lived"));
    assert.equal(created.response.status, 201);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      (await request(context.service, `/v1/runs/${created.summary.id}`)).status,
      404,
    );
    const listed = (await (
      await request(context.service, "/v1/runs")
    ).json()) as { total: number };
    assert.equal(listed.total, 0);
    assert.deepEqual(
      await fs.readdir(path.join(context.directory, "runs")),
      [],
    );
  },
);

test(
  "records survive a graceful stop and restart in the same directory",
  { skip: networkSkip },
  async (t) => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "agent-crash-test-hosted-restart-"),
    );
    t.after(() => fs.rm(directory, { recursive: true, force: true }));

    const firstService = await startHostedService({
      dataDirectory: directory,
      apiToken: API_TOKEN,
      port: 0,
    });
    const created = await upload(firstService, runResult("persistent"));
    assert.equal(created.response.status, 201);
    await firstService.stop();
    await firstService.stop();

    const secondService = await startHostedService({
      dataDirectory: directory,
      apiToken: API_TOKEN,
      port: 0,
    });
    t.after(() => secondService.stop());
    const restored = await request(
      secondService,
      `/v1/runs/${created.summary.id}`,
    );
    assert.equal(restored.status, 200);
    assert.equal(
      ((await restored.json()) as HostedRunRecord).runId,
      "persistent",
    );
    await stopHostedService(secondService);
    await stopHostedService(undefined);
  },
);

test(
  "concurrent uploads remain complete atomic JSON records",
  { skip: networkSkip },
  async (t) => {
    const context = await createService({ maxStoredRuns: 20 });
    t.after(() => context.cleanup());
    const uploads = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        upload(context.service, runResult(`concurrent-${index}`)),
      ),
    );
    assert.equal(
      uploads.every(({ response }) => response.status === 201),
      true,
    );

    const names = await fs.readdir(path.join(context.directory, "runs"));
    assert.equal(names.length, 10);
    assert.equal(
      names.every((name) => name.endsWith(".json")),
      true,
    );
    const records = await Promise.all(
      names.map(
        async (name) =>
          JSON.parse(
            await fs.readFile(
              path.join(context.directory, "runs", name),
              "utf8",
            ),
          ) as HostedRunRecord,
      ),
    );
    assert.deepEqual(
      records.map(({ runId }) => runId).sort(),
      Array.from({ length: 10 }, (_, index) => `concurrent-${index}`).sort(),
    );
  },
);

test(
  "CORS can be enabled only for exact configured origins",
  { skip: networkSkip },
  async (t) => {
    const context = await createService({
      corsAllowedOrigins: ["https://console.example.test"],
    });
    t.after(() => context.cleanup());
    const allowed = await request(
      context.service,
      "/v1/runs",
      {
        method: "OPTIONS",
        headers: { Origin: "https://console.example.test" },
      },
      null,
    );
    assert.equal(allowed.status, 204);
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "https://console.example.test",
    );
    const denied = await request(
      context.service,
      "/v1/runs",
      { method: "OPTIONS", headers: { Origin: "https://attacker.example" } },
      null,
    );
    assert.equal(denied.status, 405);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  },
);
