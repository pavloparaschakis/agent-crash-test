import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import { once } from "node:events";
import type { AddressInfo, Socket } from "node:net";
import { REDACTION_MARKER, redactText } from "./redaction.js";
import type { JsonValue } from "./types.js";

export const DEFAULT_HTTP_TRANSPORT_LIMITS = Object.freeze({
  maxRequestBodyBytes: 4 * 1024 * 1024,
  maxResponseBodyBytes: 8 * 1024 * 1024,
  maxSseEventBytes: 1024 * 1024,
  maxSseSessionBytes: 32 * 1024 * 1024,
  requestTimeoutMs: 10_000,
  sseIdleTimeoutMs: 30_000,
  shutdownGraceMs: 1_000,
  maxMutationDelayMs: 10_000,
});

export type HttpHeaderValue = string | string[];
export type HttpHeaderMap = Record<string, HttpHeaderValue>;
export type HttpHeaderChanges = Record<
  string,
  HttpHeaderValue | null | undefined
>;

export interface HttpTransportRequestContext {
  method: "POST" | "GET" | "DELETE";
  path: string;
  /** Header values are always redacted before hooks receive them. */
  headers: HttpHeaderMap;
}

export interface HttpResponseMutationContext {
  kind: "response";
  request: HttpTransportRequestContext;
  statusCode: number;
  /** Header values are always redacted before hooks receive them. */
  headers: HttpHeaderMap;
  body?: Uint8Array;
  streaming: boolean;
}

export interface HttpSseMutationContext {
  kind: "sse-event";
  request: HttpTransportRequestContext;
  statusCode: number;
  /** Header values are always redacted before hooks receive them. */
  headers: HttpHeaderMap;
  event: Uint8Array;
  sequence: number;
}

export interface HttpResponseMutationResult {
  statusCode?: number;
  headerChanges?: HttpHeaderChanges;
  body?: Uint8Array | string;
  delayMs?: number;
  drop?: boolean;
  close?: boolean;
}

/**
 * Integration seam for the existing mutation engine. Regular responses are
 * bounded and passed to `onResponse` as a whole. SSE responses first call
 * `onResponse` with `streaming: true`, then call `onSseEvent` for each bounded
 * event. Hooks only receive redacted headers.
 */
export interface HttpResponseMutationHooks {
  onResponse?(
    context: HttpResponseMutationContext,
  ):
    | HttpResponseMutationResult
    | void
    | Promise<HttpResponseMutationResult | void>;
  onSseEvent?(
    context: HttpSseMutationContext,
  ):
    | HttpResponseMutationResult
    | void
    | Promise<HttpResponseMutationResult | void>;
}

export type HttpProxyEventKind =
  | "request"
  | "upstream_response"
  | "request_complete"
  | "rejected"
  | "transport_error"
  | "shutdown";

export interface HttpProxyEvent {
  kind: HttpProxyEventKind;
  timestamp: string;
  method?: string;
  path?: string;
  statusCode?: number;
  streaming?: boolean;
  /** Event headers are redacted and safe to persist. */
  headers?: HttpHeaderMap;
  message?: string;
}

export interface HttpTransportProxyOptions {
  targetUrl: string | URL;
  host?: string;
  port?: number;
  mountPath?: string;
  /** Required for any non-loopback listening address. */
  allowRemoteBinding?: boolean;
  /** Required for any non-loopback upstream target. */
  allowRemoteTarget?: boolean;
  maxRequestBodyBytes?: number;
  maxResponseBodyBytes?: number;
  maxSseEventBytes?: number;
  maxSseSessionBytes?: number;
  requestTimeoutMs?: number;
  sseIdleTimeoutMs?: number;
  shutdownGraceMs?: number;
  maxMutationDelayMs?: number;
  responseMutation?: HttpResponseMutationHooks;
  onEvent?(event: HttpProxyEvent): void;
}

export interface ResolvedHttpTransportProxyOptions {
  targetUrl: URL;
  host: string;
  port: number;
  mountPath: string;
  allowRemoteBinding: boolean;
  allowRemoteTarget: boolean;
  maxRequestBodyBytes: number;
  maxResponseBodyBytes: number;
  maxSseEventBytes: number;
  maxSseSessionBytes: number;
  requestTimeoutMs: number;
  sseIdleTimeoutMs: number;
  shutdownGraceMs: number;
  maxMutationDelayMs: number;
  responseMutation?: HttpResponseMutationHooks;
  onEvent?: (event: HttpProxyEvent) => void;
}

export interface HttpTransportProxy {
  readonly address: AddressInfo;
  readonly url: string;
  readonly targetUrl: string;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export type HttpTransportRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export class HttpTransportConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpTransportConfigurationError";
  }
}

class HttpTransportFailure extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly rpcCode: number,
  ) {
    super(message);
    this.name = "HttpTransportFailure";
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const SECRET_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
]);

function isSensitiveHeader(name: string): boolean {
  const normalized = name.toLowerCase().replaceAll("_", "-");
  return (
    SECRET_HEADER_NAMES.has(normalized) ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.endsWith("-key")
  );
}

/** Return a detached, lower-cased header map safe for logs and hooks. */
export function redactHttpHeaders(
  headers: IncomingHttpHeaders | OutgoingHttpHeaders | HttpHeaderMap,
): HttpHeaderMap {
  const safe: HttpHeaderMap = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    const values = Array.isArray(rawValue)
      ? rawValue.map(String)
      : [String(rawValue)];
    const redacted = isSensitiveHeader(name)
      ? values.map(() => REDACTION_MARKER)
      : values.map((value) => redactText(value));
    safe[name] = redacted.length === 1 ? (redacted[0] ?? "") : redacted;
  }
  return safe;
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  const octets = host.split(".");
  if (octets.length !== 4) return false;
  const numbers = octets.map((value) => Number(value));
  return (
    numbers.every(
      (value, index) =>
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 255 &&
        (index > 0 || value === 127),
    ) && numbers[0] === 127
  );
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new HttpTransportConfigurationError(
      `${label} must be a positive safe integer.`,
    );
  return value;
}

/** Resolve and validate options without opening a socket. */
export function resolveHttpTransportOptions(
  options: HttpTransportProxyOptions,
): ResolvedHttpTransportProxyOptions {
  let targetUrl: URL;
  try {
    targetUrl =
      options.targetUrl instanceof URL
        ? new URL(options.targetUrl.href)
        : new URL(options.targetUrl);
  } catch {
    throw new HttpTransportConfigurationError(
      "targetUrl must be a valid absolute URL.",
    );
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:")
    throw new HttpTransportConfigurationError(
      "targetUrl must use http: or https:.",
    );
  if (targetUrl.username || targetUrl.password)
    throw new HttpTransportConfigurationError(
      "targetUrl must not contain credentials; forward authorization headers explicitly.",
    );
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackHostname(host) && options.allowRemoteBinding !== true)
    throw new HttpTransportConfigurationError(
      `Refusing non-loopback bind address ${host}; set allowRemoteBinding only inside an explicit network boundary.`,
    );
  if (
    !isLoopbackHostname(targetUrl.hostname) &&
    options.allowRemoteTarget !== true
  )
    throw new HttpTransportConfigurationError(
      `Refusing non-loopback target ${targetUrl.hostname}; set allowRemoteTarget only for a trusted endpoint.`,
    );
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
    throw new HttpTransportConfigurationError(
      "port must be an integer from 0 through 65535.",
    );
  const mountPath = options.mountPath ?? "/mcp";
  if (
    !mountPath.startsWith("/") ||
    mountPath.includes("?") ||
    mountPath.includes("#")
  )
    throw new HttpTransportConfigurationError(
      "mountPath must be an absolute path without a query or fragment.",
    );
  return {
    targetUrl,
    host,
    port,
    mountPath,
    allowRemoteBinding: options.allowRemoteBinding === true,
    allowRemoteTarget: options.allowRemoteTarget === true,
    maxRequestBodyBytes: positiveInteger(
      options.maxRequestBodyBytes ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.maxRequestBodyBytes,
      "maxRequestBodyBytes",
    ),
    maxResponseBodyBytes: positiveInteger(
      options.maxResponseBodyBytes ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.maxResponseBodyBytes,
      "maxResponseBodyBytes",
    ),
    maxSseEventBytes: positiveInteger(
      options.maxSseEventBytes ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.maxSseEventBytes,
      "maxSseEventBytes",
    ),
    maxSseSessionBytes: positiveInteger(
      options.maxSseSessionBytes ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.maxSseSessionBytes,
      "maxSseSessionBytes",
    ),
    requestTimeoutMs: positiveInteger(
      options.requestTimeoutMs ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.requestTimeoutMs,
      "requestTimeoutMs",
    ),
    sseIdleTimeoutMs: positiveInteger(
      options.sseIdleTimeoutMs ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.sseIdleTimeoutMs,
      "sseIdleTimeoutMs",
    ),
    shutdownGraceMs: positiveInteger(
      options.shutdownGraceMs ?? DEFAULT_HTTP_TRANSPORT_LIMITS.shutdownGraceMs,
      "shutdownGraceMs",
    ),
    maxMutationDelayMs: positiveInteger(
      options.maxMutationDelayMs ??
        DEFAULT_HTTP_TRANSPORT_LIMITS.maxMutationDelayMs,
      "maxMutationDelayMs",
    ),
    responseMutation: options.responseMutation,
    onEvent: options.onEvent,
  };
}

function emit(
  options: ResolvedHttpTransportProxyOptions,
  event: Omit<HttpProxyEvent, "timestamp">,
): void {
  try {
    options.onEvent?.({
      ...event,
      timestamp: new Date().toISOString(),
      message: event.message ? redactText(event.message) : undefined,
      headers: event.headers ? redactHttpHeaders(event.headers) : undefined,
    });
  } catch {
    // Observability must never affect proxy behavior.
  }
}

function copyRequestHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const forwarded: OutgoingHttpHeaders = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (
      value === undefined ||
      name === "host" ||
      name === "content-length" ||
      HOP_BY_HOP_HEADERS.has(name)
    )
      continue;
    forwarded[name] = value;
  }
  return forwarded;
}

function copyResponseHeaders(
  headers: IncomingHttpHeaders,
): OutgoingHttpHeaders {
  const forwarded: OutgoingHttpHeaders = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (
      value === undefined ||
      name === "content-length" ||
      HOP_BY_HOP_HEADERS.has(name)
    )
      continue;
    forwarded[name] = value;
  }
  return forwarded;
}

function applyHeaderChanges(
  headers: OutgoingHttpHeaders,
  changes?: HttpHeaderChanges,
): OutgoingHttpHeaders {
  if (!changes) return headers;
  for (const [rawName, value] of Object.entries(changes)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(name) || name === "content-length") continue;
    if (value === null || value === undefined) delete headers[name];
    else headers[name] = value;
  }
  return headers;
}

function requestContext(
  request: IncomingMessage,
  path: string,
): HttpTransportRequestContext {
  return {
    method: request.method as HttpTransportRequestContext["method"],
    path,
    headers: redactHttpHeaders(request.headers),
  };
}

function isJsonRpcMessage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.jsonrpc !== "2.0") return false;
  if (typeof message.method === "string") return true;
  return (
    Object.prototype.hasOwnProperty.call(message, "id") &&
    (Object.prototype.hasOwnProperty.call(message, "result") ||
      Object.prototype.hasOwnProperty.call(message, "error"))
  );
}

function parseJsonRpcBody(body: Buffer): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpTransportFailure("Malformed JSON request body.", 400, -32700);
  }
  if (
    !isJsonRpcMessage(parsed) &&
    !(
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(isJsonRpcMessage)
    )
  )
    throw new HttpTransportFailure(
      "Request body must be a JSON-RPC 2.0 message or non-empty batch.",
      400,
      -32600,
    );
  return parsed as JsonValue;
}

function readBoundedRequestBody(
  request: IncomingMessage,
  limit: number,
  timeoutMs: number,
): Promise<Buffer> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    request.resume();
    return Promise.reject(
      new HttpTransportFailure(
        `Request body exceeds the ${limit}-byte limit.`,
        413,
        -32000,
      ),
    );
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        new HttpTransportFailure(
          `Request body timed out after ${timeoutMs}ms.`,
          408,
          -32001,
        ),
      );
      request.resume();
    }, timeoutMs);
    timer.unref();

    const cleanup = (): void => {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
    };
    const finish = (error?: Error, body?: Buffer): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(body ?? Buffer.alloc(0));
    };
    const onData = (chunk: Buffer | string): void => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += data.byteLength;
      if (bytes > limit) {
        finish(
          new HttpTransportFailure(
            `Request body exceeds the ${limit}-byte limit.`,
            413,
            -32000,
          ),
        );
        request.resume();
        return;
      }
      chunks.push(data);
    };
    const onEnd = (): void => finish(undefined, Buffer.concat(chunks, bytes));
    const onError = (error: Error): void => finish(error);
    const onAborted = (): void =>
      finish(new Error("Client disconnected before the request completed."));
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    request.once("aborted", onAborted);
  });
}

function errorBody(code: number, message: string): Buffer {
  return Buffer.from(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code, message: redactText(message) },
    })}\n`,
  );
}

function sendFailure(
  response: ServerResponse,
  failure: HttpTransportFailure,
): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = errorBody(failure.rpcCode, failure.message);
  response.writeHead(failure.statusCode, {
    "content-type": "application/json",
    "content-length": String(body.byteLength),
    "cache-control": "no-store",
    connection:
      failure.statusCode === 408 || failure.statusCode === 413
        ? "close"
        : "keep-alive",
  });
  response.end(body);
}

function boundedStatusCode(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isInteger(value) && value! >= 100 && value! <= 599
    ? value!
    : fallback;
}

function mutationBody(
  value: Uint8Array | string | undefined,
  fallback: Buffer,
): Buffer {
  if (value === undefined) return fallback;
  return typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
}

async function applyDelay(
  requested: number | undefined,
  maximum: number,
): Promise<void> {
  if (requested === undefined || requested <= 0) return;
  const duration = Math.min(Math.floor(requested), maximum);
  await new Promise<void>((resolve) => setTimeout(resolve, duration));
}

async function writeChunk(
  response: ServerResponse,
  chunk: Buffer,
): Promise<void> {
  if (response.destroyed || response.writableEnded) return;
  if (!response.write(chunk)) await once(response, "drain");
}

function sseBoundary(buffer: Buffer): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf < 0) return crlf < 0 ? -1 : crlf + 4;
  if (crlf < 0) return lf + 2;
  return Math.min(lf + 2, crlf + 4);
}

function targetPath(target: URL, incoming: URL): string {
  const query = new URLSearchParams(target.search);
  for (const [key, value] of incoming.searchParams) query.append(key, value);
  const serialized = query.toString();
  return `${target.pathname || "/"}${serialized ? `?${serialized}` : ""}`;
}

async function forwardSseResponse(
  upstream: IncomingMessage,
  response: ServerResponse,
  context: HttpTransportRequestContext,
  options: ResolvedHttpTransportProxyOptions,
): Promise<void> {
  const baseStatus = upstream.statusCode ?? 502;
  const safeHeaders = redactHttpHeaders(upstream.headers);
  const initial = await options.responseMutation?.onResponse?.({
    kind: "response",
    request: context,
    statusCode: baseStatus,
    headers: safeHeaders,
    streaming: true,
  });
  await applyDelay(initial?.delayMs, options.maxMutationDelayMs);
  if (initial?.close) {
    response.destroy();
    upstream.destroy();
    return;
  }
  const headers = applyHeaderChanges(
    copyResponseHeaders(upstream.headers),
    initial?.headerChanges,
  );
  headers["content-type"] = headers["content-type"] ?? "text/event-stream";
  headers["cache-control"] = headers["cache-control"] ?? "no-cache";
  response.writeHead(
    boundedStatusCode(initial?.statusCode, baseStatus),
    headers,
  );
  if (initial?.drop) {
    upstream.resume();
    response.end();
    return;
  }

  let pending = Buffer.alloc(0);
  let totalBytes = 0;
  let sequence = 0;
  upstream.setTimeout(options.sseIdleTimeoutMs, () => {
    upstream.destroy(
      new HttpTransportFailure(
        `SSE stream was idle for ${options.sseIdleTimeoutMs}ms.`,
        504,
        -32001,
      ),
    );
  });

  const forwardEvent = async (event: Buffer): Promise<boolean> => {
    if (event.byteLength > options.maxSseEventBytes)
      throw new HttpTransportFailure(
        `SSE event exceeds the ${options.maxSseEventBytes}-byte limit.`,
        502,
        -32000,
      );
    const changed = await options.responseMutation?.onSseEvent?.({
      kind: "sse-event",
      request: context,
      statusCode: baseStatus,
      headers: safeHeaders,
      event,
      sequence: ++sequence,
    });
    await applyDelay(changed?.delayMs, options.maxMutationDelayMs);
    if (changed?.close) {
      response.destroy();
      upstream.destroy();
      return false;
    }
    if (changed?.drop) return true;
    const output = mutationBody(changed?.body, event);
    if (output.byteLength > options.maxSseEventBytes)
      throw new HttpTransportFailure(
        `Mutated SSE event exceeds the ${options.maxSseEventBytes}-byte limit.`,
        502,
        -32000,
      );
    await writeChunk(response, output);
    return true;
  };

  for await (const raw of upstream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    totalBytes += chunk.byteLength;
    if (totalBytes > options.maxSseSessionBytes)
      throw new HttpTransportFailure(
        `SSE session exceeds the ${options.maxSseSessionBytes}-byte limit.`,
        502,
        -32000,
      );
    pending = Buffer.concat([pending, chunk]);
    if (
      pending.byteLength > options.maxSseEventBytes &&
      sseBoundary(pending) < 0
    )
      throw new HttpTransportFailure(
        `SSE event exceeds the ${options.maxSseEventBytes}-byte limit.`,
        502,
        -32000,
      );
    let boundary = sseBoundary(pending);
    while (boundary >= 0) {
      const event = pending.subarray(0, boundary);
      pending = pending.subarray(boundary);
      if (!(await forwardEvent(event))) return;
      boundary = sseBoundary(pending);
    }
  }
  if (pending.byteLength > 0) await forwardEvent(pending);
  if (!response.destroyed) response.end();
}

async function forwardBufferedResponse(
  upstream: IncomingMessage,
  response: ServerResponse,
  context: HttpTransportRequestContext,
  options: ResolvedHttpTransportProxyOptions,
): Promise<void> {
  const declared = Number(upstream.headers["content-length"]);
  if (Number.isFinite(declared) && declared > options.maxResponseBodyBytes) {
    upstream.destroy();
    throw new HttpTransportFailure(
      `Upstream response exceeds the ${options.maxResponseBodyBytes}-byte limit.`,
      502,
      -32000,
    );
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const raw of upstream) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    bytes += chunk.byteLength;
    if (bytes > options.maxResponseBodyBytes) {
      upstream.destroy();
      throw new HttpTransportFailure(
        `Upstream response exceeds the ${options.maxResponseBodyBytes}-byte limit.`,
        502,
        -32000,
      );
    }
    chunks.push(chunk);
  }
  const originalBody = Buffer.concat(chunks, bytes);
  const baseStatus = upstream.statusCode ?? 502;
  const changed = await options.responseMutation?.onResponse?.({
    kind: "response",
    request: context,
    statusCode: baseStatus,
    headers: redactHttpHeaders(upstream.headers),
    body: originalBody,
    streaming: false,
  });
  await applyDelay(changed?.delayMs, options.maxMutationDelayMs);
  if (changed?.close) {
    response.destroy();
    return;
  }
  const body = changed?.drop
    ? Buffer.alloc(0)
    : mutationBody(changed?.body, originalBody);
  if (body.byteLength > options.maxResponseBodyBytes)
    throw new HttpTransportFailure(
      `Mutated response exceeds the ${options.maxResponseBodyBytes}-byte limit.`,
      502,
      -32000,
    );
  const headers = applyHeaderChanges(
    copyResponseHeaders(upstream.headers),
    changed?.headerChanges,
  );
  headers["content-length"] = String(body.byteLength);
  response.writeHead(
    boundedStatusCode(changed?.statusCode, baseStatus),
    headers,
  );
  response.end(body);
}

interface HandlerRuntime {
  readonly activeUpstreams: Set<http.ClientRequest>;
  isClosing(): boolean;
}

function isResolvedOptions(
  input: HttpTransportProxyOptions | ResolvedHttpTransportProxyOptions,
): input is ResolvedHttpTransportProxyOptions {
  const candidate = input as Partial<ResolvedHttpTransportProxyOptions>;
  return (
    candidate.targetUrl instanceof URL &&
    typeof candidate.host === "string" &&
    typeof candidate.port === "number" &&
    typeof candidate.mountPath === "string" &&
    typeof candidate.allowRemoteBinding === "boolean" &&
    typeof candidate.allowRemoteTarget === "boolean" &&
    typeof candidate.maxRequestBodyBytes === "number" &&
    typeof candidate.maxResponseBodyBytes === "number" &&
    typeof candidate.maxSseEventBytes === "number" &&
    typeof candidate.maxSseSessionBytes === "number" &&
    typeof candidate.requestTimeoutMs === "number" &&
    typeof candidate.sseIdleTimeoutMs === "number" &&
    typeof candidate.shutdownGraceMs === "number" &&
    typeof candidate.maxMutationDelayMs === "number"
  );
}

/**
 * Create an async request handler for embedding in an existing Node HTTP
 * server. Parent wiring should catch unexpected rejections; protocol and
 * upstream failures are converted to bounded HTTP/JSON-RPC responses here.
 */
export function createHttpTransportRequestHandler(
  input: HttpTransportProxyOptions | ResolvedHttpTransportProxyOptions,
  runtime: HandlerRuntime = {
    activeUpstreams: new Set(),
    isClosing: () => false,
  },
): HttpTransportRequestHandler {
  const options = isResolvedOptions(input)
    ? input
    : resolveHttpTransportOptions(input);

  return async (request, response): Promise<void> => {
    const incomingUrl = new URL(request.url ?? "/", "http://localhost");
    const method = request.method?.toUpperCase();
    if (runtime.isClosing()) {
      sendFailure(
        response,
        new HttpTransportFailure("Transport is shutting down.", 503, -32000),
      );
      return;
    }
    if (incomingUrl.pathname !== options.mountPath) {
      sendFailure(
        response,
        new HttpTransportFailure(
          "MCP transport endpoint not found.",
          404,
          -32601,
        ),
      );
      return;
    }
    if (method === "OPTIONS") {
      response.writeHead(204, {
        allow: "POST, GET, DELETE, OPTIONS",
        "content-length": "0",
      });
      response.end();
      return;
    }
    if (method !== "POST" && method !== "GET" && method !== "DELETE") {
      response.writeHead(405, {
        allow: "POST, GET, DELETE, OPTIONS",
        "content-type": "application/json",
      });
      response.end(
        errorBody(-32601, `Unsupported method ${method ?? "UNKNOWN"}.`),
      );
      return;
    }

    const context = requestContext(
      request,
      `${incomingUrl.pathname}${incomingUrl.search}`,
    );
    emit(options, {
      kind: "request",
      method,
      path: context.path,
      headers: context.headers,
    });

    let body: Buffer = Buffer.alloc(0);
    try {
      if (method === "POST") {
        const contentType = request.headers["content-type"] ?? "";
        if (!/^application\/json(?:\s*;|$)/i.test(contentType))
          throw new HttpTransportFailure(
            "POST requests must use Content-Type: application/json.",
            415,
            -32600,
          );
        body = await readBoundedRequestBody(
          request,
          options.maxRequestBodyBytes,
          options.requestTimeoutMs,
        );
        parseJsonRpcBody(body);
      }

      const headers = copyRequestHeaders(request.headers);
      if (body.byteLength > 0)
        headers["content-length"] = String(body.byteLength);
      const requestOptions: http.RequestOptions = {
        protocol: options.targetUrl.protocol,
        hostname: options.targetUrl.hostname,
        port: options.targetUrl.port || undefined,
        method,
        path: targetPath(options.targetUrl, incomingUrl),
        headers,
      };
      const upstreamRequest =
        options.targetUrl.protocol === "https:"
          ? https.request(requestOptions)
          : http.request(requestOptions);
      runtime.activeUpstreams.add(upstreamRequest);
      let timedOut = false;
      const totalTimer = setTimeout(() => {
        timedOut = true;
        upstreamRequest.destroy(new Error("Upstream request timed out."));
      }, options.requestTimeoutMs);
      totalTimer.unref();
      const disconnect = (): void => {
        if (!response.writableEnded)
          upstreamRequest.destroy(new Error("Downstream client disconnected."));
      };
      request.once("aborted", disconnect);
      response.once("close", disconnect);

      try {
        const upstream = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            upstreamRequest.once("response", resolve);
            upstreamRequest.once("error", reject);
            upstreamRequest.end(body);
          },
        );
        const contentType = String(upstream.headers["content-type"] ?? "");
        const streaming = /^text\/event-stream(?:\s*;|$)/i.test(contentType);
        if (streaming) clearTimeout(totalTimer);
        emit(options, {
          kind: "upstream_response",
          method,
          path: context.path,
          statusCode: upstream.statusCode,
          streaming,
          headers: redactHttpHeaders(upstream.headers),
        });
        if (streaming)
          await forwardSseResponse(upstream, response, context, options);
        else
          await forwardBufferedResponse(upstream, response, context, options);
        emit(options, {
          kind: "request_complete",
          method,
          path: context.path,
          statusCode: response.statusCode,
          streaming,
        });
      } catch (error) {
        if (timedOut)
          throw new HttpTransportFailure(
            `Upstream request timed out after ${options.requestTimeoutMs}ms.`,
            504,
            -32001,
          );
        throw error;
      } finally {
        clearTimeout(totalTimer);
        request.off("aborted", disconnect);
        response.off("close", disconnect);
        runtime.activeUpstreams.delete(upstreamRequest);
      }
    } catch (error) {
      const failure =
        error instanceof HttpTransportFailure
          ? error
          : new HttpTransportFailure(
              `HTTP transport failure: ${redactText(
                error instanceof Error ? error.message : String(error),
              )}`,
              502,
              -32000,
            );
      emit(options, {
        kind:
          failure.statusCode >= 400 && failure.statusCode < 500
            ? "rejected"
            : "transport_error",
        method,
        path: context.path,
        statusCode: failure.statusCode,
        message: failure.message,
      });
      sendFailure(response, failure);
    }
  };
}

/** Start a loopback-safe MCP Streamable HTTP/SSE forwarding proxy. */
export async function startHttpTransportProxy(
  input: HttpTransportProxyOptions,
): Promise<HttpTransportProxy> {
  const options = resolveHttpTransportOptions(input);
  const sockets = new Set<Socket>();
  const activeUpstreams = new Set<http.ClientRequest>();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  let closedResolve: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    closedResolve = resolve;
  });
  const runtime: HandlerRuntime = {
    activeUpstreams,
    isClosing: () => closing,
  };
  const handler = createHttpTransportRequestHandler(options, runtime);
  const server = http.createServer((request, response) => {
    void handler(request, response).catch((error) => {
      sendFailure(
        response,
        new HttpTransportFailure(
          `HTTP transport failure: ${redactText(String(error))}`,
          500,
          -32603,
        ),
      );
    });
  });
  server.requestTimeout = options.requestTimeoutMs;
  server.headersTimeout = Math.max(options.requestTimeoutMs, 1_000);
  server.keepAliveTimeout = Math.min(options.requestTimeoutMs, 5_000);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, options.host);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("HTTP transport did not receive a TCP address.");
  }
  const displayHost =
    address.family === "IPv6" ? `[${address.address}]` : address.address;

  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closing = true;
    emit(options, {
      kind: "shutdown",
      message: "HTTP transport is shutting down.",
    });
    closePromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(forceTimer);
        closedResolve?.();
        resolve();
      };
      const forceTimer = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections?.();
        finish();
      }, options.shutdownGraceMs);
      forceTimer.unref();
      for (const request of activeUpstreams)
        request.destroy(new Error("HTTP transport is shutting down."));
      server.close(finish);
      server.closeIdleConnections?.();
    });
    return closePromise;
  };

  return {
    address: { ...address },
    url: `http://${displayHost}:${address.port}${options.mountPath}`,
    targetUrl: options.targetUrl.href,
    closed,
    close,
  };
}
