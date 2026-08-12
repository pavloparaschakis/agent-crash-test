import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { redactText, redactUnknown } from "./redaction.js";
import { splitCommandLine } from "./command-line.js";
import { hashJson } from "./stable.js";
import type {
  CommitStatus,
  JsonObject,
  JsonValue,
  Mutation,
  MutationPhase,
  MutationType,
  ResponseStatus,
} from "./types.js";

type RpcId = string | number | null;
type RpcMessage = JsonObject;

export interface ProxyOptions {
  targetCommand: string;
  targetArgs?: string[];
  cwd?: string;
  mutations?: Mutation[];
  capturePath?: string;
  requestTimeoutMs?: number;
  maxRunMs?: number;
  maxCaptureEvents?: number;
  maxCaptureBytes?: number;
}

export interface ProxyCaptureEvent {
  sequence: number;
  timestamp: string;
  side: "client" | "target" | "proxy";
  kind: "request" | "response" | "mutation" | "transport_error" | "stderr";
  direction?:
    | "client_to_proxy"
    | "proxy_to_target"
    | "target_to_proxy"
    | "proxy_to_client";
  message?: JsonValue;
  method?: string;
  tool?: string;
  requestId?: RpcId;
  physicalCall: boolean;
  mutationId?: string;
  mutationType?: MutationType;
  mutationPhase?: MutationPhase;
  commitStatus?: CommitStatus;
  responseStatus?: ResponseStatus;
}

export interface ProxyCapture {
  schemaVersion: 1;
  captureId: string;
  createdAt: string;
  target: { command: string; args: string[]; cwd: string };
  sourceSha256?: string;
  determinism: "partial";
  events: ProxyCaptureEvent[];
  warnings: string[];
  truncated?: boolean;
}

interface PendingTargetResponse {
  message: RpcMessage;
  resolve: (message: RpcMessage) => void;
  reject: (error: Error) => void;
  tool?: string;
  suppressClient: boolean;
  timer?: NodeJS.Timeout;
}

interface RequestContext {
  clientMessage: RpcMessage;
  clientId: RpcId;
  method?: string;
  tool?: string;
  arguments?: JsonObject;
  occurrence?: number;
  operationId: string;
}

const MAX_LINE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_RUN_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CAPTURE_EVENTS = 10_000;
const DEFAULT_MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const CLOSE_GRACE_MS = 500;

export async function runStdioProxy(
  options: ProxyOptions,
): Promise<ProxyCapture> {
  const target = spawn(options.targetCommand, options.targetArgs ?? [], {
    cwd: options.cwd ?? process.cwd(),
    env: minimalEnvironment(),
    shell: false,
    windowsHide: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const capture: ProxyCapture = {
    schemaVersion: 1,
    captureId: randomUUID(),
    createdAt: new Date().toISOString(),
    target: {
      command: redactText(options.targetCommand),
      args: options.targetArgs?.map((arg) => redactText(arg)) ?? [],
      cwd: redactText(options.cwd ?? process.cwd()),
    },
    determinism: "partial",
    events: [],
    warnings: [
      "Proxy capture records a local client/server interaction; it is not proof that the observed workflow is correct.",
    ],
  };
  const pending = new Map<string, PendingTargetResponse>();
  const discardedTargetIds = new Set<string>();
  const toolOccurrences = new Map<string, number>();
  const lastSuccessfulResponses = new Map<string, RpcMessage>();
  const targetInitiatedRequests = new Set<string>();
  let clientBuffer = Buffer.alloc(0);
  let targetBuffer = Buffer.alloc(0);
  let eventSequence = 0;
  let requestSequence = 0;
  let captureBytes = 0;
  let captureLimitWarning = false;
  let clientWriteChain = Promise.resolve();
  let targetWriteChain = Promise.resolve();
  const clientTasks: Promise<void>[] = [];
  let closing = false;
  let failure: Error | undefined;
  let runTimer: NodeJS.Timeout | undefined;
  let targetCloseResolve: (() => void) | undefined;
  const targetClosed = new Promise<void>((resolve) => {
    targetCloseResolve = resolve;
  });

  const writeClient = (message: RpcMessage): Promise<void> => {
    clientWriteChain = clientWriteChain.then(() =>
      writeLine(process.stdout, `${JSON.stringify(message)}\n`),
    );
    return clientWriteChain;
  };

  const writeTarget = (message: RpcMessage): Promise<void> => {
    targetWriteChain = targetWriteChain.then(() => {
      if (!target.stdin.writable)
        throw new Error("Target stdin is not writable.");
      return writeLine(target.stdin, `${JSON.stringify(message)}\n`);
    });
    return targetWriteChain;
  };

  const record = (event: Omit<ProxyCaptureEvent, "sequence" | "timestamp">) => {
    const complete = {
      ...event,
      sequence: ++eventSequence,
      timestamp: new Date().toISOString(),
      message:
        event.message === undefined
          ? undefined
          : (redactUnknown(event.message) as JsonValue),
    } satisfies ProxyCaptureEvent;
    const eventBytes = Buffer.byteLength(JSON.stringify(complete), "utf8");
    const eventLimit = options.maxCaptureEvents ?? DEFAULT_MAX_CAPTURE_EVENTS;
    const byteLimit = options.maxCaptureBytes ?? DEFAULT_MAX_CAPTURE_BYTES;
    if (
      capture.events.length >= eventLimit ||
      captureBytes + eventBytes > byteLimit
    ) {
      capture.truncated = true;
      if (!captureLimitWarning) {
        captureLimitWarning = true;
        capture.warnings.push(
          `Capture reached its bounded limit (${eventLimit} events or ${byteLimit} bytes); later events were omitted.`,
        );
      }
      return;
    }
    capture.events.push(complete);
    captureBytes += eventBytes;
  };

  const closeTarget = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    if (runTimer) clearTimeout(runTimer);
    try {
      target.stdin.end();
    } catch {
      // The target may already be closed.
    }
    await Promise.race([targetClosed, delay(CLOSE_GRACE_MS)]);
    if (!target.killed && target.exitCode === null) {
      try {
        target.kill("SIGTERM");
      } catch {
        // The target may exit between the state check and signal.
      }
      await Promise.race([targetClosed, delay(CLOSE_GRACE_MS)]);
    }
    if (!target.killed && target.exitCode === null) {
      try {
        target.kill("SIGKILL");
      } catch {
        // The target may exit between the state check and signal.
      }
    }
  };

  const fail = (error: unknown): void => {
    if (failure) return;
    failure = error instanceof Error ? error : new Error(String(error));
    const message = redactText(failure.message);
    capture.warnings.push(message);
    record({
      side: "proxy",
      kind: "transport_error",
      message,
      physicalCall: false,
    });
    void closeTarget();
  };

  const rejectPending = (error: Error): void => {
    for (const [key, wait] of pending) {
      pending.delete(key);
      if (wait.timer) clearTimeout(wait.timer);
      wait.reject(error);
    }
  };

  const requestKey = (id: RpcId): string => JSON.stringify(id);
  const responseId = (message: RpcMessage): RpcId | undefined => {
    if (!("id" in message)) return undefined;
    const id = message.id;
    return typeof id === "string" || typeof id === "number" || id === null
      ? id
      : undefined;
  };

  const methodOf = (message: RpcMessage): string | undefined =>
    typeof message.method === "string" ? message.method : undefined;

  const isRpcResponse = (message: RpcMessage): boolean =>
    responseId(message) !== undefined && methodOf(message) === undefined;

  const toolOf = (message: RpcMessage): string | undefined => {
    if (methodOf(message) !== "tools/call") return undefined;
    const params = message.params;
    if (!params || typeof params !== "object" || Array.isArray(params))
      return undefined;
    return typeof params.name === "string" ? params.name : undefined;
  };

  const argumentsOf = (message: RpcMessage): JsonObject | undefined => {
    const params = message.params;
    if (!params || typeof params !== "object" || Array.isArray(params))
      return undefined;
    const value = params.arguments;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as JsonObject;
  };

  const errorResponse = (
    id: RpcId,
    message: string,
    code = -32000,
    data?: JsonValue,
  ): RpcMessage => ({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: redactText(message),
      ...(data === undefined ? {} : { data: redactUnknown(data) as JsonValue }),
    },
  });

  const cloneMessage = (message: RpcMessage): RpcMessage =>
    JSON.parse(JSON.stringify(message)) as RpcMessage;

  const mutationFor = (
    tool: string,
    occurrence: number,
  ): Mutation | undefined =>
    (options.mutations ?? []).find(
      (mutation) =>
        (mutation.applies_to === undefined || mutation.applies_to === tool) &&
        (mutation.occurrence === undefined ||
          mutation.occurrence === occurrence),
    );

  const mutationPhase = (mutation: Mutation): MutationPhase => {
    if (mutation.phase) return mutation.phase;
    switch (mutation.type) {
      case "permission_denied":
      case "rate_limit":
        return "before_underlying_call";
      case "timeout":
      case "commit_then_response_lost":
        return "after_commit_before_response";
      case "disconnect_after_commit":
        return "client_visible_transport_failure";
      case "malformed_result":
      case "stale_result":
      case "retryable_error":
      case "duplicate_call":
      case "schema_drift":
      case "truncated_response":
      case "out_of_order_response":
      case "corrupted_pagination_cursor":
      case "slow_stream":
        return "after_response_before_client";
      case "partial_success":
        return "after_commit_before_response";
      case "stale_read_then_conflicting_write":
        return "observer_only";
      case "progress_stall":
        return "during_underlying_call";
    }
  };

  const mutationStatuses = (
    mutation: Mutation,
    original?: RpcMessage,
  ): { commitStatus: CommitStatus; responseStatus: ResponseStatus } => ({
    commitStatus:
      mutation.commit_status ??
      (original?.error
        ? "unknown"
        : mutation.type === "permission_denied" ||
            mutation.type === "rate_limit"
          ? "not_attempted"
          : mutation.type === "commit_then_response_lost" ||
              mutation.type === "disconnect_after_commit" ||
              mutation.type === "partial_success"
            ? "committed"
            : "unknown"),
    responseStatus:
      mutation.response_status ??
      (mutation.type === "malformed_result" ||
      mutation.type === "schema_drift" ||
      mutation.type === "truncated_response" ||
      mutation.type === "corrupted_pagination_cursor"
        ? "corrupted"
        : mutation.type === "timeout" ||
            mutation.type === "commit_then_response_lost" ||
            mutation.type === "disconnect_after_commit" ||
            mutation.type === "progress_stall"
          ? "lost"
          : "returned"),
  });

  const recordRequest = (
    side: "client" | "target",
    direction: ProxyCaptureEvent["direction"],
    message: RpcMessage,
    physicalCall: boolean,
    tool?: string,
    requestId?: RpcId,
  ): void => {
    record({
      side,
      kind: "request",
      direction,
      message,
      method: methodOf(message),
      tool,
      requestId,
      physicalCall,
    });
  };

  const recordResponse = (
    side: "client" | "target",
    direction: ProxyCaptureEvent["direction"],
    message: RpcMessage,
    physicalCall: boolean,
    context?: RequestContext,
    mutation?: Mutation,
    statusSource?: RpcMessage,
  ): void => {
    const statuses = mutation
      ? mutationStatuses(mutation, statusSource ?? message)
      : undefined;
    record({
      side,
      kind: "response",
      direction,
      message,
      requestId: responseId(message),
      tool: context?.tool,
      physicalCall,
      mutationId: mutation?.id,
      mutationType: mutation?.type,
      mutationPhase: mutation ? mutationPhase(mutation) : undefined,
      commitStatus: statuses?.commitStatus,
      responseStatus: statuses?.responseStatus,
    });
  };

  const sendTargetRequest = async (
    message: RpcMessage,
    tool: string | undefined,
    suppressClient: boolean,
  ): Promise<RpcMessage> => {
    const id = responseId(message);
    if (id === undefined) {
      await writeTarget(message);
      return {};
    }
    const key = requestKey(id);
    const response = new Promise<RpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.has(key)) return;
        pending.delete(key);
        discardedTargetIds.add(key);
        resolve(
          errorResponse(
            id,
            `Target response timed out after ${options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS}ms`,
            -32001,
          ),
        );
      }, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      timer.unref();
      pending.set(key, {
        message,
        resolve,
        reject,
        tool,
        suppressClient,
        timer,
      });
    });
    recordRequest(
      "target",
      "proxy_to_target",
      message,
      methodOf(message) === "tools/call",
      tool,
      id,
    );
    await writeTarget(message);
    return response;
  };

  const sendMutationResponse = async (
    context: RequestContext,
    mutation: Mutation,
    original: RpcMessage,
  ): Promise<void> => {
    const phase = mutationPhase(mutation);
    const statuses = mutationStatuses(mutation, original);
    record({
      side: "proxy",
      kind: "mutation",
      message: {
        id: mutation.id,
        type: mutation.type,
        phase,
        commitStatus: statuses.commitStatus,
        responseStatus: statuses.responseStatus,
      },
      tool: context.tool,
      requestId: context.clientId,
      physicalCall: false,
      mutationId: mutation.id,
      mutationType: mutation.type,
      mutationPhase: phase,
      commitStatus: statuses.commitStatus,
      responseStatus: statuses.responseStatus,
    });
    switch (mutation.type) {
      case "timeout":
      case "commit_then_response_lost":
      case "disconnect_after_commit":
      case "retryable_error":
      case "partial_success": {
        const duration = mutation.duration_ms ?? 0;
        if (duration > 0)
          await delay(Math.min(duration, options.requestTimeoutMs ?? duration));
        const visible = errorResponse(
          context.clientId,
          mutation.type === "commit_then_response_lost"
            ? `Injected response loss after commit (${mutation.id})`
            : mutation.type === "disconnect_after_commit"
              ? `Injected disconnect after commit (${mutation.id}); the proxy models the client-visible transport failure without closing the proxy stream`
              : mutation.type === "partial_success"
                ? `Injected partial success (${mutation.id})`
                : `Injected ${mutation.type} (${mutation.id})`,
          mutation.type === "partial_success" ? -32002 : -32000,
          mutation.type === "partial_success" ? original.result : undefined,
        );
        recordResponse(
          "client",
          "proxy_to_client",
          visible,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(visible);
        return;
      }
      case "rate_limit": {
        const retryAfterMs = mutation.retry_after_ms ?? 1_000;
        const visible = errorResponse(
          context.clientId,
          `Injected rate limit (${mutation.id}); retry after ${retryAfterMs}ms`,
          429,
          { retry_after_ms: retryAfterMs },
        );
        recordResponse(
          "client",
          "proxy_to_client",
          visible,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(visible);
        return;
      }
      case "malformed_result": {
        const malformed = cloneMessage(original);
        malformed.result = "__agent_crash_test_malformed_result__";
        recordResponse(
          "client",
          "proxy_to_client",
          malformed,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(malformed);
        return;
      }
      case "stale_result":
      case "stale_read_then_conflicting_write":
      case "out_of_order_response": {
        const stale = context.tool
          ? lastSuccessfulResponses.get(context.tool)
          : undefined;
        if (!stale) {
          capture.warnings.push(
            `Mutation ${mutation.id} was not applicable because no previous successful response exists for ${context.tool ?? "the request"}.`,
          );
          recordResponse("client", "proxy_to_client", original, false, context);
          await writeClient(original);
          return;
        }
        const staleWithId = cloneMessage(stale);
        staleWithId.id = context.clientId;
        recordResponse(
          "client",
          "proxy_to_client",
          staleWithId,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(staleWithId);
        return;
      }
      case "duplicate_call": {
        const duplicateId = `agent-crash-test-duplicate-${++requestSequence}`;
        const duplicate = cloneMessage(context.clientMessage);
        duplicate.id = duplicateId;
        const duplicateResponse = await sendTargetRequest(
          duplicate,
          context.tool,
          true,
        );
        recordResponse(
          "target",
          "target_to_proxy",
          duplicateResponse,
          true,
          context,
          mutation,
          original,
        );
        recordResponse(
          "client",
          "proxy_to_client",
          original,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(original);
        return;
      }
      case "permission_denied":
        {
          const visible = errorResponse(
            context.clientId,
            `Injected permission denial (${mutation.id})`,
            -32001,
          );
          recordResponse(
            "client",
            "proxy_to_client",
            visible,
            false,
            context,
            mutation,
            original,
          );
          await writeClient(visible);
        }
        return;
      case "schema_drift": {
        const changed = cloneMessage(original);
        if (
          !mutation.remove_path ||
          !deleteJsonPath(changed, mutation.remove_path)
        )
          capture.warnings.push(
            `Mutation ${mutation.id} could not remove ${mutation.remove_path ?? "<missing path>"}; the original response was retained.`,
          );
        recordResponse(
          "client",
          "proxy_to_client",
          changed,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(changed);
        return;
      }
      case "truncated_response": {
        const changed = cloneMessage(original);
        const serialized = JSON.stringify(changed.result ?? null);
        changed.result = Buffer.from(serialized, "utf8")
          .subarray(0, mutation.truncate_after_bytes ?? 64)
          .toString("utf8");
        recordResponse(
          "client",
          "proxy_to_client",
          changed,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(changed);
        return;
      }
      case "corrupted_pagination_cursor": {
        const changed = cloneMessage(original);
        const replaced = mutation.cursor_path
          ? replaceJsonPath(
              changed,
              mutation.cursor_path,
              mutation.replacement ?? "__agent_crash_test_invalid_cursor__",
            )
          : replaceFirstCursor(
              changed,
              mutation.replacement ?? "__agent_crash_test_invalid_cursor__",
            );
        if (!replaced)
          capture.warnings.push(
            `Mutation ${mutation.id} found no pagination cursor; the original response was retained.`,
          );
        recordResponse(
          "client",
          "proxy_to_client",
          changed,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(changed);
        return;
      }
      case "slow_stream": {
        await delay(
          Math.min(
            mutation.duration_ms ?? 1_000,
            options.requestTimeoutMs ?? mutation.duration_ms ?? 1_000,
          ),
        );
        recordResponse(
          "client",
          "proxy_to_client",
          original,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(original);
        return;
      }
      case "progress_stall": {
        const duration =
          mutation.duration_ms ?? options.requestTimeoutMs ?? 1_000;
        await delay(Math.min(duration, options.requestTimeoutMs ?? duration));
        const visible = errorResponse(
          context.clientId,
          `Injected progress stall (${mutation.id})`,
          -32001,
        );
        recordResponse(
          "client",
          "proxy_to_client",
          visible,
          false,
          context,
          mutation,
          original,
        );
        await writeClient(visible);
        return;
      }
    }
  };

  const handleClientMessage = async (message: RpcMessage): Promise<void> => {
    const clientId = responseId(message);
    const method = methodOf(message);
    const tool = toolOf(message);
    const args = argumentsOf(message);
    if (isRpcResponse(message)) {
      targetInitiatedRequests.delete(requestKey(clientId!));
      recordResponse("client", "client_to_proxy", message, false);
      await writeTarget(message);
      return;
    }
    const occurrence = tool
      ? (toolOccurrences.set(tool, (toolOccurrences.get(tool) ?? 0) + 1),
        toolOccurrences.get(tool))
      : undefined;
    const context: RequestContext = {
      clientMessage: message,
      clientId: clientId ?? null,
      method,
      tool,
      arguments: args,
      occurrence,
      operationId: `${method ?? "notification"}:${clientId ?? "none"}`,
    };
    recordRequest("client", "client_to_proxy", message, false, tool, clientId);
    const mutation =
      tool && occurrence !== undefined
        ? mutationFor(tool, occurrence)
        : undefined;
    if (
      mutation?.type === "permission_denied" ||
      mutation?.type === "rate_limit"
    ) {
      await sendMutationResponse(context, mutation, message);
      return;
    }
    if (clientId === undefined) {
      await writeTarget(message);
      recordRequest("target", "proxy_to_target", message, false, tool);
      return;
    }
    const targetResponse = await sendTargetRequest(message, tool, false);
    if (
      method === "tools/call" &&
      tool &&
      !targetResponse.error &&
      !targetResponse.result
    ) {
      // A malformed target response is still forwarded for the client to diagnose.
    }
    if (method !== "tools/call" || !tool) {
      recordResponse(
        "client",
        "proxy_to_client",
        targetResponse,
        false,
        context,
      );
      await writeClient(targetResponse);
      return;
    }
    const selected = mutation;
    if (selected) await sendMutationResponse(context, selected, targetResponse);
    else {
      if (!targetResponse.error)
        lastSuccessfulResponses.set(tool, cloneMessage(targetResponse));
      recordResponse(
        "client",
        "proxy_to_client",
        targetResponse,
        false,
        context,
      );
      await writeClient(targetResponse);
    }
  };

  const handleTargetMessage = (message: RpcMessage): void => {
    const id = responseId(message);
    const method = methodOf(message);
    if (method !== undefined) {
      if (id !== undefined) targetInitiatedRequests.add(requestKey(id));
      recordRequest(
        "target",
        "target_to_proxy",
        message,
        method === "tools/call",
        toolOf(message),
        id,
      );
      void writeClient(message).catch(fail);
      return;
    }
    if (id === undefined) {
      recordResponse("target", "target_to_proxy", message, false);
      void writeClient(message);
      return;
    }
    const key = requestKey(id);
    const wait = pending.get(key);
    if (!wait) {
      if (discardedTargetIds.delete(key)) {
        recordResponse(
          "target",
          "target_to_proxy",
          message,
          Boolean(toolOf(message)),
          undefined,
        );
        return;
      }
      recordResponse("target", "target_to_proxy", message, true);
      void writeClient(message);
      return;
    }
    pending.delete(key);
    if (wait.timer) clearTimeout(wait.timer);
    recordResponse(
      "target",
      "target_to_proxy",
      message,
      Boolean(wait.tool),
      wait.tool
        ? {
            clientMessage: wait.message,
            clientId: id,
            tool: wait.tool,
            operationId: `target:${id}`,
          }
        : undefined,
    );
    if (wait.suppressClient) wait.resolve(message);
    else wait.resolve(message);
  };

  const consumeLines = (chunk: Buffer, source: "client" | "target"): void => {
    const current = source === "client" ? clientBuffer : targetBuffer;
    const combined = Buffer.concat([current, chunk]);
    if (combined.length > MAX_LINE_BYTES && !combined.includes(10)) {
      fail(
        new Error(
          `${source} MCP stream exceeded the ${MAX_LINE_BYTES}-byte line limit.`,
        ),
      );
      return;
    }
    let offset = 0;
    while (true) {
      const newline = combined.indexOf(10, offset);
      if (newline === -1) break;
      const line = combined
        .subarray(offset, newline)
        .toString("utf8")
        .replace(/\r$/, "");
      offset = newline + 1;
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
        fail(
          new Error(
            `${source} MCP message exceeded the ${MAX_LINE_BYTES}-byte line limit.`,
          ),
        );
        return;
      }
      try {
        const message = JSON.parse(line) as unknown;
        if (!isObject(message))
          throw new Error("MCP message must be a JSON object.");
        if (source === "client") {
          const task = handleClientMessage(message).catch((error: unknown) =>
            fail(error),
          );
          clientTasks.push(task);
        } else handleTargetMessage(message);
      } catch (error) {
        fail(
          new Error(
            `Invalid ${source} MCP message: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        return;
      }
    }
    const remainder = combined.subarray(offset);
    if (source === "client") clientBuffer = remainder;
    else targetBuffer = remainder;
  };

  target.stdout.on("data", (chunk: Buffer) => consumeLines(chunk, "target"));
  target.stdout.on("error", fail);
  target.stdin.on("error", fail);
  target.stderr.on("data", (chunk: Buffer) => {
    const text = redactText(String(chunk));
    record({
      side: "target",
      kind: "stderr",
      message: text,
      physicalCall: false,
    });
    process.stderr.write(text);
  });
  target.once("error", fail);
  target.once("close", () => {
    targetCloseResolve?.();
    if (!closing && !failure)
      fail(
        new Error("Target process exited while the proxy was still active."),
      );
    rejectPending(
      failure ??
        new Error("Target process closed before replying to a request."),
    );
  });

  process.stdin.on("data", (chunk: Buffer) => consumeLines(chunk, "client"));
  process.stdin.on("error", fail);
  let clientEnded = false;
  const clientEnd = new Promise<void>((resolve) => {
    process.stdin.once("end", () => {
      clientEnded = true;
      resolve();
    });
  });
  process.once("SIGINT", () => void closeTarget());
  process.once("SIGTERM", () => void closeTarget());

  runTimer = setTimeout(
    () => fail(new Error("Proxy exceeded its maximum run duration.")),
    options.maxRunMs ?? DEFAULT_MAX_RUN_MS,
  );
  runTimer.unref();

  await Promise.race([targetClosed, clientEnd]);
  if (clientEnded) await Promise.allSettled(clientTasks);
  await closeTarget();
  rejectPending(
    failure ?? new Error("Proxy closed before a pending response arrived."),
  );
  await Promise.allSettled(clientTasks);
  await Promise.allSettled([clientWriteChain, targetWriteChain]);
  capture.sourceSha256 = captureSourceHash(capture);
  if (options.capturePath) await writeCapture(capture, options.capturePath);
  if (failure) throw failure;
  return capture;
}

export function parseProxyTarget(command: string): {
  command: string;
  args: string[];
} {
  const words = splitCommandLine(command);
  if (!words.length) throw new Error("Proxy target command cannot be empty.");
  return { command: words[0]!, args: words.slice(1) };
}

export async function writeCapture(
  capture: ProxyCapture,
  outputPath: string,
): Promise<string> {
  const file = path.resolve(outputPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(
    temporary,
    `${JSON.stringify(redactUnknown(capture), null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  await fs.rename(temporary, file);
  return file;
}

export function captureSourceHash(
  capture: Pick<ProxyCapture, "target" | "events">,
): string {
  const value = JSON.parse(
    JSON.stringify(
      redactUnknown({
        target: capture.target,
        events: capture.events.map(
          ({ sequence, timestamp, ...event }) => event,
        ),
      }),
    ),
  ) as JsonValue;
  return hashJson(value);
}

function pathParts(value: string): Array<string | number> {
  return value
    .replaceAll(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function mutationPath(
  message: RpcMessage,
  value: string,
): Array<string | number> {
  const parts = pathParts(value);
  return parts[0] === "result" || !("result" in message)
    ? parts
    : ["result", ...parts];
}

function deleteJsonPath(message: RpcMessage, value: string): boolean {
  const parts = mutationPath(message, value);
  if (!parts.length) return false;
  let current: unknown = message;
  for (const part of parts.slice(0, -1)) {
    if (
      (typeof part === "number" && Array.isArray(current)) ||
      (typeof part === "string" && isObject(current))
    )
      current = current[part as never];
    else return false;
  }
  const final = parts.at(-1)!;
  if (typeof final === "number" && Array.isArray(current)) {
    if (final < 0 || final >= current.length) return false;
    current.splice(final, 1);
    return true;
  }
  if (typeof final === "string" && isObject(current) && final in current) {
    delete current[final];
    return true;
  }
  return false;
}

function replaceJsonPath(
  message: RpcMessage,
  value: string,
  replacement: JsonValue,
): boolean {
  const parts = mutationPath(message, value);
  if (!parts.length) return false;
  let current: unknown = message;
  for (const part of parts.slice(0, -1)) {
    if (
      (typeof part === "number" && Array.isArray(current)) ||
      (typeof part === "string" && isObject(current))
    )
      current = current[part as never];
    else return false;
  }
  const final = parts.at(-1)!;
  if (typeof final === "number" && Array.isArray(current)) {
    if (final < 0 || final >= current.length) return false;
    current[final] = replacement;
    return true;
  }
  if (typeof final === "string" && isObject(current) && final in current) {
    current[final] = replacement;
    return true;
  }
  return false;
}

function replaceFirstCursor(value: unknown, replacement: JsonValue): boolean {
  if (Array.isArray(value)) {
    for (const item of value)
      if (replaceFirstCursor(item, replacement)) return true;
    return false;
  }
  if (!isObject(value)) return false;
  for (const key of [
    "next_cursor",
    "nextCursor",
    "cursor",
    "continuationToken",
  ])
    if (key in value) {
      value[key] = replacement;
      return true;
    }
  for (const nested of Object.values(value))
    if (replaceFirstCursor(nested, replacement)) return true;
  return false;
}

function isObject(value: unknown): value is RpcMessage {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function minimalEnvironment(): Record<string, string> {
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
  const environment: Record<string, string> = {};
  for (const key of permitted) {
    const value = process.env[key];
    if (value !== undefined && !value.startsWith("()"))
      environment[key] = value;
  }
  return environment;
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function writeLine(stream: NodeJS.WritableStream, line: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      stream.removeListener("drain", onDrain);
      stream.removeListener("error", onError);
    };
    const onDrain = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    stream.once("error", onError);
    try {
      if (stream.write(line)) {
        settled = true;
        cleanup();
        resolve();
      } else stream.once("drain", onDrain);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
