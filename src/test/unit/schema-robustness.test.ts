import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadFixture, loadPack } from "../../pack.js";
import { runPack } from "../../runner.js";

test("empty, scalar, and unknown-field YAML fail with actionable validation errors", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-schema-"),
  );
  const empty = path.join(directory, "empty.yaml");
  await fs.writeFile(empty, "", "utf8");
  await assert.rejects(loadPack(empty), /Invalid pack/);
  const unknown = path.join(directory, "unknown.yaml");
  await fs.writeFile(
    unknown,
    "version: 1\nid: test/unknown\nname: Unknown\nprotocol: mcp\ntransport: fixture\nserver:\n  fixture: fixture.yaml\nsteps:\n  - id: read\n    call: read\nassertions:\n  - id: count\n    type: call_count\n    tool: read\n    exactly: 1\nunsupported_field: true\n",
    "utf8",
  );
  await assert.rejects(loadPack(unknown), /Unrecognized key/);
  const scalar = path.join(directory, "scalar.yaml");
  await fs.writeFile(scalar, "hello\n", "utf8");
  await assert.rejects(loadFixture(scalar), /Invalid fixture/);
});

test("CRLF input and UTF-8 pack names remain readable", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-crlf-"),
  );
  const fixture = path.join(directory, "fixture.yaml");
  await fs.writeFile(
    fixture,
    "tools:\r\n  read:\r\n    result: { ok: true }\r\n",
    "utf8",
  );
  const pack = path.join(directory, "pack.yaml");
  const source = `version: 1\r\nid: test/utf8\r\nname: Café — déjà vu 🚀\r\nprotocol: mcp\r\ntransport: fixture\r\nserver:\r\n  fixture: fixture.yaml\r\nsteps:\r\n  - id: read\r\n    call: read\r\nassertions:\r\n  - id: one-call\r\n    type: call_count\r\n    tool: read\r\n    exactly: 1\r\n`;
  await fs.writeFile(pack, source, "utf8");
  const loaded = await loadPack(pack);
  assert.equal(loaded.pack.name, "Café — déjà vu 🚀");
});

test("bounded fuzz inputs fail cleanly or remain valid", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-crash-test-fuzz-"),
  );
  const duplicate = path.join(directory, "duplicate.yaml");
  await fs.writeFile(
    duplicate,
    "version: 1\nid: test/duplicate\nid: test/duplicate-again\n",
    "utf8",
  );
  await assert.rejects(loadPack(duplicate), /unique/);

  const deep: Record<string, unknown> = { value: true };
  let cursor = deep;
  for (let index = 0; index < 24; index += 1) {
    cursor.level = {};
    cursor = cursor.level as Record<string, unknown>;
  }
  cursor.value = true;
  const fixture = path.join(directory, "deep.fixture.yaml");
  await fs.writeFile(
    fixture,
    `initial_state: ${JSON.stringify(deep)}\ntools:\n  read:\n    result: { items: [] }\n`,
    "utf8",
  );
  const loadedFixture = await loadFixture(fixture);
  assert.equal(loadedFixture.tools.read?.result instanceof Object, true);

  const hugePack = path.join(directory, "huge.yaml");
  const huge = "x".repeat(64 * 1024);
  await fs.writeFile(
    hugePack,
    `version: 1\nid: test/huge\nname: "${huge}"\nprotocol: mcp\ntransport: fixture\nserver:\n  fixture: deep.fixture.yaml\nsteps:\n  - id: read\n    call: read\nassertions:\n  - id: missing-array-item\n    type: result_path_equals\n    step: read\n    path: items[0].id\n    expected: null\n`,
    "utf8",
  );
  const loadedPack = await loadPack(hugePack);
  const result = await runPack(loadedPack.pack, { source: hugePack });
  assert.equal(result.findings[0]?.id, "missing-array-item");

  const invalidUnicode = path.join(directory, "unicode.yaml");
  await fs.writeFile(
    invalidUnicode,
    `version: 1\nid: test/unicode\nname: "\ud800"\nprotocol: mcp\ntransport: fixture\nserver:\n  fixture: deep.fixture.yaml\nsteps:\n  - id: read\n    call: read\nassertions:\n  - id: call\n    type: call_count\n    tool: read\n    exactly: 1\n`,
    "utf8",
  );
  const unicodePack = await loadPack(invalidUnicode);
  assert.equal(unicodePack.pack.name.length, 1);

  const malformedFixture = path.join(directory, "malformed.fixture.yaml");
  await fs.writeFile(malformedFixture, "tools: [\n", "utf8");
  await assert.rejects(
    loadFixture(malformedFixture),
    /Invalid fixture .*YAML parse failed/,
  );
});
