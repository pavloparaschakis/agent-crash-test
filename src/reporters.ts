import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redactUnknown } from "./redaction.js";
import { renderHtmlReport } from "./html-reporter.js";
import type { Finding, RunResult } from "./types.js";

function sanitized(result: RunResult): RunResult {
  const redacted = redactUnknown(result) as RunResult;
  if (safeJson(result) !== safeJson(redacted)) {
    redacted.executionWarnings = [
      ...redacted.executionWarnings,
      "Sensitive or secret-shaped values were redacted before report rendering.",
    ];
  }
  return redacted;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[UNSERIALIZABLE: ${String(error)}]`;
  }
}

function symbol(finding: Finding): string {
  return finding.severity === "blocker" || finding.severity === "error"
    ? "✗"
    : "!";
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function markdownCell(value: unknown): string {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function timeline(result: RunResult): string[] {
  return result.events.map((event) => {
    const mutation = event.mutationIds.length
      ? ` mutation=${event.mutationIds.join(",")}`
      : "";
    const parent = event.parentEventId ? ` parent=${event.parentEventId}` : "";
    const status = event.error
      ? `${event.error.kind}: ${event.error.message}`
      : "SUCCESS";
    return `  ${event.sequence}. ${event.eventId} ${event.kind} ${event.tool} attempt=${event.attempt}${mutation}${parent} ${status}`;
  });
}

function findingLines(finding: Finding): string[] {
  const lines = [
    `${symbol(finding)} ${finding.severity.toUpperCase()} ${finding.id}`,
    `  ${finding.message}`,
  ];
  if (finding.category && finding.category !== "assertion_failure")
    lines.push(`  Category: ${finding.category}`);
  if (finding.effectId) lines.push(`  Effect: ${finding.effectId}`);
  if (finding.expected !== undefined || finding.observed !== undefined)
    lines.push(
      `  Expected: ${json(finding.expected)}`,
      `  Observed: ${json(finding.observed)}`,
    );
  if (finding.evidenceEventIds.length)
    lines.push(`  Evidence events: ${finding.evidenceEventIds.join(", ")}`);
  if (finding.firstDivergentEventId)
    lines.push(`  First divergence: ${finding.firstDivergentEventId}`);
  if (finding.reproduction.mutationIds?.length)
    lines.push(`  Mutations: ${finding.reproduction.mutationIds.join(", ")}`);
  if (finding.reproduction.seed !== undefined)
    lines.push(`  Seed: ${finding.reproduction.seed}`);
  if (finding.reproduction.command)
    lines.push(`  Reproduce: ${finding.reproduction.command}`);
  if (finding.whyItMatters) lines.push(`  Why: ${finding.whyItMatters}`);
  if (finding.remediation) lines.push(`  Fix: ${finding.remediation}`);
  if (finding.fingerprint)
    lines.push(`  Fingerprint: ${finding.fingerprint.value}`);
  return lines;
}

export function terminalReport(input: RunResult): string {
  const result = sanitized(input);
  const passed = result.assertions.filter(
    (assertion) => assertion.passed,
  ).length;
  const failed = result.assertions.length - passed;
  const lines = [
    `Agent Crash Test 0.1.0`,
    `Pack: ${result.pack.name} (${result.pack.id})`,
    `Run: ${result.identity.runId} | Report schema: ${result.schemaVersion}`,
    `Transport: ${result.transport} | Determinism: ${result.identity.determinism}`,
    `Adapter: ${result.adapter ? `${result.adapter.id}@${result.adapter.version}` : "legacy-report"}`,
    `Assertions: ${result.assertions.length}  Passed: ${passed}  Failed: ${failed}`,
    `Mutations: ${result.mutations.filter((mutation) => mutation.result === "applied").length} applied / ${result.mutations.length} declared`,
    `Process closed: ${result.policy.processClosed ? "yes" : "unknown"}`,
  ];
  const nonAppliedMutations = result.mutations.filter(
    (mutation) => mutation.result !== "applied",
  );
  if (nonAppliedMutations.length) {
    lines.push(
      "",
      "Mutation outcomes:",
      ...nonAppliedMutations.map(
        (mutation) =>
          `  ${mutation.id}: ${mutation.result}${mutation.parameters.reason ? ` (${mutation.parameters.reason})` : ""}`,
      ),
    );
  }
  if (result.executionError)
    lines.push(
      `EXECUTION ${result.executionError.kind.toUpperCase()}: ${result.executionError.message}`,
    );
  lines.push(
    "",
    "Timeline:",
    ...(result.events.length ? timeline(result) : ["  (no events recorded)"]),
    "",
    "Effects:",
  );
  if (result.effects.length) {
    for (const effect of result.effects)
      lines.push(
        `  ${effect.id}: status=${effect.observerStatus ?? "unknown"} expected=${json(effect.expected ?? (effect.expectedDelta !== undefined ? { delta: effect.expectedDelta } : undefined))} observed=${json(effect.observed ?? effect.value)}${effect.before !== undefined || effect.after !== undefined ? ` before=${json(effect.before)} after=${json(effect.after)}` : ""}${effect.error ? ` error=${effect.error.kind}: ${effect.error.message}` : ""}`,
      );
  } else lines.push("  (no effects recorded)");
  for (const warning of result.executionWarnings)
    lines.push(`! WARNING: ${warning}`);
  if (result.findings[0]?.firstDivergentEventId)
    lines.push(`First divergence: ${result.findings[0].firstDivergentEventId}`);
  if (result.reproduction.command)
    lines.push(`Reproduce: ${result.reproduction.command}`);
  for (const finding of result.findings) lines.push(...findingLines(finding));
  if (result.findings.length === 0 && !result.executionError)
    lines.push("", "All assertions passed.");
  return lines.join("\n");
}

export function markdownReport(input: RunResult): string {
  const result = sanitized(input);
  const passed = result.assertions.filter(
    (assertion) => assertion.passed,
  ).length;
  const lines = [
    `# Agent Crash Test: ${result.pack.name}`,
    "",
    `- Pack: \`${result.pack.id}\``,
    `- Transport: \`${result.transport}\``,
    `- Assertions: ${passed}/${result.assertions.length} passed`,
    `- Status: ${isBlocking(result, result.policy.failOn) ? "FAIL" : "PASS"}`,
    `- Determinism: \`${result.identity.determinism}\``,
    `- Adapter: \`${result.adapter ? `${result.adapter.id}@${result.adapter.version}` : "legacy-report"}\``,
    `- Report schema: \`${result.schemaVersion}\``,
    `- Pack SHA-256: \`${result.identity.packSha256}\``,
    `- Manifest SHA-256: \`${result.identity.serverManifestSha256 ?? "—"}\``,
    `- Reproduction: \`${result.reproduction.command}\``,
    "",
    "## Execution",
    "",
    result.executionError
      ? `**Execution error:** \`${result.executionError.kind}\` — ${result.executionError.message}`
      : "Execution completed.",
    "",
    "## Mutations",
    "",
    result.mutations.length
      ? "| ID | Type | Result | Requested | Applied | Details |\n|---|---|---|---|---|---|"
      : "No mutations declared.",
    ...result.mutations.map(
      (mutation) =>
        `| \`${markdownCell(mutation.id)}\` | \`${markdownCell(mutation.type)}\` | ${markdownCell(mutation.result)} | ${markdownCell(mutation.requestedAtEvent)} | ${markdownCell(mutation.appliedAtEvent)} | ${markdownCell(json(mutation.parameters))} |`,
    ),
    "",
    "## Timeline",
    "",
    "```text",
    ...(result.events.length ? timeline(result) : ["(no events recorded)"]),
    "```",
    "",
    "<details><summary>Detailed event evidence</summary>",
    "",
    "```json",
    JSON.stringify(result.events, null, 2),
    "```",
    "",
    "</details>",
    "",
    "## Effects",
    "",
    "| Effect | Status | Expected | Observed | Before | After | Safety |",
    "|---|---|---|---|---|---|---|",
    ...result.effects.map(
      (effect) =>
        `| ${markdownCell(effect.id)} | ${markdownCell(effect.observerStatus)} | ${markdownCell(json(effect.expected ?? (effect.expectedDelta !== undefined ? { delta: effect.expectedDelta } : undefined)))} | ${markdownCell(json(effect.observed ?? effect.value))}${effect.error ? ` (${markdownCell(effect.error.kind)})` : ""} | ${markdownCell(json(effect.before))} | ${markdownCell(json(effect.after))} | ${markdownCell(effect.safety)} |`,
    ),
    "",
    "## Findings",
    "",
  ];
  if (result.findings.length === 0 && !result.executionError)
    lines.push("All assertions passed.");
  for (const finding of result.findings) {
    lines.push(
      `### ${finding.severity.toUpperCase()}: ${finding.id}`,
      "",
      finding.message,
      "",
    );
    if (finding.category && finding.category !== "assertion_failure")
      lines.push(`**Category:** \`${finding.category}\``, "");
    if (finding.effectId) lines.push(`**Effect:** \`${finding.effectId}\``, "");
    if (finding.whyItMatters)
      lines.push(`**Why it matters:** ${finding.whyItMatters}`, "");
    if (finding.expected !== undefined || finding.observed !== undefined)
      lines.push(
        `**Expected:** \`${json(finding.expected)}\`  `,
        `**Observed:** \`${json(finding.observed)}\``,
        "",
      );
    if (finding.evidenceEventIds.length)
      lines.push(
        `**Evidence events:** ${finding.evidenceEventIds.map((id) => `\`${id}\``).join(", ")}`,
        "",
      );
    if (finding.firstDivergentEventId)
      lines.push(
        `**First divergence:** \`${finding.firstDivergentEventId}\``,
        "",
      );
    if (finding.reproduction.mutationIds?.length)
      lines.push(
        `**Mutations:** ${finding.reproduction.mutationIds.map((id) => `\`${id}\``).join(", ")}`,
        "",
      );
    if (finding.reproduction.seed !== undefined)
      lines.push(`**Seed:** \`${finding.reproduction.seed}\``, "");
    lines.push(`**Reproduce:** \`${finding.reproduction.command}\``, "");
    if (finding.remediation)
      lines.push(`**Remediation:** ${finding.remediation}`, "");
    if (finding.fingerprint)
      lines.push(`**Fingerprint:** \`${finding.fingerprint.value}\``, "");
    if (finding.evidence !== undefined)
      lines.push(
        "<details><summary>Evidence</summary>",
        "",
        "```json",
        JSON.stringify(finding.evidence, null, 2),
        "```",
        "",
        "</details>",
        "",
      );
  }
  if (result.executionWarnings.length)
    lines.push(
      "## Execution warnings",
      "",
      ...result.executionWarnings.map((warning) => `- ${warning}`),
    );
  return lines.join("\n");
}

export function githubSummaryReport(input: RunResult): string {
  const result = sanitized(input);
  const status = isBlocking(result, result.policy.failOn) ? "FAIL" : "PASS";
  const passed = result.assertions.filter(
    (assertion) => assertion.passed,
  ).length;
  const first = result.findings.find(
    (finding) => finding.firstDivergentEventId,
  );
  const lines = [
    `## Agent Crash Test: ${status}`,
    "",
    `**${result.pack.name}** (\`${result.pack.id}\`) — ${passed}/${result.assertions.length} assertions passed`,
    "",
    `- Transport: \`${result.transport}\``,
    `- Mutations applied: ${result.mutations.filter((mutation) => mutation.result === "applied").length}`,
    `- Physical events: ${result.events.filter((event) => event.physicalCall).length}`,
    `- Determinism: \`${result.identity.determinism}\``,
    `- Adapter: \`${result.adapter ? `${result.adapter.id}@${result.adapter.version}` : "legacy-report"}\``,
  ];
  if (first?.firstDivergentEventId)
    lines.push(`- First divergence: \`${first.firstDivergentEventId}\``);
  if (result.executionError)
    lines.push(
      `- Execution error: \`${result.executionError.kind}\` — ${result.executionError.message}`,
    );
  lines.push("", "### Findings", "");
  if (result.findings.length === 0) lines.push("No blocking findings.");
  else {
    for (const finding of result.findings.slice(0, 10)) {
      lines.push(
        `- **${finding.severity.toUpperCase()}** \`${finding.id}\`: ${finding.message}`,
      );
      if (finding.remediation) lines.push(`  - Fix: ${finding.remediation}`);
      if (finding.fingerprint)
        lines.push(`  - Fingerprint: \`${finding.fingerprint.value}\``);
    }
    if (result.findings.length > 10)
      lines.push(
        `- …and ${result.findings.length - 10} more; see the artifact.`,
      );
  }
  lines.push("", `**Reproduce:** \`${result.reproduction.command}\``);
  return lines.join("\n");
}

export function junitReport(input: RunResult): string {
  const result = sanitized(input);
  const started = Date.parse(result.identity.startedAt);
  const completed = result.identity.completedAt
    ? Date.parse(result.identity.completedAt)
    : started;
  const durationSeconds =
    Number.isFinite(started) && Number.isFinite(completed)
      ? Math.max(0, (completed - started) / 1000)
      : 0;
  const cases = result.assertions.length
    ? result.assertions.map((assertion) => {
        const finding = assertion.finding;
        const body = finding
          ? `<failure message="${xml(finding.message)}"><![CDATA[${xml(JSON.stringify(finding.evidence ?? {}))}]]></failure>`
          : "";
        return `<testcase classname="${xml(result.pack.id)}" name="${xml(assertion.id)}" time="${durationSeconds.toFixed(3)}">${body}</testcase>`;
      })
    : [
        `<testcase classname="${xml(result.pack.id)}" name="execution" time="${durationSeconds.toFixed(3)}"><failure message="${xml(result.executionError?.message ?? "Execution failed")}" /></testcase>`,
      ];
  const failures =
    result.assertions.filter((assertion) => !assertion.passed).length +
    (result.executionError ? 1 : 0);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${xml(result.pack.name)}" tests="${cases.length}" failures="${failures}" time="${durationSeconds.toFixed(3)}">`,
    ...cases,
    "</testsuite>",
  ].join("\n");
}

export function sarifReport(input: RunResult): string {
  const result = sanitized(input);
  const findings = [...result.findings];
  if (result.executionError)
    findings.push({
      id: "execution-error",
      severity: "error",
      status: "failed",
      category: "probe_error",
      message: result.executionError.message,
      evidenceEventIds: [],
      reproduction: result.reproduction,
      redactionApplied: true,
    });
  const level = (
    severity: Finding["severity"],
  ): "error" | "warning" | "note" =>
    severity === "blocker" || severity === "error"
      ? "error"
      : severity === "warning"
        ? "warning"
        : "note";
  return `${JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "agent-crash-test",
              version: result.identity.runnerVersion,
              rules: findings.map((finding) => ({
                id: finding.id,
                shortDescription: { text: finding.message.slice(0, 160) },
                defaultConfiguration: { level: level(finding.severity) },
              })),
            },
          },
          results: findings.map((finding) => ({
            ruleId: finding.id,
            level: level(finding.severity),
            message: { text: finding.message },
            partialFingerprints: finding.fingerprint
              ? { primaryLocationLineHash: finding.fingerprint.value }
              : undefined,
            properties: {
              category: finding.category,
              effectId: finding.effectId,
              firstDivergentEventId: finding.firstDivergentEventId,
              remediation: finding.remediation,
              reproduction: finding.reproduction.command,
            },
          })),
        },
      ],
    },
    null,
    2,
  )}\n`;
}

export async function writeReports(
  result: RunResult,
  outputDir: string,
  formats: string[],
): Promise<Record<string, string>> {
  await fs.mkdir(outputDir, { recursive: true });
  const suffix = result.identity.packSha256.slice(0, 12);
  const base = `${result.pack.id.replace(/[^a-z0-9_-]+/gi, "-")}-${suffix}`;
  const written: Record<string, string> = {};
  for (const format of formats) {
    if (format === "terminal") continue;
    if (
      ![
        "markdown",
        "json",
        "junit",
        "github-summary",
        "sarif",
        "html",
      ].includes(format)
    )
      throw new Error(`Unsupported report format: ${format}`);
    const extension =
      format === "markdown"
        ? "md"
        : format === "html"
          ? "html"
          : format === "github-summary"
            ? "summary.md"
            : format === "junit"
              ? "xml"
              : format === "sarif"
                ? "sarif.json"
                : "json";
    const file = path.join(outputDir, `${base}.${extension}`);
    const content =
      format === "markdown"
        ? markdownReport(result)
        : format === "html"
          ? renderHtmlReport(result)
          : format === "github-summary"
            ? githubSummaryReport(result)
            : format === "junit"
              ? junitReport(result)
              : format === "sarif"
                ? sarifReport(result)
                : JSON.stringify(sanitized(result), null, 2);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, file);
    written[format] = file;
  }
  return written;
}

export function isBlocking(result: RunResult, failOn: string): boolean {
  if (result.executionError) return true;
  const ranking: Record<string, number> = {
    info: 0,
    notice: 1,
    warning: 2,
    error: 3,
    blocker: 4,
  };
  if (!(failOn in ranking))
    throw new Error(`Unknown fail-on severity: ${failOn}`);
  const threshold = ranking[failOn]!;
  return result.findings.some(
    (finding) => ranking[finding.severity]! >= threshold,
  );
}
