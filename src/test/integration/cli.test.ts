import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("CLI creates a starter pack with a runnable command split", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-init-"),
  );
  const run = spawnSync(
    process.execPath,
    ["dist/cli.js", "init", directory, "--server", 'node "demo server.js"'],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const pack = await fs.readFile(path.join(directory, "starter.yaml"), "utf8");
  assert.match(pack, /command: node/);
  assert.match(pack, /- demo server\.js/);
  assert.match(
    await fs.readFile(path.join(directory, "README.md"), "utf8"),
    /fixture\.example\.yaml/,
  );
  assert.match(
    await fs.readFile(path.join(directory, "fixture.example.yaml"), "utf8"),
    /read_state/,
  );
  const fixtureOnly = spawnSync(
    process.execPath,
    ["dist/cli.js", "run", path.join(directory, "fixture.example.yaml")],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(fixtureOnly.status, 2);
  assert.match(fixtureOnly.stderr, /fixture-only YAML/);
  await fs.writeFile(
    path.join(directory, "valid-fixture-pack.yaml"),
    `version: 1
id: test/generated-fixture
name: Generated fixture pack
protocol: mcp
transport: fixture
server:
  fixture: fixture.example.yaml
steps:
  - id: read
    call: read_state
assertions:
  - id: one-read
    type: call_count
    tool: read_state
    exactly: 1
`,
    "utf8",
  );
  const directoryRun = spawnSync(
    process.execPath,
    ["dist/cli.js", "run", directory],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(directoryRun.status, 3, directoryRun.stderr);
  assert.doesNotMatch(directoryRun.stderr, /fixture\.example\.yaml/);
  const refused = spawnSync(
    process.execPath,
    ["dist/cli.js", "init", directory],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(refused.status, 2);
  const forced = spawnSync(
    process.execPath,
    ["dist/cli.js", "init", directory, "--force", "--github-action"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(forced.stdout, /GitHub Action snippet/);
  const discovered = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "discover",
      "--stdio",
      "node dist/examples/broken-invoice-server.js",
      "--format",
      "json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(discovered.status, 0, discovered.stderr);
  const manifest = JSON.parse(discovered.stdout) as {
    warning: string;
    tools: Array<{
      name: string;
      inputSchema: unknown;
      outputSchemaPresent: boolean;
    }>;
  };
  assert.match(manifest.warning, /untrusted claims/);
  assert.equal(
    manifest.tools.some(
      (tool) =>
        tool.name === "create_invoice" &&
        tool.inputSchema !== undefined &&
        tool.outputSchemaPresent,
    ),
    true,
  );
  const capturePreview = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "capture",
      "--stdio",
      "node dist/examples/broken-invoice-server.js",
      "--dry-run",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(capturePreview.status, 0, capturePreview.stderr);
  assert.match(capturePreview.stdout, /Capture preview only/);
  assert.match(capturePreview.stdout, /No capture file was written/);
  const doctor = spawnSync(process.execPath, ["dist/cli.js", "doctor"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /report output directory is writable/);
  assert.match(doctor.stdout, /Action\/report settings are valid/);
  assert.match(doctor.stdout, /External sandbox status/);

  const secretDiscovery = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "discover",
      "--stdio",
      "node dist/examples/secret-description-server.js --token=super-secret-command",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(secretDiscovery.status, 0, secretDiscovery.stderr);
  assert.doesNotMatch(secretDiscovery.stdout, /super-secret-value/);
  assert.doesNotMatch(secretDiscovery.stdout, /super-secret-command/);
  assert.match(secretDiscovery.stdout, /\[REDACTED\]/);

  await fs.writeFile(
    path.join(directory, "malformed.fixture.yaml"),
    "tools: [\n",
    "utf8",
  );
  const malformedFixturePack = path.join(directory, "malformed-pack.yaml");
  await fs.writeFile(
    malformedFixturePack,
    `version: 1
id: test/malformed-fixture
name: Malformed fixture
protocol: mcp
transport: fixture
server:
  fixture: malformed.fixture.yaml
steps:
  - id: read
    call: read
assertions:
  - id: count
    type: call_count
    tool: read
    exactly: 1
`,
    "utf8",
  );
  const malformedFixtureRun = spawnSync(
    process.execPath,
    ["dist/cli.js", "run", malformedFixturePack],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(malformedFixtureRun.status, 2, malformedFixtureRun.stderr);
  assert.match(malformedFixtureRun.stderr, /Invalid fixture/);

  const mutateOutput = path.join(directory, "mutate-reports");
  const mutate = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "mutate",
      "examples/packs/fixture-duplicate-call.yaml",
      "--profile",
      "safety",
      "--format",
      "json",
      "--output",
      mutateOutput,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(mutate.status, 0, mutate.stderr);
  assert.match(mutate.stdout, /Mutation profile safety/);
  const invalidProfile = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "mutate",
      "examples/packs/fixture-duplicate-call.yaml",
      "--profile",
      "unknown",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(invalidProfile.status, 2);
  const unavailable = spawnSync(process.execPath, ["dist/cli.js", "record"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(unavailable.status, 2);
  assert.match(unavailable.stderr, /record requires --stdio/);
});
