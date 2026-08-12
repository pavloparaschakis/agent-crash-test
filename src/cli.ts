#!/usr/bin/env node
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { generateStarterPack, loadCapture } from "./capture.js";
import {
  confirmGuidedCapture,
  proposeGuidedCapture,
  type GuidedCaptureConfirmations,
} from "./guided-capture.js";
import { splitCommandLine } from "./command-line.js";
import { asCrashTestError } from "./errors.js";
import { jsonlMarkdown, parseJsonl } from "./jsonl.js";
import { evaluateJsonlRun } from "./jsonl-evaluator.js";
import { McpStdioClient } from "./mcp-client.js";
import { loadPack, writeStarterPack } from "./pack.js";
import { parseProxyTarget, runStdioProxy } from "./proxy.js";
import { runProxyPack } from "./proxy-runner.js";
import { startUiServer } from "./ui-server.js";
import {
  startHttpTransportProxy,
  type HttpResponseMutationHooks,
  type HttpResponseMutationResult,
} from "./http-transport.js";
import { startHostedService } from "./hosted-service.js";
import {
  githubSummaryReport,
  isBlocking,
  junitReport,
  markdownReport,
  sarifReport,
  terminalReport,
  writeReports,
} from "./reporters.js";
import { redactUnknown } from "./redaction.js";
import { runPack } from "./runner.js";
import type {
  MutationType,
  RunOptions,
  RunResult,
  Severity,
  ToolManifest,
  EffectClass,
  JsonValue,
} from "./types.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const usage = `Agent Crash Test v0.1.0

Usage:
  agent-crash-test demo
  agent-crash-test init [directory] [--server "node server.js"] [--force] [--github-action]
  agent-crash-test discover --stdio "node server.js" [--format json]
  agent-crash-test proxy --stdio "node server.js" [proxy options]
  agent-crash-test test <pack.yaml> [--client "python agent.py"] [run options]
  agent-crash-test wrap <pack.yaml> [--portable]
  agent-crash-test ui [report-directory] [--port <integer>]
  agent-crash-test http-proxy --target http://127.0.0.1:3000/mcp [proxy options]
  agent-crash-test hosted <serve|upload|list|delete> [options]
  agent-crash-test capture --stdio "node server.js" --output capture.json [--dry-run]
  agent-crash-test capture generate capture.json --output starter.yaml [--name "scenario"]
  agent-crash-test capture guide capture.json [confirmation options] [--output contract.yaml]
    (--observer-tool <tool> | --observer-command "node inspect-state.js" --allow-unsafe-observer)
  agent-crash-test bridge [--input events.jsonl] [--contract pack.yaml] [--format <format>] [--output report]
    [--max-line-bytes <integer>] [--max-records <integer>] [--max-input-bytes <integer>]
  agent-crash-test import capture.json --output starter.yaml
  agent-crash-test compare before-report.json after-report.json [--format json|markdown]
  agent-crash-test explain report.json [--format terminal|markdown|json]
  agent-crash-test export report.json --format <format> --output <directory>
  agent-crash-test mutate <pack-or-directory> --profile <resilience|safety|all>
  agent-crash-test run <pack-or-directory> [options]
  agent-crash-test doctor

Run options:
  --format terminal,markdown,json,junit,github-summary,sarif
  --output <directory>
  --fail-on <info|notice|warning|error|blocker>
  --seed <integer>
  --request-timeout-ms <integer>
  --max-run-ms <integer>
  --mutation-types <type,type,...>
  --allow-unsafe-probes
  --no-color

Proxy options:
  --mutation-type <type> (select one mutation per proxy session)
  --applies-to <tool>  --occurrence <integer>  --duration-ms <integer>
  --capture <capture.json>  --max-run-ms <integer>
  --max-capture-events <integer>  --max-capture-bytes <integer>

Real-client mode exposes AGENT_CRASH_TEST_MCP_COMMAND and AGENT_CRASH_TEST_MCP_ARGS_JSON to a cooperative client command.`;

type Flags = Record<string, string | boolean>;

class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: 2 | 3 | 4 | 10,
  ) {
    super(message);
    this.name = "CliError";
  }
}

class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
  }
}

class PolicyError extends CliError {
  constructor(message: string) {
    super(message, 4);
  }
}

function parseArgs(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const [key, assigned] = value.slice(2).split("=", 2);
    if (assigned !== undefined) {
      flags[key] = assigned;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else flags[key] = true;
  }
  return { positionals, flags };
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  if (value === true) throw new UsageError(`--${name} requires a value`);
  return typeof value === "string" ? value : undefined;
}

function integerFlag(
  flags: Flags,
  name: string,
  positive = false,
): number | undefined {
  const raw = stringFlag(flags, name);
  if (raw === undefined) return undefined;
  if (!/^-?\d+$/.test(raw))
    throw new UsageError(`--${name} requires an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (positive ? value <= 0 : value < 0))
    throw new UsageError(
      `--${name} must be ${positive ? "a positive" : "a non-negative"} integer`,
    );
  return value;
}

function failOnFlag(flags: Flags): Severity {
  const value = stringFlag(flags, "fail-on") ?? "error";
  if (!["info", "notice", "warning", "error", "blocker"].includes(value))
    throw new UsageError(`Unknown fail-on severity: ${value}`);
  return value as Severity;
}

function formatsFlag(flags: Flags): string[] {
  const formats = (stringFlag(flags, "format") ?? "terminal")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    !formats.length ||
    formats.some(
      (format) =>
        ![
          "terminal",
          "markdown",
          "json",
          "junit",
          "github-summary",
          "sarif",
          "html",
        ].includes(format),
    )
  )
    throw new UsageError(
      "--format supports terminal, markdown, json, junit, github-summary, sarif, and html",
    );
  return [...new Set(formats)];
}

async function yamlFiles(target: string): Promise<string[]> {
  const absolute = path.resolve(target);
  const info = await fs.stat(absolute);
  if (info.isFile()) return /\.ya?ml$/i.test(absolute) ? [absolute] : [];
  const entries = (await fs.readdir(absolute, { withFileTypes: true }))
    .filter(
      (entry) =>
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== "dist" &&
        entry.name !== "fixture.example.yaml",
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...(await yamlFiles(child)));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) files.push(child);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function optionsForRun(
  file: string,
  flags: Flags,
  mutationTypes?: string[],
  workingDirectory = process.cwd(),
): RunOptions {
  const requestedMutationTypes =
    mutationTypes ??
    stringFlag(flags, "mutation-types")
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  return {
    source: file,
    mutationTypes: requestedMutationTypes,
    failOn: failOnFlag(flags),
    seed: integerFlag(flags, "seed"),
    requestTimeoutMs: integerFlag(flags, "request-timeout-ms", true),
    maxRunMs: integerFlag(flags, "max-run-ms", true),
    allowUnsafeProbes: flags["allow-unsafe-probes"] === true ? true : undefined,
    workingDirectory,
  };
}

async function runFiles(
  files: string[],
  flags: Flags,
  mutationTypes?: string[],
  workingDirectory = process.cwd(),
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  const formats = formatsFlag(flags);
  const output = path.resolve(
    stringFlag(flags, "output") ?? ".agent-crash-test",
  );
  const configurationErrors: string[] = [];
  for (const file of files) {
    let pack;
    try {
      pack = (await loadPack(file)).pack;
    } catch (error) {
      configurationErrors.push(
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
    try {
      const result = await runPack(
        pack,
        optionsForRun(file, flags, mutationTypes, workingDirectory),
      );
      results.push(result);
      if (formats.includes("terminal")) console.log(terminalReport(result), "");
      const written = await writeReports(result, output, formats);
      const paths = Object.values(written);
      if (paths.length) console.log(`Artifacts: ${paths.join(", ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.startsWith("Invalid fixture") ||
        message.includes("fixture packs require")
      )
        configurationErrors.push(message);
      else throw error;
    }
  }
  if (configurationErrors.length)
    throw new UsageError(configurationErrors.join("\n"));
  return results;
}

async function commandDemo(): Promise<void> {
  const files = await yamlFiles(path.join(packageRoot, "examples", "packs"));
  const results = await runFiles(
    files,
    {
      format: "terminal,markdown,json",
      output: ".agent-crash-test/demo",
    },
    undefined,
    packageRoot,
  );
  const findings = results.flatMap((result) => result.findings).length;
  console.log(
    `Demo complete: ${results.length} packs, ${findings} intentional finding(s). Reports: .agent-crash-test/demo`,
  );
}

async function commandInit(positionals: string[], flags: Flags): Promise<void> {
  const target = path.resolve(positionals[0] ?? "tests/agent");
  let pack: string;
  try {
    pack = await writeStarterPack(
      target,
      stringFlag(flags, "server"),
      flags.force === true,
    );
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  console.log(`Created ${pack}`);
  console.log(`Instructions: ${path.join(path.dirname(pack), "README.md")}`);
  if (flags["github-action"]) {
    const relativePack = (path.relative(process.cwd(), pack) || pack)
      .split(path.sep)
      .join("/");
    console.log(`
GitHub Action snippet (replace COMMIT with an immutable revision):

jobs:
  agent-crash-test:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - uses: pavloparaschakis/agent-crash-test@COMMIT
        with:
          path: ${relativePack}
          format: terminal,markdown,json
          output: artifacts/agent-crash-test
          fail-on: error
`);
  }
}

function targetError(
  error: unknown,
  fallback: "initialization" | "spawn" = "initialization",
): CliError {
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const typed = asCrashTestError(cause, fallback);
  return new CliError(typed.message, typed.exitCode);
}

function discoverTool(tool: ToolManifest): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchemaPresent: tool.outputSchema !== undefined,
    annotations: tool.annotations,
  };
}

async function commandDiscover(flags: Flags): Promise<void> {
  const command = stringFlag(flags, "stdio");
  if (!command)
    throw new UsageError('discover requires --stdio "command args"');
  const [program, ...args] = splitCommandLine(command);
  if (!program) throw new UsageError("discover received an empty command");
  const client = new McpStdioClient({ command: program, args }, process.cwd());
  try {
    await client.connect({
      requestTimeoutMs: integerFlag(flags, "request-timeout-ms", true),
    });
    const manifest = await client.listTools({
      requestTimeoutMs: integerFlag(flags, "request-timeout-ms", true),
    });
    const normalized = redactUnknown({
      server: { command: program, args },
      warning:
        "Tool annotations are untrusted claims; readOnlyHint is not proof of behavior.",
      tools: manifest.map(discoverTool),
    }) as {
      server: { command: string; args: string[] };
      warning: string;
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: unknown;
        outputSchemaPresent: boolean;
        annotations?: unknown;
      }>;
    };
    if (stringFlag(flags, "format") === "json")
      console.log(JSON.stringify(normalized, null, 2));
    else {
      console.log(
        `Server: ${normalized.server.command} ${normalized.server.args.join(" ")}`.trim(),
      );
      console.log(
        "Warning: tool annotations are untrusted claims; readOnlyHint is not proof of behavior.",
      );
      for (const tool of normalized.tools) {
        console.log(
          `\n${tool.name}${tool.description ? ` — ${tool.description}` : ""}`,
        );
        console.log(
          `  input schema: ${tool.inputSchema ? "present" : "not declared"}`,
        );
        console.log(
          `  output schema: ${tool.outputSchemaPresent ? "present" : "not declared"}`,
        );
        console.log(`  annotations: ${JSON.stringify(tool.annotations ?? {})}`);
      }
    }
  } catch (error) {
    throw targetError(error);
  } finally {
    try {
      await client.close();
    } catch (error) {
      throw targetError(error, "initialization");
    }
  }
}

const proxyMutationTypes: MutationType[] = [
  "timeout",
  "retryable_error",
  "malformed_result",
  "stale_result",
  "duplicate_call",
  "permission_denied",
  "commit_then_response_lost",
  "disconnect_after_commit",
  "partial_success",
  "stale_read_then_conflicting_write",
  "rate_limit",
  "schema_drift",
  "truncated_response",
  "out_of_order_response",
  "corrupted_pagination_cursor",
  "slow_stream",
  "progress_stall",
];

function proxyMutations(flags: Flags) {
  const raw =
    stringFlag(flags, "mutation-type") ?? stringFlag(flags, "mutation-types");
  if (!raw) return [];
  const types = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unknown = types.filter(
    (type) => !proxyMutationTypes.includes(type as MutationType),
  );
  if (unknown.length)
    throw new UsageError(
      `Unknown proxy mutation type(s): ${unknown.join(", ")}. Supported types: ${proxyMutationTypes.join(", ")}`,
    );
  if (types.length > 1)
    throw new UsageError(
      "The proxy applies one mutation per session. Run separate proxy sessions for multiple mutations so each capture has one unambiguous fault.",
    );
  const appliesTo = stringFlag(flags, "applies-to");
  const occurrence = integerFlag(flags, "occurrence", true);
  const duration = integerFlag(flags, "duration-ms");
  const replacementRaw = stringFlag(flags, "replacement");
  let replacement: unknown;
  if (replacementRaw !== undefined) {
    try {
      replacement = JSON.parse(replacementRaw) as unknown;
    } catch {
      replacement = replacementRaw;
    }
  }
  return types.map((type, index) => ({
    id: `proxy-${type}-${index + 1}`,
    type: type as MutationType,
    applies_to: appliesTo,
    occurrence,
    duration_ms: duration,
    retry_after_ms: integerFlag(flags, "retry-after-ms"),
    remove_path: stringFlag(flags, "remove-path"),
    truncate_after_bytes: integerFlag(flags, "truncate-after-bytes"),
    cursor_path: stringFlag(flags, "cursor-path"),
    replacement: replacement as never,
  }));
}

async function commandProxy(
  flags: Flags,
  captureOnly = false,
  dryRun = false,
): Promise<void> {
  const command = stringFlag(flags, "stdio");
  if (!command)
    throw new UsageError(
      `${captureOnly ? "capture" : "proxy"} requires --stdio "command args"`,
    );
  const target = parseProxyTarget(command);
  const capturePath = dryRun ? undefined : stringFlag(flags, "capture");
  const capture = await runStdioProxy({
    targetCommand: target.command,
    targetArgs: target.args,
    mutations: captureOnly ? [] : proxyMutations(flags),
    capturePath,
    requestTimeoutMs: integerFlag(flags, "request-timeout-ms", true),
    maxRunMs: integerFlag(flags, "max-run-ms", true),
    maxCaptureEvents: integerFlag(flags, "max-capture-events", true),
    maxCaptureBytes: integerFlag(flags, "max-capture-bytes", true),
  });
  if (captureOnly && dryRun) {
    const tools = [
      ...new Set(
        capture.events
          .filter((event) => event.side === "client" && event.tool)
          .map((event) => event.tool!),
      ),
    ];
    process.stdout.write(
      [
        `Capture preview only: ${capture.events.length} event(s), ${tools.length} tool(s).`,
        tools.length ? `Tools: ${tools.join(", ")}` : "Tools: (none)",
        ...capture.warnings.map((warning) => `Warning: ${warning}`),
        "No capture file was written. Re-run without --dry-run to save it.",
      ].join("\n") + "\n",
    );
  } else if (captureOnly)
    process.stderr.write(
      `Capture written to ${path.resolve(capturePath ?? "capture.json")} (${capture.events.length} events).\n`,
    );
  else if (capturePath)
    process.stderr.write(
      `Proxy capture written to ${path.resolve(capturePath)} (${capture.events.length} events).\n`,
    );
}

async function commandWrap(positionals: string[], flags: Flags): Promise<void> {
  const source = positionals[0];
  if (!source) throw new UsageError("wrap requires a pack path");
  const absolute = path.resolve(source);
  const pack = (await loadPack(absolute)).pack;
  if (pack.transport !== "stdio")
    throw new UsageError(
      "wrap requires a stdio pack because the generated entry is an MCP proxy server",
    );
  const output = stringFlag(flags, "output");
  const portable = flags.portable === true;
  const entry = portable
    ? {
        command: "npx",
        args: [
          "--yes",
          "agent-crash-test@latest",
          "test",
          absolute,
          "--format",
          "markdown,json",
        ],
      }
    : {
        command: process.execPath,
        args: [
          fileURLToPath(import.meta.url),
          "test",
          absolute,
          "--format",
          "markdown,json",
        ],
      };
  const config = {
    mcpServers: {
      "agent-crash-test": entry,
    },
  };
  const content = `${JSON.stringify(config, null, 2)}\n`;
  if (!output) process.stdout.write(content);
  else {
    const file = path.resolve(output);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, { encoding: "utf8", mode: 0o600 });
    console.log(`MCP wrapper configuration written to ${file}`);
  }
}

async function commandUi(positionals: string[], flags: Flags): Promise<void> {
  const directory = path.resolve(
    positionals[0] ?? stringFlag(flags, "directory") ?? ".agent-crash-test",
  );
  const handle = await startUiServer({
    directory,
    port: integerFlag(flags, "port") ?? 0,
    title: stringFlag(flags, "title"),
  });
  console.log(`Agent Crash Test report UI: ${handle.url}`);
  if (flags.once === true) {
    await handle.close();
    return;
  }
  await new Promise<void>((resolve) => {
    const close = (): void => {
      void handle.close().finally(resolve);
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

async function commandHttpProxy(flags: Flags): Promise<void> {
  const targetUrl = stringFlag(flags, "target");
  if (!targetUrl) throw new UsageError("http-proxy requires --target <url>");
  const proxy = await startHttpTransportProxy({
    targetUrl,
    host: stringFlag(flags, "host"),
    port: integerFlag(flags, "port") ?? 0,
    mountPath: stringFlag(flags, "mount-path"),
    allowRemoteBinding: flags["allow-remote-binding"] === true,
    allowRemoteTarget: flags["allow-remote-target"] === true,
    requestTimeoutMs: integerFlag(flags, "request-timeout-ms", true),
    maxRequestBodyBytes: integerFlag(flags, "max-request-bytes", true),
    maxResponseBodyBytes: integerFlag(flags, "max-response-bytes", true),
    maxSseEventBytes: integerFlag(flags, "max-sse-event-bytes", true),
    maxSseSessionBytes: integerFlag(flags, "max-sse-session-bytes", true),
    sseIdleTimeoutMs: integerFlag(flags, "sse-idle-timeout-ms", true),
    responseMutation: httpMutation(flags),
    onEvent(event) {
      if (flags.quiet !== true)
        process.stderr.write(`${JSON.stringify(event)}\n`);
    },
  });
  console.log(`Agent Crash Test HTTP proxy: ${proxy.url}`);
  console.log(`Target: ${proxy.targetUrl}`);
  if (flags.once === true) {
    await proxy.close();
    return;
  }
  await new Promise<void>((resolve) => {
    const close = (): void => {
      void proxy.close().finally(resolve);
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

async function commandHosted(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const operation = positionals[0];
  const token =
    stringFlag(flags, "api-token") ?? process.env.AGENT_CRASH_TEST_API_TOKEN;
  if (!token)
    throw new UsageError(
      "hosted requires --api-token or AGENT_CRASH_TEST_API_TOKEN",
    );
  if (operation === "serve") {
    const service = await startHostedService({
      dataDirectory: path.resolve(
        stringFlag(flags, "data-directory") ?? ".agent-crash-test/hosted",
      ),
      apiToken: token,
      host: stringFlag(flags, "host"),
      port: integerFlag(flags, "port") ?? 7411,
      maxBodyBytes: integerFlag(flags, "max-body-bytes", true),
      maxStoredRuns: integerFlag(flags, "max-stored-runs", true),
      retentionMs: integerFlag(flags, "retention-ms", true),
    });
    console.log(`Agent Crash Test hosted service: ${service.url}`);
    if (flags.once === true) {
      await service.stop();
      return;
    }
    await new Promise<void>((resolve) => {
      const close = (): void => {
        void service.stop().finally(resolve);
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    });
    return;
  }
  const base = new URL(stringFlag(flags, "url") ?? "http://127.0.0.1:7411");
  const request = async (
    pathname: string,
    init: RequestInit = {},
  ): Promise<unknown> => {
    const response = await fetch(new URL(pathname, base), {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      // Preserve a non-JSON service response for diagnostics.
    }
    if (!response.ok)
      throw new CliError(
        `Hosted service returned ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
        3,
      );
    return body;
  };
  if (operation === "upload") {
    const reportPath = positionals[1];
    if (!reportPath) throw new UsageError("hosted upload requires report.json");
    const report = await loadRunReport(reportPath);
    console.log(
      JSON.stringify(
        await request("/v1/runs", {
          method: "POST",
          body: JSON.stringify(report),
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (operation === "list") {
    const limit = integerFlag(flags, "limit", true);
    console.log(
      JSON.stringify(
        await request(`/v1/runs${limit ? `?limit=${limit}` : ""}`),
        null,
        2,
      ),
    );
    return;
  }
  if (operation === "delete") {
    const id = positionals[1];
    if (!id) throw new UsageError("hosted delete requires a run id");
    console.log(
      JSON.stringify(
        await request(`/v1/runs/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
        null,
        2,
      ),
    );
    return;
  }
  throw new UsageError("hosted requires serve, upload, list, or delete");
}

function httpMutation(flags: Flags): HttpResponseMutationHooks | undefined {
  const raw = stringFlag(flags, "mutation-type");
  if (!raw) return undefined;
  if (!proxyMutationTypes.includes(raw as MutationType))
    throw new UsageError(
      `Unknown HTTP mutation type ${raw}. Supported response mutations: ${proxyMutationTypes.join(", ")}`,
    );
  const type = raw as MutationType;
  if (type === "duplicate_call")
    throw new UsageError(
      "HTTP duplicate_call requires request replay and is not available through the response hook; use stdio proxy mode.",
    );
  let priorBody: Uint8Array | undefined;
  return {
    onResponse(context): HttpResponseMutationResult | undefined {
      if (
        context.streaming &&
        type !== "slow_stream" &&
        type !== "progress_stall"
      )
        return undefined;
      const duration = integerFlag(flags, "duration-ms") ?? 1_000;
      const body = context.body;
      const remember = (): void => {
        if (body) priorBody = new Uint8Array(body);
      };
      switch (type) {
        case "timeout":
        case "commit_then_response_lost":
        case "disconnect_after_commit":
          remember();
          return { delayMs: duration, close: true };
        case "progress_stall":
          return { delayMs: duration, drop: true };
        case "slow_stream":
          return { delayMs: duration };
        case "rate_limit": {
          const retryAfterMs = integerFlag(flags, "retry-after-ms") ?? 1_000;
          return {
            statusCode: 429,
            headerChanges: {
              "retry-after": String(Math.ceil(retryAfterMs / 1_000)),
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: {
                code: 429,
                message: `Injected rate limit; retry after ${retryAfterMs}ms`,
              },
            }),
          };
        }
        case "retryable_error":
          return {
            statusCode: 503,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32000, message: "Injected retryable error" },
            }),
          };
        case "permission_denied":
          return {
            statusCode: 403,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32001, message: "Injected permission denial" },
            }),
          };
        case "malformed_result":
          return { body: mutateHttpJson(body, () => "__malformed_result__") };
        case "truncated_response":
          return {
            body: body?.subarray(
              0,
              integerFlag(flags, "truncate-after-bytes") ?? 64,
            ),
          };
        case "stale_result":
        case "stale_read_then_conflicting_write":
        case "out_of_order_response": {
          const stale = priorBody;
          remember();
          return stale ? { body: stale } : undefined;
        }
        case "schema_drift":
          return {
            body: mutateHttpJson(body, (value) => {
              if (value && typeof value === "object" && !Array.isArray(value))
                delete (value as Record<string, unknown>)[
                  stringFlag(flags, "remove-path") ?? "result"
                ];
              return value;
            }),
          };
        case "corrupted_pagination_cursor":
          return {
            body: mutateHttpJson(body, (value) => {
              replaceCursorValue(value);
              return value;
            }),
          };
        case "partial_success":
          return { statusCode: 500, body };
      }
    },
    onSseEvent(context): HttpResponseMutationResult | undefined {
      if (type === "slow_stream")
        return { delayMs: integerFlag(flags, "duration-ms") ?? 1_000 };
      if (type === "progress_stall") return { drop: true };
      void context;
      return undefined;
    },
  };
}

function mutateHttpJson(
  body: Uint8Array | undefined,
  mutate: (value: unknown) => unknown,
): Uint8Array | undefined {
  if (!body) return body;
  try {
    return Buffer.from(
      JSON.stringify(mutate(JSON.parse(Buffer.from(body).toString("utf8")))),
    );
  } catch {
    return body;
  }
}

function replaceCursorValue(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some((item) => replaceCursorValue(item));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of [
    "next_cursor",
    "nextCursor",
    "cursor",
    "continuationToken",
  ])
    if (key in record) {
      record[key] = "__agent_crash_test_invalid_cursor__";
      return true;
    }
  return Object.values(record).some((item) => replaceCursorValue(item));
}

async function commandTest(positionals: string[], flags: Flags): Promise<void> {
  const source = positionals[0];
  if (!source) throw new UsageError("test requires a pack path");
  const absolute = path.resolve(source);
  const pack = (await loadPack(absolute)).pack;
  const client = stringFlag(flags, "client");
  const output = path.resolve(
    stringFlag(flags, "output") ?? ".agent-crash-test/real-client",
  );
  const resultFile = path.resolve(
    stringFlag(flags, "result-file") ?? path.join(output, "result.json"),
  );
  if (client) {
    await fs.mkdir(path.dirname(resultFile), { recursive: true });
    const [program, ...args] = splitCommandLine(client);
    if (!program) throw new UsageError("--client received an empty command");
    const innerArgs = [
      fileURLToPath(import.meta.url),
      "test",
      absolute,
      "--result-file",
      resultFile,
      "--output",
      output,
      "--format",
      stringFlag(flags, "format") ?? "markdown,json",
      "--fail-on",
      failOnFlag(flags),
    ];
    if (flags["allow-unsafe-probes"] === true)
      innerArgs.push("--allow-unsafe-probes");
    for (const name of [
      "seed",
      "request-timeout-ms",
      "max-run-ms",
      "mutation-types",
    ]) {
      const value = stringFlag(flags, name);
      if (value !== undefined) innerArgs.push(`--${name}`, value);
    }
    const env = clientEnvironment(stringFlag(flags, "client-env"));
    env.AGENT_CRASH_TEST_MCP_COMMAND = process.execPath;
    env.AGENT_CRASH_TEST_MCP_ARGS_JSON = JSON.stringify(innerArgs);
    env.AGENT_CRASH_TEST_PACK = absolute;
    env.AGENT_CRASH_TEST_RESULT_FILE = resultFile;
    const child = spawn(program, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      windowsHide: process.platform === "win32",
      stdio: "inherit",
    });
    const clientExit = await waitForChild(
      child,
      integerFlag(flags, "max-run-ms", true) ??
        pack.execution?.max_run_ms ??
        60_000,
    );
    let result: RunResult;
    try {
      result = await loadRunReport(resultFile);
    } catch (error) {
      throw new CliError(
        `Client exited with ${clientExit}, but no completed crash-test report was produced: ${error instanceof Error ? error.message : String(error)}`,
        3,
      );
    }
    console.log(terminalReport(result));
    if (clientExit !== 0 && !result.executionError)
      throw new CliError(`Client command exited with status ${clientExit}.`, 3);
    if (result.executionError)
      throw new CliError(
        `${result.executionError.kind}: ${result.executionError.message}`,
        result.executionError.source === "probe-policy" ? 4 : 3,
      );
    if (isBlocking(result, failOnFlag(flags))) process.exitCode = 1;
    return;
  }

  const result = await runProxyPack(pack, {
    source: absolute,
    failOn: failOnFlag(flags),
    seed: integerFlag(flags, "seed"),
    requestTimeoutMs: integerFlag(flags, "request-timeout-ms", true),
    maxRunMs: integerFlag(flags, "max-run-ms", true),
    mutationTypes: stringFlag(flags, "mutation-types")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    allowUnsafeProbes: flags["allow-unsafe-probes"] === true ? true : undefined,
    capturePath: stringFlag(flags, "capture"),
  });
  const formats = formatsFlag(flags);
  const written = await writeReports(result, output, formats);
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  await fs.writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stderr.write(`${terminalReport(result)}\n`);
  const paths = [...Object.values(written), resultFile];
  process.stderr.write(`Artifacts: ${[...new Set(paths)].join(", ")}\n`);
  if (result.executionError) process.exitCode = 3;
  else if (isBlocking(result, failOnFlag(flags))) process.exitCode = 1;
}

function clientEnvironment(extra: string | undefined): Record<string, string> {
  const names = new Set([
    "PATH",
    "SystemRoot",
    "COMSPEC",
    "ComSpec",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    ...(extra
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []),
  ]);
  const env: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && !value.startsWith("()")) env[name] = value;
  }
  return env;
}

function waitForChild(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 500).unref();
    }, timeoutMs);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new Error(`Client exceeded ${timeoutMs}ms and was terminated.`));
      else if (signal)
        reject(new Error(`Client terminated with signal ${signal}.`));
      else resolve(code ?? 0);
    });
  });
}

async function commandCapture(
  positionals: string[],
  flags: Flags,
  commandName = "capture",
): Promise<void> {
  if (positionals[0] === "guide") {
    const input = positionals[1] ?? stringFlag(flags, "input");
    if (!input) throw new UsageError("capture guide requires a capture path");
    const capture = (await loadCapture(input)).capture;
    const proposal = proposeGuidedCapture(capture);
    const output = stringFlag(flags, "output");
    if (!output) {
      process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`);
      return;
    }
    const targetTool = stringFlag(flags, "target-tool");
    const mutationProfile = stringFlag(flags, "mutation-profile");
    const observerTool = stringFlag(flags, "observer-tool");
    const observerCommand = stringFlag(flags, "observer-command");
    const observerId = stringFlag(flags, "observer-id");
    const observerPath = stringFlag(flags, "observer-path");
    const effectClass = stringFlag(flags, "effect-class");
    const expectedRaw = stringFlag(flags, "expected");
    const cardinality = stringFlag(flags, "cardinality");
    const description = stringFlag(flags, "description");
    const missing = Object.entries({
      "target-tool": targetTool,
      "mutation-profile": mutationProfile,
      "observer-id": observerId,
      "observer-path": observerPath,
      "effect-class": effectClass,
      expected: expectedRaw,
      cardinality,
      description,
    })
      .filter(([, value]) => value === undefined)
      .map(([name]) => `--${name}`);
    if (missing.length)
      throw new UsageError(
        `capture guide requires explicit confirmations before writing a pack: ${missing.join(", ")}`,
      );
    if (Boolean(observerTool) === Boolean(observerCommand))
      throw new UsageError(
        "capture guide requires exactly one of --observer-tool or --observer-command",
      );
    if (observerCommand && flags["allow-unsafe-observer"] !== true)
      throw new PolicyError(
        "--observer-command executes a local state probe; review it and add --allow-unsafe-observer to confirm that boundary",
      );
    if (
      ![
        "read",
        "create",
        "update",
        "delete",
        "send",
        "approve",
        "deploy",
        "publish",
      ].includes(effectClass!)
    )
      throw new UsageError(`Invalid --effect-class ${effectClass}`);
    if (
      ![
        "zero_or_one",
        "at_most_once",
        "exactly_once",
        "at_least_once",
      ].includes(cardinality!)
    )
      throw new UsageError(`Invalid --cardinality ${cardinality}`);
    let expected: JsonValue;
    try {
      expected = JSON.parse(expectedRaw!) as JsonValue;
    } catch (error) {
      throw new UsageError(
        `--expected must be JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const profile = proposal.calls
      .find((call) => call.tool === targetTool)
      ?.mutationProfiles.find((candidate) => candidate.id === mutationProfile);
    if (!profile)
      throw new UsageError(
        `Mutation profile ${mutationProfile} was not proposed for ${targetTool}.`,
      );
    const confirmations: GuidedCaptureConfirmations = {
      target: { confirmed: true, tool: targetTool!, sideEffecting: true },
      mutationProfile: { confirmed: true, value: profile.id },
      observer: observerTool
        ? {
            confirmed: true,
            id: observerId!,
            source: "tool",
            tool: observerTool,
            path: observerPath!,
          }
        : (() => {
            const [command, ...args] = splitCommandLine(observerCommand!);
            if (!command)
              throw new UsageError("--observer-command cannot be empty");
            return {
              confirmed: true as const,
              id: observerId!,
              source: "json_command" as const,
              command,
              args,
              path: observerPath!,
              explicitUnsafeOptIn: true as const,
            };
          })(),
      effect: {
        confirmed: true,
        class: effectClass as EffectClass,
        expected,
        description: description!,
      },
      cardinality: {
        confirmed: true,
        value:
          cardinality as GuidedCaptureConfirmations["cardinality"]["value"],
      },
      forbidden: { confirmed: true, value: [] },
      ordering: { confirmed: true, value: [] },
    };
    const review = confirmGuidedCapture(proposal, confirmations);
    const file = path.resolve(output);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, stringifyYaml(review.pack), {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(`Guided crash-test pack written to ${file}`);
    console.log(JSON.stringify(review.summary, null, 2));
    return;
  }
  if (positionals[0] === "generate") {
    const input = positionals[1] ?? stringFlag(flags, "input");
    const output = stringFlag(flags, "output");
    if (!input || !output)
      throw new UsageError(
        "capture generate requires a capture path and --output <pack.yaml>",
      );
    const generated = await generateStarterPack(input, output, {
      name: stringFlag(flags, "name"),
    });
    console.log(
      `Generated ${generated.output} from ${generated.callCount} captured tool call(s).`,
    );
    for (const warning of generated.warnings)
      console.log(`Warning: ${warning}`);
    return;
  }
  if (!stringFlag(flags, "stdio"))
    throw new UsageError(`${commandName} requires --stdio "command args"`);
  const output = stringFlag(flags, "output");
  const dryRun = flags["dry-run"] === true;
  if (!output && !dryRun)
    throw new UsageError(`${commandName} requires --output <capture.json>`);
  await commandProxy(
    { ...flags, ...(output ? { capture: output } : {}) },
    true,
    dryRun,
  );
}

async function commandBridge(flags: Flags): Promise<void> {
  const inputPath = stringFlag(flags, "input");
  const maxLineBytes =
    integerFlag(flags, "max-line-bytes", true) ?? 4 * 1024 * 1024;
  const maxRecords = integerFlag(flags, "max-records", true) ?? 10_000;
  const maxInputBytes =
    integerFlag(flags, "max-input-bytes", true) ?? 32 * 1024 * 1024;
  const source = inputPath
    ? await fs.readFile(path.resolve(inputPath), "utf8")
    : await readStdin(maxInputBytes);
  const run = parseJsonl(source, {
    maxLineBytes,
    maxRecords,
    maxInputBytes,
    requireRedaction: true,
  });
  const contract = stringFlag(flags, "contract");
  if (contract) {
    const absolute = path.resolve(contract);
    const pack = (await loadPack(absolute)).pack;
    const result = evaluateJsonlRun(run, pack, {
      source: absolute,
      failOn: failOnFlag(flags),
    });
    const formats = formatsFlag(flags);
    if (formats.includes("terminal")) console.log(terminalReport(result));
    const output = path.resolve(
      stringFlag(flags, "output") ?? ".agent-crash-test/bridge",
    );
    const written = await writeReports(result, output, formats);
    if (Object.keys(written).length)
      console.log(
        `Bridge contract reports: ${Object.values(written).join(", ")}`,
      );
    if (result.executionError)
      throw new CliError(
        `${result.executionError.kind}: ${result.executionError.message}`,
        3,
      );
    if (isBlocking(result, failOnFlag(flags))) process.exitCode = 1;
    return;
  }
  const format = stringFlag(flags, "format") ?? "json";
  if (format !== "json" && format !== "markdown")
    throw new UsageError("bridge --format supports json or markdown");
  const content =
    format === "json"
      ? `${JSON.stringify(redactUnknown(run), null, 2)}\n`
      : `${jsonlMarkdown(run)}\n`;
  const output = stringFlag(flags, "output");
  if (output) {
    const file = path.resolve(output);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Bridge report written to ${file}`);
  } else process.stdout.write(content);
}

async function readStdin(maxBytes = 32 * 1024 * 1024): Promise<string> {
  const chunks: string[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const value = String(chunk);
    bytes += Buffer.byteLength(value, "utf8");
    if (bytes > maxBytes)
      throw new UsageError(`stdin exceeds the ${maxBytes}-byte limit.`);
    chunks.push(value);
  }
  return chunks.join("");
}

async function loadRunReport(filePath: string): Promise<RunResult> {
  const source = path.resolve(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(source, "utf8")) as unknown;
  } catch (error) {
    throw new UsageError(
      `Unable to read JSON report ${source}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new UsageError(`Invalid JSON report ${source}: expected an object.`);
  const report = parsed as Partial<RunResult>;
  if (!report.identity || !report.pack || !Array.isArray(report.findings))
    throw new UsageError(
      `Invalid JSON report ${source}: identity, pack, and findings are required.`,
    );
  return redactUnknown(report) as RunResult;
}

async function commandImport(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const input = positionals[0];
  const output = stringFlag(flags, "output");
  if (!input || !output)
    throw new UsageError(
      "import requires capture.json and --output <starter.yaml>",
    );
  const generated = await generateStarterPack(input, output);
  console.log(
    `Imported ${generated.source} into ${generated.output} (${generated.callCount} captured tool call(s)).`,
  );
  for (const warning of generated.warnings) console.log(`Warning: ${warning}`);
}

function findingKey(finding: RunResult["findings"][number]): string {
  return finding.fingerprint?.value ?? finding.id;
}

async function commandCompare(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const beforePath = positionals[0];
  const afterPath = positionals[1];
  if (!beforePath || !afterPath)
    throw new UsageError(
      "compare requires before-report.json and after-report.json",
    );
  const before = await loadRunReport(beforePath);
  const after = await loadRunReport(afterPath);
  const beforeMap = new Map(
    before.findings.map((finding) => [findingKey(finding), finding]),
  );
  const afterMap = new Map(
    after.findings.map((finding) => [findingKey(finding), finding]),
  );
  const comparison = {
    schemaVersion: 1,
    before: before.pack,
    after: after.pack,
    newFindings: after.findings.filter(
      (finding) => !beforeMap.has(findingKey(finding)),
    ),
    resolvedFindings: before.findings.filter(
      (finding) => !afterMap.has(findingKey(finding)),
    ),
    unchangedFindings: after.findings.filter((finding) =>
      beforeMap.has(findingKey(finding)),
    ),
  };
  const format = stringFlag(flags, "format") ?? "markdown";
  if (format === "json") console.log(JSON.stringify(comparison, null, 2));
  else if (format === "markdown") {
    console.log(
      [
        "# Agent Crash Test comparison",
        "",
        `- Before: \`${before.pack.id}\``,
        `- After: \`${after.pack.id}\``,
        `- New: ${comparison.newFindings.length}`,
        `- Resolved: ${comparison.resolvedFindings.length}`,
        `- Unchanged: ${comparison.unchangedFindings.length}`,
        "",
        "## New findings",
        "",
        ...(comparison.newFindings.length
          ? comparison.newFindings.map(
              (finding) =>
                `- **${finding.severity}** \`${finding.id}\`: ${finding.message}`,
            )
          : ["None."]),
        "",
        "## Resolved findings",
        "",
        ...(comparison.resolvedFindings.length
          ? comparison.resolvedFindings.map(
              (finding) => `- \`${finding.id}\`: ${finding.message}`,
            )
          : ["None."]),
      ].join("\n"),
    );
  } else throw new UsageError("compare --format supports json or markdown");
}

async function commandExplain(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const source = positionals[0];
  if (!source) throw new UsageError("explain requires report.json");
  const report = await loadRunReport(source);
  const format = stringFlag(flags, "format") ?? "markdown";
  if (format === "terminal") console.log(terminalReport(report));
  else if (format === "markdown") console.log(markdownReport(report));
  else if (format === "json") console.log(JSON.stringify(report, null, 2));
  else
    throw new UsageError(
      "explain --format supports terminal, markdown, or json",
    );
}

async function commandExport(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const source = positionals[0];
  if (!source) throw new UsageError("export requires report.json");
  const report = await loadRunReport(source);
  const formats = formatsFlag(flags).filter((format) => format !== "terminal");
  const output = path.resolve(
    stringFlag(flags, "output") ?? ".agent-crash-test/export",
  );
  if (!formats.length) {
    const format = stringFlag(flags, "format") ?? "markdown";
    if (format === "terminal") console.log(terminalReport(report));
    else if (format === "markdown") console.log(markdownReport(report));
    else if (format === "json") console.log(JSON.stringify(report, null, 2));
    else if (format === "junit") console.log(junitReport(report));
    else if (format === "github-summary")
      console.log(githubSummaryReport(report));
    else if (format === "sarif") console.log(sarifReport(report));
    else throw new UsageError(`Unsupported export format: ${format}`);
    return;
  }
  const written = await writeReports(report, output, formats);
  console.log(`Exported reports: ${Object.values(written).join(", ")}`);
}

function profileTypes(profile: string): string[] {
  const profiles: Record<string, string[]> = {
    resilience: [
      "timeout",
      "retryable_error",
      "malformed_result",
      "stale_result",
      "duplicate_call",
      "commit_then_response_lost",
      "disconnect_after_commit",
      "partial_success",
      "stale_read_then_conflicting_write",
      "rate_limit",
      "schema_drift",
      "truncated_response",
      "out_of_order_response",
      "corrupted_pagination_cursor",
      "slow_stream",
      "progress_stall",
    ],
    safety: ["permission_denied", "duplicate_call"],
    all: [
      "timeout",
      "retryable_error",
      "malformed_result",
      "stale_result",
      "duplicate_call",
      "permission_denied",
      "commit_then_response_lost",
      "disconnect_after_commit",
      "partial_success",
      "stale_read_then_conflicting_write",
      "rate_limit",
      "schema_drift",
      "truncated_response",
      "out_of_order_response",
      "corrupted_pagination_cursor",
      "slow_stream",
      "progress_stall",
    ],
  };
  if (!profiles[profile])
    throw new UsageError(
      `Unknown profile ${profile}. Use resilience, safety, or all.`,
    );
  return profiles[profile];
}

async function commandRun(
  positionals: string[],
  flags: Flags,
  mutate = false,
): Promise<void> {
  const target = positionals[0];
  if (!target)
    throw new UsageError(
      `${mutate ? "mutate" : "run"} requires a pack or directory`,
    );
  let files: string[];
  try {
    files = await yamlFiles(target);
  } catch (error) {
    throw new UsageError(
      `Unable to read ${target}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!files.length) throw new UsageError(`No YAML packs found at ${target}`);
  const mutationTypes = mutate
    ? profileTypes(stringFlag(flags, "profile") ?? "resilience")
    : undefined;
  if (mutate)
    console.log(
      `Mutation profile ${stringFlag(flags, "profile") ?? "resilience"}: runs only declared matching mutations; no new pack files are generated.`,
    );
  const results = await runFiles(files, flags, mutationTypes);
  const executionFailures = results.filter((result) => result.executionError);
  if (executionFailures.length) {
    const policyBlocked = executionFailures.some(
      (result) => result.executionError?.source === "probe-policy",
    );
    const summary = executionFailures
      .map(
        (result) =>
          `${result.pack.id}: ${result.executionError?.kind} — ${result.executionError?.message}`,
      )
      .join("\n");
    if (policyBlocked) throw new PolicyError(summary);
    throw new CliError(summary, 3);
  }
  const failOn = failOnFlag(flags);
  if (results.some((result) => isBlocking(result, failOn)))
    process.exitCode = 1;
}

async function commandDoctor(): Promise<void> {
  const major = Number(process.versions.node.split(".")[0]);
  let healthy = true;
  console.log(`Node.js ${process.versions.node}`);
  if (major >= 20) console.log("✓ Node.js version satisfies >=20");
  else {
    console.log("✗ Node.js 20 or newer is required");
    healthy = false;
  }
  try {
    await fs.access(path.join(packageRoot, "dist", "cli.js"));
    console.log("✓ package build is available");
  } catch {
    console.log("! package build is missing; run npm run build");
    healthy = false;
  }
  try {
    await fs.access(process.cwd(), fsConstants.R_OK | fsConstants.W_OK);
    console.log("✓ current directory is readable and writable");
  } catch {
    console.log("✗ current directory is not readable/writable");
    healthy = false;
  }
  try {
    const output = path.resolve(process.cwd(), ".agent-crash-test");
    await fs.mkdir(output, { recursive: true });
    await fs.access(output, fsConstants.R_OK | fsConstants.W_OK);
    console.log(`✓ report output directory is writable: ${output}`);
  } catch (error) {
    console.log(
      `✗ report output directory is not writable: ${error instanceof Error ? error.message : String(error)}`,
    );
    healthy = false;
  }
  try {
    console.log(`✓ pack paths resolve from ${path.resolve(process.cwd())}`);
  } catch (error) {
    console.log(
      `✗ pack path resolution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    healthy = false;
  }
  try {
    const actionPath = path.join(packageRoot, "action.yml");
    await fs.access(actionPath, fsConstants.R_OK);
    await fs.access(path.join(packageRoot, "README.md"), fsConstants.R_OK);
    const action = parseYaml(await fs.readFile(actionPath, "utf8")) as {
      inputs?: Record<string, { default?: string }>;
      runs?: { using?: string };
    };
    const formatDefault = action.inputs?.format?.default;
    const failOnDefault = action.inputs?.["fail-on"]?.default;
    if (
      action.runs?.using !== "composite" ||
      !formatDefault ||
      !["info", "notice", "warning", "error", "blocker"].includes(
        failOnDefault ?? "",
      )
    )
      throw new Error(
        "action.yml has invalid composite Action/report defaults",
      );
    formatsFlag({ format: formatDefault });
    console.log("✓ Action and report documentation are available");
    console.log(
      `✓ Action/report settings are valid (formats: ${formatDefault}; fail-on: ${failOnDefault})`,
    );
  } catch (error) {
    console.log(
      `✗ Action/report settings are unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
    healthy = false;
  }
  console.log("✓ stdio transport is available");
  console.log("✓ transparent MCP proxy and capture paths are available");
  console.log("✓ language-neutral JSONL bridge is available");
  console.log(
    "! Normal stdio mode cannot enforce host-network denial; use an external sandbox for that boundary.",
  );
  console.log(
    "! External sandbox status is not detectable or enforceable by this process.",
  );
  console.log(`Platform: ${process.platform}/${process.arch}`);
  if (!healthy) process.exitCode = 2;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parseArgs(rest);
  if (!command || command === "help" || command === "--help") {
    console.log(usage);
    return;
  }
  if (command === "demo") return commandDemo();
  if (command === "init") return commandInit(positionals, flags);
  if (command === "discover") return commandDiscover(flags);
  if (command === "proxy") return commandProxy(flags);
  if (command === "test") return commandTest(positionals, flags);
  if (command === "wrap") return commandWrap(positionals, flags);
  if (command === "ui") return commandUi(positionals, flags);
  if (command === "http-proxy") return commandHttpProxy(flags);
  if (command === "hosted") return commandHosted(positionals, flags);
  if (command === "capture") return commandCapture(positionals, flags);
  if (command === "record") return commandCapture(positionals, flags, "record");
  if (command === "bridge") return commandBridge(flags);
  if (command === "import") return commandImport(positionals, flags);
  if (command === "compare") return commandCompare(positionals, flags);
  if (command === "explain") return commandExplain(positionals, flags);
  if (command === "export") return commandExport(positionals, flags);
  if (command === "run") return commandRun(positionals, flags);
  if (command === "mutate") return commandRun(positionals, flags, true);
  if (command === "doctor") return commandDoctor();
  throw new UsageError(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof CliError ? error.exitCode : 10;
});
