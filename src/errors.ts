import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { CallError, CallErrorKind } from "./types.js";
import { redactText } from "./redaction.js";

export class CrashTestError extends Error {
  constructor(
    message: string,
    public readonly kind: CallErrorKind,
    public readonly exitCode: 2 | 3 | 4 | 10,
    public readonly code?: number | string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CrashTestError";
  }
}

export function classifyMcpError(error: unknown): CallError {
  const message = redactText(
    error instanceof Error ? error.message : String(error),
  );
  if (error instanceof McpError) {
    if (error.code === ErrorCode.RequestTimeout)
      return {
        kind: "timeout",
        message,
        code: error.code,
        retryable: true,
        source: "mcp-sdk",
      };
    if (error.code === ErrorCode.ConnectionClosed)
      return {
        kind: "transport_error",
        message,
        code: error.code,
        retryable: true,
        source: "mcp-sdk",
      };
    return { kind: "protocol", message, code: error.code, source: "mcp-sdk" };
  }
  const lower = message.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out"))
    return { kind: "timeout", message, retryable: true, source: "mcp-sdk" };
  if (
    lower.includes("spawn") ||
    lower.includes("enoent") ||
    lower.includes("eacces")
  )
    return { kind: "spawn", message, source: "process" };
  if (
    lower.includes("closed") ||
    lower.includes("transport") ||
    lower.includes("disconnect")
  )
    return {
      kind: "transport_error",
      message,
      retryable: true,
      source: "transport",
    };
  if (
    lower.includes("json") ||
    lower.includes("json-rpc") ||
    lower.includes("parse") ||
    lower.includes("message type") ||
    lower.includes("protocol")
  )
    return { kind: "protocol", message, source: "mcp-client" };
  return { kind: "server_error", message, source: "mcp-client" };
}

export function asCrashTestError(
  error: unknown,
  fallbackKind: CallErrorKind = "internal",
): CrashTestError {
  if (error instanceof CrashTestError) return error;
  const message = redactText(
    error instanceof Error ? error.message : String(error),
  );
  const callError = classifyMcpError(error);
  const kind =
    callError.kind === "server_error" ? fallbackKind : callError.kind;
  const exitCode =
    kind === "configuration"
      ? 2
      : kind === "spawn" ||
          kind === "initialization" ||
          kind === "protocol" ||
          kind === "transport_error" ||
          kind === "timeout"
        ? 3
        : 10;
  return new CrashTestError(message, kind, exitCode, callError.code, {
    cause: error,
  });
}

export function isCallErrorRetryable(error: CallError): boolean {
  return (
    error.retryable === true ||
    ["timeout", "transport_error", "retryable_error"].includes(error.kind)
  );
}
