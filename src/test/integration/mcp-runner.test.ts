import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("MCP stdio runner detects the duplicate write in the demo server", async () => {
  const source = path.join(
    root,
    "examples/packs/duplicate-call-duplicates.yaml",
  );
  const { pack } = await loadPack(source);
  const result = await runPack(pack, { source });
  assert.equal(result.transport, "stdio");
  assert.equal(result.effects[0]?.value, 2);
  assert.equal(result.findings[0]?.id, "exactly-one-invoice");

  const errorDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-mcp-is-error-"),
  );
  const errorSource = path.join(errorDirectory, "is-error.yaml");
  await fs.writeFile(
    errorSource,
    `version: 1
id: test/mcp-is-error
name: MCP isError response
protocol: mcp
transport: stdio
server:
  command: ${process.execPath}
  args: [${path.join(root, "dist/examples/broken-invoice-server.js")}]
  cwd: ${root}
steps:
  - id: send
    call: send_invoice
    arguments: { invoice_id: missing, confirmed: false }
assertions:
  - id: one-send
    type: call_count
    tool: send_invoice
    exactly: 1
`,
    "utf8",
  );
  const errorPack = (await loadPack(errorSource)).pack;
  const errorResult = await runPack(errorPack, { source: errorSource });
  assert.equal(errorResult.executionError, undefined);
  assert.equal(errorResult.events[0]?.error?.kind, "server_error");
  assert.match(
    errorResult.events[0]?.error?.message ?? "",
    /Invoice not found/,
  );
  assert.equal(errorResult.policy.processClosed, true);

  const disconnectDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-mcp-disconnect-"),
  );
  const disconnectSource = path.join(disconnectDirectory, "disconnect.yaml");
  await fs.writeFile(
    disconnectSource,
    `version: 1
id: test/mcp-disconnect
name: MCP disconnect after initialization
protocol: mcp
transport: stdio
server:
  command: ${process.execPath}
  args: [${path.join(root, "dist/examples/disconnect-server.js")}]
  cwd: ${root}
execution:
  request_timeout_ms: 2000
  max_run_ms: 5000
steps:
  - id: disconnect
    call: disconnect
assertions:
  - id: one-call
    type: call_count
    tool: disconnect
    exactly: 1
`,
    "utf8",
  );
  const disconnectPack = (await loadPack(disconnectSource)).pack;
  const disconnectResult = await runPack(disconnectPack, {
    source: disconnectSource,
  });
  assert.equal(disconnectResult.executionError?.kind, "transport_error");
  assert.equal(disconnectResult.events[0]?.error?.kind, "transport_error");
  assert.equal(disconnectResult.assertions.length, 0);
  assert.equal(disconnectResult.policy.processClosed, true);
});

test("MCP stdio runner bounds and classifies malformed protocol output", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-malformed-mcp-"),
  );
  const source = path.join(directory, "malformed.yaml");
  const pidFile = path.join(directory, "malformed.pid");
  await fs.writeFile(
    source,
    `version: 1
id: test/malformed-mcp
name: Malformed MCP output
protocol: mcp
transport: stdio
server:
  command: ${process.execPath}
  args: [${path.join(root, "dist/examples/malformed-server.js")}]
  cwd: ${root}
  env:
    MALFORMED_PID_FILE: ${JSON.stringify(pidFile)}
execution:
  request_timeout_ms: 250
  max_run_ms: 800
steps:
  - id: read
    call: read
assertions:
  - id: one-call
    type: call_count
    tool: read
    exactly: 1
`,
    "utf8",
  );
  const pack = (await loadPack(source)).pack;
  const started = Date.now();
  const result = await runPack(pack, { source });
  assert.ok(Date.now() - started < 2_000);
  assert.equal(result.executionError?.kind, "protocol");
  assert.equal(result.policy.processClosed, true);
  const childPid = Number(await fs.readFile(pidFile, "utf8"));
  assert.ok(Number.isInteger(childPid) && childPid > 0);
  const deadline = Date.now() + 1_000;
  let childAlive = true;
  while (childAlive && Date.now() < deadline) {
    try {
      process.kill(childPid, 0);
      await new Promise((resolve) => setTimeout(resolve, 25));
    } catch (error) {
      childAlive = (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }
  assert.equal(childAlive, false);
});

test("MCP stdio runner rejects a malformed tools/list manifest", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-malformed-manifest-"),
  );
  const source = path.join(directory, "malformed-manifest.yaml");
  await fs.writeFile(
    source,
    `version: 1
id: test/malformed-manifest
name: Malformed MCP manifest
protocol: mcp
transport: stdio
server:
  command: ${process.execPath}
  args: [${path.join(root, "dist/examples/malformed-manifest-server.js")}]
  cwd: ${root}
steps:
  - id: never-reached
    call: broken
assertions:
  - id: one-call
    type: call_count
    tool: broken
    exactly: 1
`,
    "utf8",
  );
  const pack = (await loadPack(source)).pack;
  const result = await runPack(pack, { source });
  assert.equal(result.executionError?.kind, "protocol");
  assert.match(result.executionError?.message ?? "", /inputSchema/);
  assert.equal(result.events.length, 0);
  assert.equal(result.policy.processClosed, true);
});

test("MCP stdio runner closes a child after initialization timeout", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-init-timeout-mcp-"),
  );
  const source = path.join(directory, "initialization-timeout.yaml");
  const pidFile = path.join(directory, "initialization-timeout.pid");
  await fs.writeFile(
    source,
    `version: 1
id: test/initialization-timeout-mcp
name: MCP initialization timeout
protocol: mcp
transport: stdio
server:
  command: ${process.execPath}
  args: [${path.join(root, "dist/examples/hanging-init-server.js")}]
  cwd: ${root}
  env:
    HANGING_INIT_PID_FILE: ${JSON.stringify(pidFile)}
execution:
  request_timeout_ms: 100
  max_run_ms: 300
steps:
  - id: read
    call: read
assertions:
  - id: one-call
    type: call_count
    tool: read
    exactly: 1
`,
    "utf8",
  );
  const pack = (await loadPack(source)).pack;
  const started = Date.now();
  const result = await runPack(pack, { source });
  assert.ok(Date.now() - started < 3_000);
  assert.equal(result.executionError?.kind, "timeout");
  assert.equal(result.policy.processClosed, true);
  const childPid = Number(await fs.readFile(pidFile, "utf8"));
  assert.ok(Number.isInteger(childPid) && childPid > 0);
  const deadline = Date.now() + 1_000;
  let childAlive = true;
  while (childAlive && Date.now() < deadline) {
    try {
      process.kill(childPid, 0);
      await new Promise((resolve) => setTimeout(resolve, 25));
    } catch (error) {
      childAlive = (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }
  assert.equal(childAlive, false);
});
