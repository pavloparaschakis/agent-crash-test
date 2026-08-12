import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateStarterPack, loadCapture } from "../../capture.js";
import { loadPack } from "../../pack.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const server = path.join(root, "dist/examples/broken-invoice-server.js");

function rpc(
  id: number,
  method: string,
  params?: Record<string, unknown>,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  });
}

function notification(method: string): string {
  return JSON.stringify({ jsonrpc: "2.0", method });
}

async function runProxy(
  lines: string[],
  capturePath: string,
  mutation?: string,
  proxyFlags: string[] = [],
  targetPath = server,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const child = spawn(
    process.execPath,
    [
      "dist/cli.js",
      "proxy",
      "--stdio",
      `node ${targetPath}`,
      ...(mutation
        ? ["--mutation-type", mutation, "--applies-to", "create_invoice"]
        : []),
      ...proxyFlags,
      "--capture",
      capturePath,
    ],
    { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
  });
  child.stdin.end(`${lines.join("\n")}\n`);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { stdout, stderr, code };
}

const session = [
  rpc(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "proxy-test", version: "1" },
  }),
  notification("notifications/initialized"),
  rpc(2, "tools/list", {}),
  rpc(3, "tools/call", {
    name: "create_invoice",
    arguments: { customer_id: "cus_proxy", amount: 42 },
  }),
];

const serverRequestSession = [
  session[0]!,
  JSON.stringify({ jsonrpc: "2.0", id: 100, result: {} }),
  ...session.slice(1),
];

test("transparent proxy forwards MCP traffic and records a duplicate mutation", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const result = await runProxy(session, capturePath, "duplicate_call");
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(messages.some((message) => message.id === 1 && message.result));
  assert.ok(messages.some((message) => message.id === 2 && message.result));
  assert.ok(messages.some((message) => message.id === 3 && message.result));
  const capture = (await loadCapture(capturePath)).capture;
  assert.match(capture.sourceSha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(
    capture.warnings.some((warning) => /does not match/.test(warning)),
    false,
  );
  assert.equal(
    capture.events.filter((event) => event.kind === "mutation").length,
    1,
  );
  assert.equal(
    capture.events.filter(
      (event) => event.side === "client" && event.method === "tools/call",
    ).length,
    1,
  );
  assert.ok(
    capture.events.filter(
      (event) => event.side === "target" && event.tool === "create_invoice",
    ).length >= 2,
  );
});

test("transparent proxy forwards server-initiated requests without deadlocking", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-server-request-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const result = await runProxy(
    serverRequestSession,
    capturePath,
    undefined,
    ["--request-timeout-ms", "500"],
    path.join(root, "dist/examples/server-request-server.js"),
  );
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(
    messages.some((message) => message.id === 100 && message.method === "ping"),
  );
  assert.ok(messages.some((message) => message.id === 1 && message.result));
  assert.equal(
    messages.some((message) => message.id === 100 && message.error),
    false,
  );
  const capture = (await loadCapture(capturePath)).capture;
  assert.ok(
    capture.events.some(
      (event) =>
        event.side === "target" &&
        event.kind === "request" &&
        event.method === "ping",
    ),
  );
  assert.ok(
    capture.events.some(
      (event) =>
        event.side === "client" &&
        event.kind === "response" &&
        event.requestId === 100,
    ),
  );
});

test("capture generation produces a review-required runnable starter pack", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-capture-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const packPath = path.join(directory, "generated.yaml");
  const proxyResult = await runProxy(session, capturePath);
  assert.equal(proxyResult.code, 0, proxyResult.stderr);
  const generated = await generateStarterPack(capturePath, packPath, {
    name: "Captured invoice workflow",
  });
  assert.equal(generated.callCount, 1);
  assert.ok(
    generated.warnings.some((warning) => /decision policy/i.test(warning)),
  );
  const loaded = await loadPack(packPath);
  assert.equal(loaded.pack.name, "Captured invoice workflow");
  assert.equal(loaded.pack.steps[0]?.call, "create_invoice");
  assert.equal(loaded.pack.assertions[0]?.type, "call_count");
  assert.deepEqual(loaded.pack.tags, [
    "captured",
    "review-required",
    "starter-pack",
  ]);
});

test("proxy exposes commit-then-response-lost as an ambiguous client outcome", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-ambiguous-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const result = await runProxy(
    session,
    capturePath,
    "commit_then_response_lost",
  );
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(messages.some((message) => message.id === 3 && message.error));
  const capture = (await loadCapture(capturePath)).capture;
  assert.ok(
    capture.events.some(
      (event) =>
        event.side === "client" &&
        event.kind === "response" &&
        event.responseStatus === "lost" &&
        event.commitStatus === "committed",
    ),
  );
});

test("proxy preserves the original result as partial-success error data", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-partial-success-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const result = await runProxy(session, capturePath, "partial_success");
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const response = messages.find((message) => message.id === 3);
  assert.equal(
    (response?.error as Record<string, unknown> | undefined)?.code,
    -32002,
  );
  assert.deepEqual(
    (response?.error as Record<string, unknown> | undefined)?.data,
    {
      content: [
        {
          type: "text",
          text: '{"invoice":{"id":"inv_1","customer_id":"cus_proxy","amount":42,"status":"draft"}}',
        },
      ],
      structuredContent: {
        invoice: {
          id: "inv_1",
          customer_id: "cus_proxy",
          amount: 42,
          status: "draft",
        },
      },
    },
  );
});

test("proxy applies preflight rate limits without invoking the target tool", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-rate-limit-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const result = await runProxy(session, capturePath, "rate_limit", [
    "--retry-after-ms",
    "250",
  ]);
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const response = messages.find((message) => message.id === 3);
  assert.equal(
    (response?.error as Record<string, unknown> | undefined)?.code,
    429,
  );
  assert.deepEqual(
    (response?.error as Record<string, unknown> | undefined)?.data,
    { retry_after_ms: 250 },
  );
  const capture = (await loadCapture(capturePath)).capture;
  assert.equal(
    capture.events.filter(
      (event) => event.side === "target" && event.tool === "create_invoice",
    ).length,
    0,
  );
});

test("proxy truncates the client-visible result while retaining capture evidence", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-truncate-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const result = await runProxy(session, capturePath, "truncated_response", [
    "--truncate-after-bytes",
    "24",
  ]);
  assert.equal(result.code, 0, result.stderr);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const response = messages.find((message) => message.id === 3);
  assert.equal(typeof response?.result, "string");
  assert.ok(Buffer.byteLength(String(response?.result), "utf8") <= 24);
  const capture = (await loadCapture(capturePath)).capture;
  assert.ok(
    capture.events.some(
      (event) =>
        event.side === "client" &&
        event.tool === "create_invoice" &&
        event.mutationId === "proxy-truncated_response-1",
    ),
  );
});

test("proxy bounds a hanging target response and closes the target", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-proxy-timeout-"),
  );
  const capturePath = path.join(directory, "capture.json");
  const hangingCall = rpc(3, "tools/call", {
    name: "hang",
    arguments: {},
  });
  const started = Date.now();
  const result = await runProxy(
    [...session.slice(0, 3), hangingCall],
    capturePath,
    undefined,
    ["--request-timeout-ms", "100", "--max-run-ms", "1000"],
    path.join(root, "dist/examples/hanging-server.js"),
  );
  assert.equal(result.code, 0, result.stderr);
  assert.ok(Date.now() - started < 3_000);
  const messages = result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(messages.some((message) => message.id === 3 && message.error));
});
