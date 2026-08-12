import assert from "node:assert/strict";
import test from "node:test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { classifyMcpError } from "../../errors.js";

test("MCP SDK timeout and connection-close errors retain typed categories", () => {
  const timeout = classifyMcpError(
    new McpError(ErrorCode.RequestTimeout, "request timed out"),
  );
  const closed = classifyMcpError(
    new McpError(ErrorCode.ConnectionClosed, "transport closed"),
  );
  assert.equal(timeout.kind, "timeout");
  assert.equal(timeout.retryable, true);
  assert.equal(closed.kind, "transport_error");
  assert.equal(closed.retryable, true);
  const protocol = classifyMcpError(
    new McpError(-32600, "invalid protocol version"),
  );
  assert.equal(protocol.kind, "protocol");
});

test("process launch messages are classified as spawn failures", () => {
  const error = classifyMcpError(new Error("spawn missing-command ENOENT"));
  assert.equal(error.kind, "spawn");
});
