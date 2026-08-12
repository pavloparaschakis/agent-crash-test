import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs/promises";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { containsPotentialSecret, REDACTION_MARKER } from "./redaction.js";
import type { RunResult } from "./types.js";

const STORAGE_SCHEMA_VERSION = 1 as const;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_COLLECTION_ENTRIES = 10_000;
const DEFAULT_MAX_STORED_RUNS = 1_000;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_LIST_LIMIT = 100;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORED_FILE_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/i;

export interface HostedServiceOptions {
  /** Directory dedicated to hosted-service state. It is created with owner-only permissions. */
  dataDirectory: string;
  /** Bearer token required for every /v1 endpoint. Minimum 16 characters. */
  apiToken: string;
  /** Bind address. Defaults to IPv4 localhost and must be set explicitly for remote access. */
  host?: string;
  /** Bind port. Use 0 to request an ephemeral port. Defaults to 7411. */
  port?: number;
  /** Maximum JSON request size before envelope metadata. */
  maxBodyBytes?: number;
  /** Maximum entries permitted in any top-level RunResult collection. */
  maxCollectionEntries?: number;
  /** Maximum retained run files; oldest records are removed after a successful upload. */
  maxStoredRuns?: number;
  /** Maximum age of a stored run. Expired records are removed on startup and API access. */
  retentionMs?: number;
  /** Maximum permitted `limit` for list requests. */
  maxListLimit?: number;
  /** Exact HTTP(S) origins allowed to use browser CORS. Empty/omitted means CORS is off. */
  corsAllowedOrigins?: readonly string[];
  /** Time allowed for active requests to finish during stop(). */
  shutdownGraceMs?: number;
  /** Per-request timeout applied by the Node HTTP server. */
  requestTimeoutMs?: number;
}

export interface HostedRunSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  byteLength: number;
  runId: string;
  packId: string;
  packName: string;
  findingCount: number;
  failedFindingCount: number;
}

export interface HostedRunRecord extends HostedRunSummary {
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  run: RunResult;
}

export interface StartedHostedService {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly dataDirectory: string;
  readonly server: Server;
  /** Idempotently stop accepting connections and drain active requests. */
  stop(): Promise<void>;
}

interface NormalizedOptions {
  dataDirectory: string;
  runsDirectory: string;
  apiToken: string;
  host: string;
  port: number;
  maxBodyBytes: number;
  maxCollectionEntries: number;
  maxStoredRuns: number;
  retentionMs: number;
  maxListLimit: number;
  corsAllowedOrigins: ReadonlySet<string>;
  shutdownGraceMs: number;
  requestTimeoutMs: number;
}

interface StoredFile {
  filePath: string;
  record: HostedRunRecord;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Start the local collaboration service. The function resolves only after the
 * socket is listening and startup retention has completed.
 */
export async function startHostedService(
  input: HostedServiceOptions,
): Promise<StartedHostedService> {
  const options = normalizeOptions(input);
  await prepareStorage(options);
  await pruneStoredRuns(options);

  let mutationQueue: Promise<void> = Promise.resolve();
  const serialized = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const server = http.createServer((request, response) => {
    void handleRequest(request, response, options, serialized).catch(
      (error) => {
        if (response.headersSent || response.destroyed) {
          response.destroy();
          return;
        }
        if (error instanceof HttpError) {
          sendError(response, error.status, error.code, error.message);
          return;
        }
        sendError(
          response,
          500,
          "internal_error",
          "The hosted service could not complete the request.",
        );
      },
    );
  });
  server.requestTimeout = options.requestTimeoutMs;
  server.headersTimeout = Math.min(options.requestTimeoutMs, 60_000);
  server.keepAliveTimeout = 5_000;

  try {
    await listen(server, options.host, options.port);
  } catch (error) {
    server.closeAllConnections();
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    server.closeAllConnections();
    throw new Error("Hosted service did not expose a TCP address.");
  }
  const bound = address as AddressInfo;
  const displayHost =
    bound.family === "IPv6" ? `[${bound.address}]` : bound.address;
  let stopPromise: Promise<void> | undefined;

  return {
    host: bound.address,
    port: bound.port,
    url: `http://${displayHost}:${bound.port}`,
    dataDirectory: options.dataDirectory,
    server,
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          server.closeAllConnections();
        }, options.shutdownGraceMs);
        timer.unref();
        server.close((error) => {
          clearTimeout(timer);
          void mutationQueue.then(() => {
            if (error) reject(error);
            else resolve();
          });
        });
        server.closeIdleConnections();
      });
      return stopPromise;
    },
  };
}

/** Convenience API for parent integrations that hold a nullable service handle. */
export async function stopHostedService(
  service: StartedHostedService | undefined,
): Promise<void> {
  await service?.stop();
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: NormalizedOptions,
  serialized: <T>(operation: () => Promise<T>) => Promise<T>,
): Promise<void> {
  setCommonHeaders(response);
  const rawTarget = request.url ?? "/";
  if (hasTraversal(rawTarget)) {
    throw new HttpError(400, "invalid_path", "Path traversal is not allowed.");
  }

  let url: URL;
  try {
    url = new URL(rawTarget, "http://localhost");
  } catch {
    throw new HttpError(400, "invalid_path", "The request path is invalid.");
  }

  const corsEnabled = applyCors(request, response, options);
  if (request.method === "OPTIONS") {
    if (!corsEnabled) {
      response.setHeader("Allow", "GET, POST, DELETE");
      sendError(response, 405, "cors_disabled", "CORS is not enabled.");
      return;
    }
    response.statusCode = 204;
    response.end();
    return;
  }

  if (url.pathname === "/health") {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendError(response, 405, "method_not_allowed", "Only GET is supported.");
      return;
    }
    sendJson(response, 200, {
      status: "ok",
      service: "agent-crash-test-hosted",
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    });
    return;
  }

  if (!url.pathname.startsWith("/v1/")) {
    sendError(response, 404, "not_found", "Endpoint not found.");
    return;
  }
  if (!isAuthorized(request, options.apiToken)) {
    response.setHeader("WWW-Authenticate", 'Bearer realm="agent-crash-test"');
    sendError(response, 401, "unauthorized", "A valid API token is required.");
    return;
  }

  if (url.pathname === "/v1/runs") {
    if (request.method === "POST") {
      await uploadRun(request, response, options, serialized);
      return;
    }
    if (request.method === "GET") {
      await listRuns(url, response, options, serialized);
      return;
    }
    response.setHeader("Allow", "GET, POST");
    sendError(
      response,
      405,
      "method_not_allowed",
      "Only GET and POST are supported.",
    );
    return;
  }

  if (url.pathname.startsWith("/v1/runs/")) {
    const encodedId = url.pathname.slice("/v1/runs/".length);
    let id: string;
    try {
      id = decodeURIComponent(encodedId);
    } catch {
      throw new HttpError(400, "invalid_run_id", "Run ID encoding is invalid.");
    }
    assertRunId(id);
    if (request.method === "GET") {
      const record = await serialized(async () => {
        await pruneStoredRuns(options);
        return readStoredRun(options, id);
      });
      if (!record) {
        sendError(response, 404, "run_not_found", "Run not found.");
        return;
      }
      sendJson(response, 200, record);
      return;
    }
    if (request.method === "DELETE") {
      const deleted = await serialized(() => deleteStoredRun(options, id));
      if (!deleted) {
        sendError(response, 404, "run_not_found", "Run not found.");
        return;
      }
      response.statusCode = 204;
      response.end();
      return;
    }
    response.setHeader("Allow", "GET, DELETE");
    sendError(
      response,
      405,
      "method_not_allowed",
      "Only GET and DELETE are supported.",
    );
    return;
  }

  sendError(response, 404, "not_found", "Endpoint not found.");
}

async function uploadRun(
  request: IncomingMessage,
  response: ServerResponse,
  options: NormalizedOptions,
  serialized: <T>(operation: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json.",
    );
  }
  const body = await readBoundedBody(request, options.maxBodyBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
    );
  }
  const run = validateRunResult(parsed, options.maxCollectionEntries);
  assertRedacted(run);

  const record = await serialized(async () => {
    await pruneStoredRuns(options);
    const stored = await persistRun(options, run, body.byteLength);
    await pruneStoredRuns(options);
    return stored;
  });
  response.setHeader("Location", `/v1/runs/${record.id}`);
  sendJson(response, 201, summaryOf(record));
}

async function listRuns(
  url: URL,
  response: ServerResponse,
  options: NormalizedOptions,
  serialized: <T>(operation: () => Promise<T>) => Promise<T>,
): Promise<void> {
  const limitValue = url.searchParams.get("limit");
  let limit = Math.min(50, options.maxListLimit);
  if (limitValue !== null) {
    if (!/^[1-9][0-9]*$/.test(limitValue)) {
      throw new HttpError(
        400,
        "invalid_limit",
        "limit must be a positive integer.",
      );
    }
    limit = Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit > options.maxListLimit) {
      throw new HttpError(
        400,
        "invalid_limit",
        `limit must not exceed ${options.maxListLimit}.`,
      );
    }
  }
  const records = await serialized(async () => {
    await pruneStoredRuns(options);
    return readAllStoredRuns(options);
  });
  const runs = records
    .map(({ record }) => summaryOf(record))
    .sort(compareNewestFirst)
    .slice(0, limit);
  sendJson(response, 200, {
    runs,
    count: runs.length,
    total: records.length,
    limit,
  });
}

async function persistRun(
  options: NormalizedOptions,
  run: RunResult,
  byteLength: number,
): Promise<HostedRunRecord> {
  const id = randomUUID();
  const createdAt = new Date();
  const record: HostedRunRecord = {
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    id,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + options.retentionMs,
    ).toISOString(),
    byteLength,
    runId: run.identity.runId,
    packId: run.pack.id,
    packName: run.pack.name,
    findingCount: run.findings.length,
    failedFindingCount: run.findings.filter(
      (finding) => finding.status === "failed",
    ).length,
    run,
  };
  const finalPath = safeRunPath(options, id);
  const temporaryPath = path.join(
    options.runsDirectory,
    `.run-${id}-${randomBytes(8).toString("hex")}.tmp`,
  );
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, finalPath);
    await syncDirectoryBestEffort(options.runsDirectory);
    return record;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function pruneStoredRuns(options: NormalizedOptions): Promise<void> {
  await assertSafeRunsDirectory(options.runsDirectory);
  const files = await readAllStoredRuns(options);
  const now = Date.now();
  const retained: StoredFile[] = [];
  for (const file of files) {
    const expiresAt = Date.parse(file.record.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      await fs.unlink(file.filePath).catch(ignoreMissing);
    } else {
      retained.push(file);
    }
  }
  retained.sort((left, right) => compareOldestFirst(left.record, right.record));
  const overflow = Math.max(0, retained.length - options.maxStoredRuns);
  for (const file of retained.slice(0, overflow)) {
    await fs.unlink(file.filePath).catch(ignoreMissing);
  }
  if (files.length !== retained.length || overflow > 0) {
    await syncDirectoryBestEffort(options.runsDirectory);
  }
}

async function readAllStoredRuns(
  options: NormalizedOptions,
): Promise<StoredFile[]> {
  await assertSafeRunsDirectory(options.runsDirectory);
  const entries = await fs.readdir(options.runsDirectory, {
    withFileTypes: true,
  });
  const records: StoredFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = STORED_FILE_PATTERN.exec(entry.name);
    if (!match) continue;
    const filePath = path.join(options.runsDirectory, entry.name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > options.maxBodyBytes * 2 + 64 * 1024) continue;
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
      const record = validateStoredRecord(
        parsed,
        match[1],
        options.maxCollectionEntries,
      );
      records.push({ filePath, record });
    } catch {
      // Corrupt or externally modified files are ignored, never served or deleted.
    }
  }
  return records;
}

async function readStoredRun(
  options: NormalizedOptions,
  id: string,
): Promise<HostedRunRecord | undefined> {
  const filePath = safeRunPath(options, id);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > options.maxBodyBytes * 2 + 64 * 1024) return undefined;
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return validateStoredRecord(parsed, id, options.maxCollectionEntries);
  } catch (error) {
    if (isMissing(error)) return undefined;
    return undefined;
  }
}

async function deleteStoredRun(
  options: NormalizedOptions,
  id: string,
): Promise<boolean> {
  await assertSafeRunsDirectory(options.runsDirectory);
  try {
    await fs.unlink(safeRunPath(options, id));
    await syncDirectoryBestEffort(options.runsDirectory);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function validateRunResult(value: unknown, maxEntries: number): RunResult {
  if (!isRecord(value)) {
    throw new HttpError(
      422,
      "invalid_run_result",
      "RunResult must be an object.",
    );
  }
  if (value.schemaVersion !== 1) invalidRunResult("schemaVersion must be 1");
  requireRecord(value, "identity");
  requireString(value.identity, "runId");
  requireString(value.identity, "startedAt");
  requireRecord(value, "pack");
  requireString(value.pack, "id");
  requireString(value.pack, "name");
  requireString(value.pack, "source");
  requireString(value, "transport");
  requireRecord(value, "server");
  requireRecord(value, "reproduction");
  requireRecord(value, "policy");
  for (const key of [
    "manifest",
    "mutations",
    "events",
    "effects",
    "assertions",
    "findings",
    "executionWarnings",
  ] as const) {
    const collection = value[key];
    if (!Array.isArray(collection)) invalidRunResult(`${key} must be an array`);
    if (collection.length > maxEntries) {
      throw new HttpError(
        413,
        "collection_limit_exceeded",
        `${key} exceeds the ${maxEntries}-entry limit.`,
      );
    }
  }
  const events: unknown = value.events;
  if (!Array.isArray(events)) invalidRunResult("events must be an array");
  for (const [index, event] of events.entries()) {
    if (!isRecord(event) || event.redactionApplied !== true) {
      throw new HttpError(
        422,
        "redaction_required",
        `events[${index}].redactionApplied must be true.`,
      );
    }
  }
  const findings: unknown = value.findings;
  if (!Array.isArray(findings)) invalidRunResult("findings must be an array");
  for (const [index, finding] of findings.entries()) {
    if (!isRecord(finding) || finding.redactionApplied !== true) {
      throw new HttpError(
        422,
        "redaction_required",
        `findings[${index}].redactionApplied must be true.`,
      );
    }
  }
  return value as unknown as RunResult;
}

function assertRedacted(value: unknown): void {
  const stack: Array<{ value: unknown; path: string; depth: number }> = [
    { value, path: "$", depth: 0 },
  ];
  let visited = 0;
  while (stack.length) {
    const current = stack.pop()!;
    visited += 1;
    if (visited > 250_000 || current.depth > 128) {
      throw new HttpError(
        413,
        "payload_complexity_exceeded",
        "RunResult nesting or value count exceeds the safety limit.",
      );
    }
    if (typeof current.value === "string") {
      if (containsPotentialSecret(current.value)) {
        throw new HttpError(
          422,
          "potential_secret_detected",
          `Potential secret-shaped text was found at ${current.path}. Redact it before upload.`,
        );
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (let index = 0; index < current.value.length; index += 1) {
        stack.push({
          value: current.value[index],
          path: `${current.path}[${index}]`,
          depth: current.depth + 1,
        });
      }
      continue;
    }
    if (!isRecord(current.value)) continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) {
        throw new HttpError(
          422,
          "unsafe_object_key",
          `Unsafe object key was found at ${current.path}.`,
        );
      }
      if (isSecretKey(key) && nested !== REDACTION_MARKER) {
        throw new HttpError(
          422,
          "potential_secret_detected",
          `Sensitive field ${current.path}.${key} must contain ${REDACTION_MARKER}.`,
        );
      }
      stack.push({
        value: nested,
        path: `${current.path}.${key}`,
        depth: current.depth + 1,
      });
    }
  }
}

function validateStoredRecord(
  value: unknown,
  expectedId: string,
  maxCollectionEntries: number,
): HostedRunRecord {
  if (!isRecord(value)) throw new Error("Stored record is not an object.");
  if (value.storageSchemaVersion !== STORAGE_SCHEMA_VERSION)
    throw new Error("Unsupported storage schema.");
  if (value.id !== expectedId || !RUN_ID_PATTERN.test(expectedId))
    throw new Error("Stored record ID mismatch.");
  for (const key of ["createdAt", "expiresAt", "runId", "packId", "packName"]) {
    if (typeof value[key] !== "string") throw new Error(`Missing ${key}.`);
  }
  for (const key of ["byteLength", "findingCount", "failedFindingCount"]) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0)
      throw new Error(`Invalid ${key}.`);
  }
  if (!isRecord(value.run)) throw new Error("Missing RunResult.");
  const run = validateRunResult(value.run, maxCollectionEntries);
  assertRedacted(run);
  if (
    value.runId !== run.identity.runId ||
    value.packId !== run.pack.id ||
    value.packName !== run.pack.name ||
    value.findingCount !== run.findings.length ||
    value.failedFindingCount !==
      run.findings.filter((finding) => finding.status === "failed").length
  ) {
    throw new Error("Stored record metadata does not match its RunResult.");
  }
  return value as unknown as HostedRunRecord;
}

function normalizeOptions(input: HostedServiceOptions): NormalizedOptions {
  if (!input || typeof input !== "object")
    throw new TypeError("Hosted service options are required.");
  if (typeof input.dataDirectory !== "string" || !input.dataDirectory.trim())
    throw new TypeError("dataDirectory must be a non-empty path.");
  if (typeof input.apiToken !== "string" || input.apiToken.length < 16)
    throw new TypeError("apiToken must contain at least 16 characters.");
  const dataDirectory = path.resolve(input.dataDirectory);
  const host = input.host ?? DEFAULT_HOST;
  if (!host.trim()) throw new TypeError("host must not be empty.");
  const port = integerOption("port", input.port ?? 7411, 0, 65_535);
  const maxBodyBytes = integerOption(
    "maxBodyBytes",
    input.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    256,
    128 * 1024 * 1024,
  );
  const maxCollectionEntries = integerOption(
    "maxCollectionEntries",
    input.maxCollectionEntries ?? DEFAULT_MAX_COLLECTION_ENTRIES,
    1,
    1_000_000,
  );
  const maxStoredRuns = integerOption(
    "maxStoredRuns",
    input.maxStoredRuns ?? DEFAULT_MAX_STORED_RUNS,
    1,
    1_000_000,
  );
  const retentionMs = integerOption(
    "retentionMs",
    input.retentionMs ?? DEFAULT_RETENTION_MS,
    1,
    10 * 365 * 24 * 60 * 60 * 1_000,
  );
  const maxListLimit = integerOption(
    "maxListLimit",
    input.maxListLimit ?? DEFAULT_MAX_LIST_LIMIT,
    1,
    10_000,
  );
  const shutdownGraceMs = integerOption(
    "shutdownGraceMs",
    input.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS,
    1,
    60_000,
  );
  const requestTimeoutMs = integerOption(
    "requestTimeoutMs",
    input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    1_000,
    10 * 60_000,
  );
  const origins = new Set<string>();
  for (const origin of input.corsAllowedOrigins ?? []) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new TypeError(`Invalid CORS origin: ${origin}`);
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin !== origin ||
      origin === "*"
    ) {
      throw new TypeError(
        `CORS origin must be an exact HTTP(S) origin: ${origin}`,
      );
    }
    origins.add(origin);
  }
  return {
    dataDirectory,
    runsDirectory: path.join(dataDirectory, "runs"),
    apiToken: input.apiToken,
    host,
    port,
    maxBodyBytes,
    maxCollectionEntries,
    maxStoredRuns,
    retentionMs,
    maxListLimit,
    corsAllowedOrigins: origins,
    shutdownGraceMs,
    requestTimeoutMs,
  };
}

async function prepareStorage(options: NormalizedOptions): Promise<void> {
  await fs.mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(options.dataDirectory, 0o700).catch(() => undefined);
  await fs.mkdir(options.runsDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(options.runsDirectory, 0o700).catch(() => undefined);
  await assertSafeRunsDirectory(options.runsDirectory);
}

async function assertSafeRunsDirectory(directory: string): Promise<void> {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Hosted-service runs path must be a real directory.");
  }
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  options: NormalizedOptions,
): boolean {
  const origin = request.headers.origin;
  if (!origin || !options.corsAllowedOrigins.has(origin)) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS",
  );
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin");
  return true;
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return false;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return false;
  const expected = createHash("sha256").update(token).digest();
  const actual = createHash("sha256").update(match[1]).digest();
  return timingSafeEqual(expected, actual);
}

async function readBoundedBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const declared = request.headers["content-length"];
  if (declared !== undefined) {
    if (!/^[0-9]+$/.test(declared))
      throw new HttpError(
        400,
        "invalid_content_length",
        "Content-Length is invalid.",
      );
    if (Number(declared) > maxBytes) {
      request.resume();
      throw new HttpError(
        413,
        "body_limit_exceeded",
        "Request body is too large.",
      );
    }
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) {
      throw new HttpError(
        413,
        "body_limit_exceeded",
        "Request body is too large.",
      );
    }
    chunks.push(buffer);
  }
  if (size === 0)
    throw new HttpError(400, "invalid_json", "Request body must not be empty.");
  return Buffer.concat(chunks, size);
}

function summaryOf(record: HostedRunRecord): HostedRunSummary {
  const {
    id,
    createdAt,
    expiresAt,
    byteLength,
    runId,
    packId,
    packName,
    findingCount,
    failedFindingCount,
  } = record;
  return {
    id,
    createdAt,
    expiresAt,
    byteLength,
    runId,
    packId,
    packName,
    findingCount,
    failedFindingCount,
  };
}

function compareNewestFirst(
  left: HostedRunSummary,
  right: HostedRunSummary,
): number {
  return (
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function compareOldestFirst(
  left: HostedRunSummary,
  right: HostedRunSummary,
): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function safeRunPath(options: NormalizedOptions, id: string): string {
  assertRunId(id);
  const candidate = path.resolve(options.runsDirectory, `${id}.json`);
  const prefix = `${path.resolve(options.runsDirectory)}${path.sep}`;
  if (!candidate.startsWith(prefix)) {
    throw new HttpError(400, "invalid_run_id", "Run ID is invalid.");
  }
  return candidate;
}

function assertRunId(id: string): void {
  if (!RUN_ID_PATTERN.test(id)) {
    throw new HttpError(400, "invalid_run_id", "Run ID is invalid.");
  }
}

function hasTraversal(target: string): boolean {
  let pathname = target.split("?", 1)[0].replaceAll("\\", "/");
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
      if (decoded === pathname) break;
      pathname = decoded;
    } catch {
      return true;
    }
  }
  return pathname
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function isSecretKey(key: string): boolean {
  const normalized = key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  return (
    new Set([
      "authorization",
      "bearer",
      "token",
      "secret",
      "password",
      "cookie",
      "apikey",
      "privatekey",
      "accesskey",
      "refreshtoken",
      "session",
      "credential",
      "webhooksecret",
    ]).has(normalized) ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("accesskey") ||
    normalized.endsWith("cookie")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(
  parent: Record<string, unknown>,
  key: string,
): asserts parent is Record<string, unknown> &
  Record<typeof key, Record<string, unknown>> {
  if (!isRecord(parent[key])) invalidRunResult(`${key} must be an object`);
}

function requireString(parent: Record<string, unknown>, key: string): void {
  if (typeof parent[key] !== "string" || !(parent[key] as string).trim())
    invalidRunResult(`${key} must be a non-empty string`);
}

function invalidRunResult(reason: string): never {
  throw new HttpError(
    422,
    "invalid_run_result",
    `Invalid RunResult: ${reason}.`,
  );
}

function integerOption(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", payload.byteLength);
  response.end(payload);
}

function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  sendJson(response, status, { error: { code, message } });
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function syncDirectoryBestEffort(directory: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(directory, "r");
    await handle.sync();
  } catch {
    // Directory fsync is unavailable on some supported platforms.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function ignoreMissing(error: unknown): void {
  if (!isMissing(error)) throw error;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
