import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { stringify } from "yaml";

const root = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(root, "dist", "cli.js");
const client = path.join(root, "dist", "examples", "cooperative-client.js");
const server = path.join(root, "dist", "examples", "broken-invoice-server.js");

function pack(duplicate: boolean): Record<string, unknown> {
  return {
    version: 1,
    id: duplicate ? "real-client/duplicate" : "real-client/control",
    name: duplicate ? "Real client duplicate" : "Real client control",
    protocol: "mcp",
    transport: "stdio",
    server: { command: process.execPath, args: [server] },
    steps: [],
    mutations: duplicate
      ? [
          {
            id: "duplicate-create",
            type: "duplicate_call",
            applies_to: "create_invoice",
            occurrence: 1,
          },
        ]
      : [],
    assertions: [
      {
        id: "one-create",
        type: "call_count",
        tool: "create_invoice",
        exactly: 1,
        remediation: "Make the write idempotent or prevent duplicate delivery.",
      },
    ],
  };
}

async function runCase(duplicate: boolean): Promise<{
  status: number | null;
  stdout: string;
  report: Record<string, unknown>;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-real-client-"),
  );
  const packPath = path.join(directory, "pack.yaml");
  const output = path.join(directory, "artifacts");
  const resultFile = path.join(output, "result.json");
  await fs.writeFile(packPath, stringify(pack(duplicate)), "utf8");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "test",
      packPath,
      "--client",
      `${process.execPath} ${client}`,
      "--format",
      "json",
      "--output",
      output,
      "--result-file",
      resultFile,
      "--max-run-ms",
      "20000",
    ],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
  const report = JSON.parse(await fs.readFile(resultFile, "utf8")) as Record<
    string,
    unknown
  >;
  return { status: result.status, stdout: result.stdout, report };
}

test("real-client wrapper produces a failing contract verdict for duplicate physical calls", async () => {
  const result = await runCase(true);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /received 2/);
  const adapter = result.report.adapter as { realClient?: boolean };
  assert.equal(adapter.realClient, true);
  const events = result.report.events as Array<{ physicalCall?: boolean }>;
  assert.equal(events.filter((event) => event.physicalCall).length, 2);
});

test("real-client wrapper control passes with one physical call", async () => {
  const result = await runCase(false);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /All assertions passed/);
});
