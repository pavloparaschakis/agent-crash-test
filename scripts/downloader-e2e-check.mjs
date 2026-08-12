import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(root, "dist", "cli.js");
const server = path.join(root, "dist", "examples", "broken-invoice-server.js");
const cooperativeClient = path.join(
  root,
  "dist",
  "examples",
  "cooperative-client.js",
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function execute(program, args, options = {}) {
  return spawnSync(program, args, {
    cwd: options.cwd ?? root,
    input: options.input,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0", ...(options.env ?? {}) },
  });
}

function runCli(args, options = {}, expected = 0) {
  const result = execute(process.execPath, [cli, ...args], options);
  assert.equal(
    result.status,
    expected,
    `agent-crash-test ${args.join(" ")} returned ${result.status}; expected ${expected}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

async function temporary(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `agent-crash-test-${prefix}-`));
}

async function jsonReports(directory) {
  const files = await fs.readdir(directory);
  return files.filter((file) => file.endsWith(".json"));
}

function rpc(id, method, params) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    ...(params ? { params } : {}),
  });
}

const mcpSession = [
  rpc(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "downloader-e2e", version: "1" },
  }),
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  rpc(2, "tools/list", {}),
  rpc(3, "tools/call", {
    name: "create_invoice",
    arguments: {
      customer_id: "cus_downloader",
      amount: 42,
      request_id: "req_downloader",
    },
  }),
].join("\n");

function realClientPack({ duplicate }) {
  return `version: 1
id: downloader/${duplicate ? "duplicate" : "control"}
name: Downloader ${duplicate ? "duplicate" : "control"}
protocol: mcp
transport: stdio
server:
  command: ${JSON.stringify(process.execPath)}
  args: [${JSON.stringify(server)}]
steps: []
${
  duplicate
    ? `mutations:
  - id: duplicate-create
    type: duplicate_call
    applies_to: create_invoice
    occurrence: 1
`
    : ""
}assertions:
  - id: one-create
    type: call_count
    tool: create_invoice
    exactly: 1
    remediation: Make create_invoice idempotent.
`;
}

test("1. first launch exposes help, health diagnostics, and MCP discovery", async () => {
  const directory = await temporary("first-launch");
  const help = runCli(["help"], { cwd: directory });
  assert.match(help.stdout, /Agent Crash Test v0\.1\.0/);
  assert.match(help.stdout, /test <pack\.yaml>/);
  assert.match(help.stdout, /bridge/);

  const doctor = runCli(["doctor"], { cwd: directory });
  assert.match(doctor.stdout, /Node\.js version satisfies >=20/);
  assert.match(doctor.stdout, /transparent MCP proxy/);

  const discovery = runCli(
    [
      "discover",
      "--stdio",
      `${process.execPath} ${server}`,
      "--format",
      "json",
    ],
    { cwd: directory },
  );
  const manifest = JSON.parse(discovery.stdout);
  assert.ok(manifest.tools.some((tool) => tool.name === "create_invoice"));
  assert.ok(manifest.tools.some((tool) => tool.name === "get_state"));
});

test("2. demo works from an unrelated clean directory and writes 24 reports", async () => {
  const directory = await temporary("demo");
  const demo = runCli(["demo"], { cwd: directory, timeout: 60_000 });
  assert.match(
    demo.stdout,
    /Demo complete: 12 packs, 10 intentional finding\(s\)/,
  );
  const reports = await fs.readdir(
    path.join(directory, ".agent-crash-test", "demo"),
  );
  assert.equal(reports.length, 24);
  assert.equal(reports.filter((file) => file.endsWith(".json")).length, 12);
  assert.equal(reports.filter((file) => file.endsWith(".md")).length, 12);
});

test("3. init creates an immediately runnable self-contained starter", async () => {
  const directory = await temporary("init");
  const packDirectory = path.join(directory, "tests", "agent");
  runCli(["init", packDirectory], { cwd: directory });
  const starter = path.join(packDirectory, "starter.yaml");
  const source = await fs.readFile(starter, "utf8");
  assert.match(source, /transport: fixture/);
  assert.match(source, /fixture: fixture\.example\.yaml/);
  assert.doesNotMatch(source, /dist\/examples/);

  const output = path.join(directory, "artifacts");
  const result = runCli(
    ["run", starter, "--format", "terminal,json", "--output", output],
    { cwd: directory },
    1,
  );
  assert.match(result.stdout, /received 2/);
  const reports = await jsonReports(output);
  assert.equal(reports.length, 1);
  const report = JSON.parse(
    await fs.readFile(path.join(output, reports[0]), "utf8"),
  );
  assert.equal(report.effects[0].observed, 2);
});

test("4. healthy and broken packs produce the expected rich artifacts", async () => {
  const directory = await temporary("reports");
  const passingOutput = path.join(directory, "passing");
  const failingOutput = path.join(directory, "failing");
  runCli(
    [
      "run",
      path.join(root, "examples", "controls", "duplicate-call-single.yaml"),
      "--format",
      "terminal,markdown,json,junit,html",
      "--output",
      passingOutput,
    ],
    { cwd: directory },
  );
  const passingFiles = await fs.readdir(passingOutput);
  for (const suffix of [".md", ".json", ".xml", ".html"])
    assert.ok(passingFiles.some((file) => file.endsWith(suffix)));

  const failed = runCli(
    [
      "run",
      path.join(root, "examples", "packs", "duplicate-call-duplicates.yaml"),
      "--format",
      "terminal,markdown,json,html",
      "--output",
      failingOutput,
    ],
    { cwd: directory },
    1,
  );
  assert.match(
    failed.stdout,
    /Expected effect invoice_count to equal 1, received 2/,
  );
  const html = (await fs.readdir(failingOutput)).find((file) =>
    file.endsWith(".html"),
  );
  assert.ok(html);
  const htmlSource = await fs.readFile(path.join(failingOutput, html), "utf8");
  assert.match(htmlSource, /Timeline/);
  assert.match(htmlSource, /First divergence/);
});

test("5. cooperative real-agent mode returns pass and fail contract verdicts", async () => {
  const directory = await temporary("real-client");
  const control = path.join(directory, "control.yaml");
  const duplicate = path.join(directory, "duplicate.yaml");
  await fs.writeFile(control, realClientPack({ duplicate: false }), "utf8");
  await fs.writeFile(duplicate, realClientPack({ duplicate: true }), "utf8");

  const client = `${process.execPath} ${cooperativeClient}`;
  const controlRun = runCli(
    ["test", control, "--client", client, "--format", "json"],
    { cwd: directory },
  );
  assert.match(controlRun.stdout, /All assertions passed/);

  const duplicateRun = runCli(
    ["test", duplicate, "--client", client, "--format", "json"],
    { cwd: directory },
    1,
  );
  assert.match(duplicateRun.stdout, /received 2/);
  const result = JSON.parse(
    await fs.readFile(
      path.join(directory, ".agent-crash-test", "real-client", "result.json"),
      "utf8",
    ),
  );
  assert.equal(result.adapter.realClient, true);
});

test("6. wrap output can be used directly by an MCP client", async () => {
  const directory = await temporary("wrap");
  const pack = path.join(directory, "control.yaml");
  const configPath = path.join(directory, "mcp.json");
  await fs.writeFile(pack, realClientPack({ duplicate: false }), "utf8");
  runCli(["wrap", pack, "--output", configPath], { cwd: directory });
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const entry = config.mcpServers["agent-crash-test"];
  const wrapped = execute(entry.command, entry.args, {
    cwd: directory,
    input: `${mcpSession}\n`,
    timeout: 30_000,
  });
  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.match(wrapped.stdout, /"id":1/);
  assert.match(wrapped.stdout, /"id":3/);
  const report = JSON.parse(
    await fs.readFile(
      path.join(directory, ".agent-crash-test", "real-client", "result.json"),
      "utf8",
    ),
  );
  assert.equal(report.findings.length, 0);
});

test("7. capture and guided authoring produce an executable effect contract", async () => {
  const directory = await temporary("guided");
  const capture = path.join(directory, "capture.json");
  const contract = path.join(directory, "contract.yaml");
  const proxy = execute(
    process.execPath,
    [
      cli,
      "proxy",
      "--stdio",
      `${process.execPath} ${server}`,
      "--capture",
      capture,
    ],
    { cwd: directory, input: `${mcpSession}\n` },
  );
  assert.equal(proxy.status, 0, proxy.stderr);

  const proposal = runCli(["capture", "guide", capture], { cwd: directory });
  assert.match(proposal.stdout, /create_invoice/);
  assert.match(proposal.stdout, /get_state/);

  runCli(
    [
      "capture",
      "guide",
      capture,
      "--output",
      contract,
      "--target-tool",
      "create_invoice",
      "--mutation-profile",
      "ambiguous-commit",
      "--observer-tool",
      "get_state",
      "--observer-id",
      "invoice-count",
      "--observer-path",
      "invoices.length",
      "--effect-class",
      "create",
      "--expected",
      "1",
      "--cardinality",
      "exactly_once",
      "--description",
      "Exactly one invoice exists after recovery.",
    ],
    { cwd: directory },
  );
  const authored = await fs.readFile(contract, "utf8");
  assert.match(authored, /effect_contracts:/);
  assert.match(authored, /cardinality: exactly_once/);
  const run = runCli(
    ["run", contract, "--format", "terminal,json"],
    { cwd: directory },
    1,
  );
  assert.match(run.stdout, /received 2/);
});

test("8. a framework-neutral JSONL adapter receives the same contract verdict", async () => {
  const directory = await temporary("jsonl");
  const events = path.join(directory, "events.jsonl");
  const contract = path.join(directory, "contract.yaml");
  const output = path.join(directory, "reports");
  const adapter = execute(process.execPath, [
    path.join(root, "examples", "adapters", "jsonl-node-example.mjs"),
  ]);
  assert.equal(adapter.status, 0, adapter.stderr);
  await fs.writeFile(events, adapter.stdout, "utf8");
  await fs.writeFile(
    contract,
    `version: 1
id: downloader/jsonl
name: Downloader JSONL contract
protocol: mcp
transport: stdio
server: { command: adapter-owned }
steps: []
assertions:
  - id: one-create
    type: call_count
    tool: create_issue
    exactly: 1
`,
    "utf8",
  );
  const bridge = runCli(
    [
      "bridge",
      "--input",
      events,
      "--contract",
      contract,
      "--format",
      "terminal,json,html",
      "--output",
      output,
    ],
    { cwd: directory },
  );
  assert.match(bridge.stdout, /All assertions passed/);
  const reports = await fs.readdir(output);
  assert.ok(reports.some((file) => file.endsWith(".json")));
  assert.ok(reports.some((file) => file.endsWith(".html")));
});

test("9. the copy-ready GitHub Action consumer preserves green and red outcomes", () => {
  const action = execute(npm, ["run", "action:check"], {
    cwd: root,
    timeout: 60_000,
  });
  assert.equal(action.status, 0, `${action.stdout}\n${action.stderr}`);
  assert.match(action.stdout, /passing and failing artifacts verified/);
});

test("10. the packed downloader artifact runs doctor and the full demo", () => {
  const packaged = execute(npm, ["run", "package:check"], {
    cwd: root,
    timeout: 90_000,
  });
  assert.equal(packaged.status, 0, `${packaged.stdout}\n${packaged.stderr}`);
  assert.match(packaged.stdout, /Package smoke passed/);
  assert.match(packaged.stdout, /169 files/);
});
