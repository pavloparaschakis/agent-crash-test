import path from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  CallOutcome,
  CrashTestClient,
  JsonObject,
  JsonValue,
  PackServer,
  ToolCallOptions,
  ToolManifest,
} from "./types.js";
import { asCrashTestError, classifyMcpError } from "./errors.js";
import { redactText } from "./redaction.js";

const CLOSE_GRACE_MS = 250;
const CLOSE_KILL_GRACE_MS = 500;

function minimalEnvironment(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const inherited = process.env;
  const permitted = [
    "PATH",
    "SystemRoot",
    "COMSPEC",
    "ComSpec",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
  ];
  const env: Record<string, string> = {};
  for (const key of permitted) if (inherited[key]) env[key] = inherited[key]!;
  return { ...env, ...overrides };
}

export function normalizeToolResult(value: unknown): JsonValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result = value as {
      structuredContent?: unknown;
      content?: unknown;
    };
    if (result.structuredContent !== undefined)
      return toJsonValue(result.structuredContent);
    if (Array.isArray(result.content)) {
      const text = result.content
        .filter(
          (item): item is { type?: unknown; text?: unknown } =>
            Boolean(item) && typeof item === "object",
        )
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string)
        .join("\n");
      if (text.length > 0) {
        try {
          return JSON.parse(text) as JsonValue;
        } catch {
          return text;
        }
      }
      return toJsonValue(result.content);
    }
  }
  return toJsonValue(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isObjectSchema(value: unknown): value is JsonObject {
  return isJsonObject(value) && value.type === "object";
}

export function normalizeToolManifest(tools: unknown): ToolManifest[] {
  if (!Array.isArray(tools))
    throw new Error(
      "Invalid MCP tools/list protocol response: tools must be an array.",
    );

  const names = new Set<string>();
  return tools.map((rawTool, index) => {
    if (!isJsonObject(rawTool))
      throw new Error(
        `Invalid MCP tools/list protocol response: tool ${index} must be an object.`,
      );
    const name = rawTool.name;
    if (typeof name !== "string" || name.trim().length === 0)
      throw new Error(
        `Invalid MCP tools/list protocol response: tool ${index} has no non-empty name.`,
      );
    if (names.has(name))
      throw new Error(
        `Invalid MCP tools/list protocol response: duplicate tool name ${name}.`,
      );
    names.add(name);

    if (
      rawTool.description !== undefined &&
      typeof rawTool.description !== "string"
    )
      throw new Error(
        `Invalid MCP tools/list protocol response: tool ${name} description must be a string.`,
      );
    if (!isObjectSchema(rawTool.inputSchema))
      throw new Error(
        `Invalid MCP tools/list protocol response: tool ${name} inputSchema must be an object schema with type: object.`,
      );
    if (
      rawTool.outputSchema !== undefined &&
      !isObjectSchema(rawTool.outputSchema)
    )
      throw new Error(
        `Invalid MCP tools/list protocol response: tool ${name} outputSchema must be an object schema with type: object when present.`,
      );
    if (rawTool.annotations !== undefined && !isJsonObject(rawTool.annotations))
      throw new Error(
        `Invalid MCP tools/list protocol response: tool ${name} annotations must be an object when present.`,
      );

    const manifest: ToolManifest = {
      name,
      inputSchema: rawTool.inputSchema,
    };
    if (rawTool.description !== undefined)
      manifest.description = rawTool.description;
    if (rawTool.outputSchema !== undefined)
      manifest.outputSchema = rawTool.outputSchema;
    if (rawTool.annotations !== undefined)
      manifest.annotations = rawTool.annotations;
    return manifest;
  });
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (value && typeof value === "object") {
    const result: JsonObject = {};
    try {
      for (const [key, nested] of Object.entries(value))
        result[key] = toJsonValue(nested);
    } catch {
      return null;
    }
    return result;
  }
  return null;
}

export class McpStdioClient implements CrashTestClient {
  private readonly client = new Client(
    { name: "agent-crash-test", version: "0.1.0" },
    { capabilities: {} },
  );
  private transport?: StdioClientTransport;
  private connected = false;
  private closed = false;
  private stderrTail = "";
  private outOfBandError?: Error;
  private childPid?: number;
  private pidCaptureTimer?: NodeJS.Timeout;

  constructor(
    private readonly server: PackServer,
    private readonly packDirectory: string,
  ) {}

  async connect(options?: ToolCallOptions): Promise<void> {
    if (!this.server.command)
      throw new Error("stdio client requires server.command");
    const cwd = this.server.cwd
      ? path.resolve(this.packDirectory, this.server.cwd)
      : this.packDirectory;
    this.transport = new StdioClientTransport({
      command: this.server.command,
      args: this.server.args ?? [],
      cwd,
      env: minimalEnvironment(this.server.env),
      stderr: "pipe",
    });
    let rejectTransportError: ((error: unknown) => void) | undefined;
    const transportError = new Promise<never>((_, reject) => {
      rejectTransportError = reject;
    });
    this.transport.onerror = (error) => {
      this.capturePid();
      this.outOfBandError = error;
      rejectTransportError?.(error);
    };
    this.transport.stderr?.on("data", (chunk: Buffer | string) => {
      const next = redactText(String(chunk));
      this.stderrTail = `${this.stderrTail}${next}`.slice(-16_384);
    });
    this.pidCaptureTimer = setInterval(() => this.capturePid(), 10);
    this.pidCaptureTimer.unref();
    try {
      await Promise.race([
        this.client.connect(
          this.transport,
          options?.requestTimeoutMs
            ? { timeout: options.requestTimeoutMs }
            : undefined,
        ),
        transportError,
      ]);
      this.capturePid();
      this.connected = true;
      this.closed = false;
      if (this.outOfBandError) throw this.outOfBandError;
    } catch (error) {
      this.capturePid();
      const typed = asCrashTestError(error, "initialization");
      throw new Error(
        `${typed.message}${this.stderrTail ? `\nServer stderr: ${this.stderrTail.trim()}` : ""}`,
        { cause: typed },
      );
    } finally {
      this.stopPidCapture();
    }
  }

  async listTools(options?: ToolCallOptions): Promise<ToolManifest[]> {
    try {
      this.capturePid();
      const response = await this.client.listTools(
        undefined,
        options?.requestTimeoutMs
          ? { timeout: options.requestTimeoutMs }
          : undefined,
      );
      if (this.outOfBandError) throw this.outOfBandError;
      return normalizeToolManifest(response.tools);
    } catch (error) {
      const typed = classifyMcpError(error);
      const message =
        typed.kind === "server_error"
          ? `Invalid MCP tools/list protocol response: ${typed.message}`
          : typed.message;
      const details = `${message}${this.stderrTail ? `\nServer stderr: ${this.stderrTail.trim()}` : ""}`;
      if (typed.kind === "server_error") throw new Error(details);
      throw new Error(details, { cause: error });
    }
  }

  async callTool(
    name: string,
    args: JsonObject,
    options?: ToolCallOptions,
  ): Promise<CallOutcome> {
    try {
      this.capturePid();
      const response = await this.client.callTool(
        { name, arguments: args },
        undefined,
        options?.requestTimeoutMs
          ? { timeout: options.requestTimeoutMs }
          : undefined,
      );
      if (this.outOfBandError) {
        const typed = classifyMcpError(this.outOfBandError);
        return {
          error: { ...typed, message: redactText(typed.message) },
          commitStatus: "unknown",
          responseStatus: "lost",
        };
      }
      if (response.isError) {
        return {
          error: {
            kind: "server_error",
            message: redactText(String(normalizeToolResult(response))),
            source: "tool",
          },
          commitStatus: "unknown",
          responseStatus: "returned",
        };
      }
      return {
        output: normalizeToolResult(response),
        raw: toJsonValue(response),
        commitStatus: "unknown",
        responseStatus: "returned",
      };
    } catch (error) {
      const typed = classifyMcpError(error);
      const message = `${typed.message}${this.stderrTail ? `\nServer stderr: ${this.stderrTail.trim()}` : ""}`;
      return {
        error: { ...typed, message: redactText(message) },
        commitStatus: "unknown",
        responseStatus: "lost",
      };
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopPidCapture();
    this.capturePid();
    const pid = this.childPid;
    try {
      const operation = this.connected
        ? this.client.close()
        : this.transport?.close();
      await closeTransport(operation, pid);
    } finally {
      this.connected = false;
    }
  }

  private capturePid(): void {
    const pid = this.transport?.pid;
    if (pid) this.childPid = pid;
  }

  private stopPidCapture(): void {
    if (this.pidCaptureTimer) clearInterval(this.pidCaptureTimer);
    this.pidCaptureTimer = undefined;
  }
}

async function closeTransport(
  operation: Promise<void> | undefined,
  pid: number | undefined,
): Promise<void> {
  let settled = false;
  let failure: unknown;
  const pending = Promise.resolve(operation).then(
    () => {
      settled = true;
    },
    (error) => {
      failure = error;
      settled = true;
    },
  );

  await Promise.race([pending, delay(CLOSE_GRACE_MS)]);
  if (pid && processAlive(pid)) {
    terminate(pid, "SIGTERM");
    await waitForExit(pid, CLOSE_KILL_GRACE_MS);
    if (processAlive(pid)) {
      terminate(pid, "SIGKILL");
      await waitForExit(pid, CLOSE_KILL_GRACE_MS);
    }
  }
  await Promise.race([pending, delay(CLOSE_GRACE_MS)]);
  if (!settled) throw new Error("Unable to confirm target process cleanup");
  if (failure) throw failure;
  if (pid && processAlive(pid))
    throw new Error("Target process remained alive after transport close");
}

function terminate(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // The process may have exited between the liveness check and the signal.
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (processAlive(pid) && Date.now() < deadline) await delay(50);
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}
