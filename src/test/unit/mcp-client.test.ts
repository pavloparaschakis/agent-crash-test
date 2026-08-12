import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeToolManifest,
  normalizeToolResult,
} from "../../mcp-client.js";

test("normalizes structured and textual MCP tool results", () => {
  assert.deepEqual(normalizeToolResult({ structuredContent: { ok: true } }), {
    ok: true,
  });
  assert.deepEqual(
    normalizeToolResult({
      content: [{ type: "text", text: '{"customer_id":"cus_1"}' }],
    }),
    { customer_id: "cus_1" },
  );
  assert.equal(
    normalizeToolResult({ content: [{ type: "text", text: "plain text" }] }),
    "plain text",
  );
});

test("malformed MCP content remains JSON-safe instead of crashing normalization", () => {
  assert.deepEqual(
    normalizeToolResult({ content: [{ type: "image", data: "abc" }, null] }),
    [{ type: "image", data: "abc" }, null],
  );
  assert.deepEqual(normalizeToolResult({ content: "not-an-array" }), {
    content: "not-an-array",
  });
  assert.equal(normalizeToolResult(Symbol("invalid")), null);
});

test("normalizes and validates MCP tool manifests", () => {
  assert.deepEqual(
    normalizeToolManifest([
      {
        name: "read_state",
        description: "Read state.",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: { readOnlyHint: true },
      },
    ]),
    [
      {
        name: "read_state",
        description: "Read state.",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: { readOnlyHint: true },
      },
    ],
  );
  assert.throws(
    () =>
      normalizeToolManifest([
        { name: "duplicate", inputSchema: { type: "object" } },
        { name: "duplicate", inputSchema: { type: "object" } },
      ]),
    /duplicate tool name duplicate/,
  );
  assert.throws(
    () => normalizeToolManifest([{ name: "invalid", inputSchema: [] }]),
    /inputSchema must be an object/,
  );
  assert.throws(
    () => normalizeToolManifest([{ name: "invalid", inputSchema: {} }]),
    /inputSchema must be an object schema/,
  );
});
