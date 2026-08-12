import { redactUnknown } from "./redaction.js";
import type {
  CallEvent,
  EffectValue,
  Finding,
  RunResult,
  Severity,
} from "./types.js";

export interface HtmlReportOptions {
  title?: string;
  generatedAt?: string;
}

const SEVERITIES: Severity[] = [
  "blocker",
  "error",
  "warning",
  "notice",
  "info",
];

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  notice: 1,
  warning: 2,
  error: 3,
  blocker: 4,
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value: unknown, spacing = 2): string {
  try {
    return JSON.stringify(value ?? null, null, spacing);
  } catch (error) {
    return JSON.stringify(`[UNSERIALIZABLE: ${String(error)}]`);
  }
}

function sanitize(input: RunResult): {
  result: RunResult;
  rendererRedacted: boolean;
} {
  const before = safeJson(input, 0);
  const result = redactUnknown(input) as RunResult;
  return { result, rendererRedacted: before !== safeJson(result, 0) };
}

function displayJson(value: unknown): string {
  return escapeHtml(safeJson(value));
}

function renderValue(value: unknown, empty = "Not recorded"): string {
  if (value === undefined)
    return `<span class="empty-value">${escapeHtml(empty)}</span>`;
  return `<pre>${displayJson(value)}</pre>`;
}

function isBlocking(result: RunResult): boolean {
  if (result.executionError) return true;
  const threshold = SEVERITY_RANK[result.policy.failOn];
  return result.findings.some(
    (finding) => SEVERITY_RANK[finding.severity] >= threshold,
  );
}

function eventStatus(event: CallEvent): string {
  if (event.error) return event.error.kind;
  if (event.responseStatus) return event.responseStatus;
  return "success";
}

function eventSeverity(event: CallEvent): Severity {
  if (event.error) return "error";
  if (event.mutationIds.length) return "warning";
  return "info";
}

function effectSeverity(effect: EffectValue): Severity {
  if (effect.error || effect.observerStatus === "forbidden") return "error";
  if (
    effect.observerStatus === "changed" ||
    effect.observerStatus === "inconclusive"
  )
    return "warning";
  return "info";
}

function renderTimelineEvent(event: CallEvent): string {
  const severity = eventSeverity(event);
  const mutations = event.mutationIds.length
    ? `<span class="tag mutation">${escapeHtml(event.mutationIds.join(", "))}</span>`
    : "";
  const parent = event.parentEventId
    ? `<span>Parent <code>${escapeHtml(event.parentEventId)}</code></span>`
    : "";

  return `<article class="timeline-event filter-row" data-filter-row data-kind="event" data-severity="${severity}">
    <div class="timeline-marker" aria-hidden="true"></div>
    <div class="timeline-card">
      <div class="row-heading">
        <div>
          <span class="sequence">${event.sequence.toString().padStart(2, "0")}</span>
          <strong>${escapeHtml(event.tool)}</strong>
          <span class="tag">${escapeHtml(event.kind)}</span>
          ${mutations}
        </div>
        <span class="status status-${severity}">${escapeHtml(eventStatus(event))}</span>
      </div>
      <div class="metadata">
        <span><code>${escapeHtml(event.eventId)}</code></span>
        <span>Attempt ${event.attempt}</span>
        <span>${event.durationMs} ms</span>
        <span>${event.physicalCall ? "Physical call" : "Logical event"}</span>
        ${parent}
      </div>
      <details>
        <summary>Event evidence</summary>
        <div class="evidence-grid">
          <section><h4>Arguments</h4>${renderValue(event.arguments)}</section>
          <section><h4>Client output</h4>${renderValue(event.output)}</section>
          <section><h4>Underlying output</h4>${renderValue(event.underlyingOutput)}</section>
          <section><h4>Error</h4>${renderValue(event.error)}</section>
        </div>
      </details>
    </div>
  </article>`;
}

function renderEffect(effect: EffectValue): string {
  const severity = effectSeverity(effect);
  const expected =
    effect.expected !== undefined
      ? effect.expected
      : effect.expectedDelta !== undefined
        ? { delta: effect.expectedDelta }
        : undefined;
  const observed = effect.observed ?? effect.value;

  return `<article class="effect-card filter-row" data-filter-row data-kind="effect" data-severity="${severity}">
    <div class="row-heading">
      <div><strong>${escapeHtml(effect.id)}</strong> <code>${escapeHtml(effect.path)}</code></div>
      <span class="status status-${severity}">${escapeHtml(effect.observerStatus ?? "unknown")}</span>
    </div>
    <div class="metadata">
      <span>${escapeHtml(effect.source)}</span>
      <span>${escapeHtml(effect.safety)}</span>
      ${effect.tool ? `<span>Tool <code>${escapeHtml(effect.tool)}</code></span>` : ""}
    </div>
    <div class="diff-grid">
      <section class="before"><h4>Before</h4>${renderValue(effect.before)}</section>
      <section class="after"><h4>After</h4>${renderValue(effect.after)}</section>
      <section><h4>Expected</h4>${renderValue(expected)}</section>
      <section><h4>Observed</h4>${renderValue(observed)}</section>
    </div>
    ${effect.error ? `<div class="inline-error"><strong>Probe error:</strong> ${escapeHtml(effect.error.kind)} — ${escapeHtml(effect.error.message)}</div>` : ""}
  </article>`;
}

function renderFinding(finding: Finding): string {
  const metadata = [
    finding.category,
    finding.effectId ? `Effect ${finding.effectId}` : undefined,
    finding.firstDivergentEventId
      ? `First divergence ${finding.firstDivergentEventId}`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  return `<article class="finding severity-${finding.severity} filter-row" data-filter-row data-kind="finding" data-severity="${finding.severity}">
    <div class="row-heading">
      <div>
        <span class="severity-label">${escapeHtml(finding.severity)}</span>
        <strong>${escapeHtml(finding.id)}</strong>
      </div>
      <span class="finding-status">${escapeHtml(finding.status)}</span>
    </div>
    <p class="finding-message">${escapeHtml(finding.message)}</p>
    ${metadata.length ? `<div class="metadata">${metadata.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
    ${finding.whyItMatters ? `<p><strong>Why it matters.</strong> ${escapeHtml(finding.whyItMatters)}</p>` : ""}
    <div class="comparison-grid">
      <section><h4>Expected</h4>${renderValue(finding.expected)}</section>
      <section><h4>Observed</h4>${renderValue(finding.observed)}</section>
    </div>
    ${finding.remediation ? `<div class="remediation"><strong>Suggested remediation</strong><p>${escapeHtml(finding.remediation)}</p></div>` : ""}
    <details>
      <summary>Evidence and reproduction</summary>
      <div class="evidence-grid">
        <section><h4>Evidence</h4>${renderValue(finding.evidence)}</section>
        <section><h4>Event IDs</h4>${renderValue(finding.evidenceEventIds)}</section>
      </div>
      <p class="command"><code>${escapeHtml(finding.reproduction.command)}</code></p>
    </details>
  </article>`;
}

function renderFilterControls(): string {
  return `<form class="filters" aria-label="Report filters" onsubmit="return false">
    <label class="search-label" for="report-search">Filter evidence</label>
    <input id="report-search" type="search" placeholder="Tool, effect, event, finding…" autocomplete="off" spellcheck="false">
    <fieldset>
      <legend>Finding severity</legend>
      ${SEVERITIES.map(
        (severity) =>
          `<label><input type="checkbox" data-severity-toggle value="${severity}" checked> ${severity}</label>`,
      ).join("")}
    </fieldset>
    <button type="button" id="clear-filters">Reset</button>
    <output id="filter-count" aria-live="polite"></output>
  </form>`;
}

const REPORT_SCRIPT = `(() => {
  "use strict";
  const search = document.getElementById("report-search");
  const reset = document.getElementById("clear-filters");
  const count = document.getElementById("filter-count");
  const toggles = Array.from(document.querySelectorAll("[data-severity-toggle]"));
  const rows = Array.from(document.querySelectorAll("[data-filter-row]"));
  const emptyStates = Array.from(document.querySelectorAll("[data-filter-empty]"));

  function applyFilters() {
    const query = search.value.trim().toLocaleLowerCase();
    const severities = new Set(toggles.filter((item) => item.checked).map((item) => item.value));
    let visible = 0;
    rows.forEach((row) => {
      const matchesText = !query || (row.textContent || "").toLocaleLowerCase().includes(query);
      const matchesSeverity = row.dataset.kind !== "finding" || severities.has(row.dataset.severity);
      row.hidden = !(matchesText && matchesSeverity);
      if (!row.hidden) visible += 1;
    });
    emptyStates.forEach((empty) => {
      const section = empty.closest("section");
      const sectionRows = section ? Array.from(section.querySelectorAll("[data-filter-row]")) : [];
      empty.hidden = sectionRows.some((row) => !row.hidden);
    });
    count.textContent = visible + " of " + rows.length + " records shown";
  }

  search.addEventListener("input", applyFilters);
  toggles.forEach((toggle) => toggle.addEventListener("change", applyFilters));
  reset.addEventListener("click", () => {
    search.value = "";
    toggles.forEach((toggle) => { toggle.checked = true; });
    applyFilters();
    search.focus();
  });
  applyFilters();
})();`;

const REPORT_STYLE = `
:root {
  color-scheme: dark;
  --ink: #ece9de;
  --muted: #98978f;
  --panel: #171a1c;
  --panel-raised: #1e2224;
  --line: #343a3c;
  --paper: #0e1112;
  --acid: #d9ff43;
  --error: #ff6b55;
  --warning: #ffc857;
  --notice: #63d6d1;
  --info: #95a2aa;
  --success: #78df9a;
  font-family: "IBM Plex Mono", "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
}
* { box-sizing: border-box; }
html { background: var(--paper); scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--ink);
  background:
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
    var(--paper);
  background-size: 24px 24px;
  line-height: 1.55;
}
a { color: var(--acid); }
code, pre { font: inherit; }
code { color: #d4e6e4; overflow-wrap: anywhere; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: .78rem; }
button, input { font: inherit; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--acid); outline-offset: 3px; }
[hidden] { display: none !important; }
.shell { width: min(1220px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 96px; }
.masthead { border-top: 5px solid var(--acid); padding-top: 22px; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; }
.eyebrow { color: var(--acid); text-transform: uppercase; letter-spacing: .16em; font-size: .72rem; }
h1, h2, h3, h4, p { margin-top: 0; }
h1 { margin-bottom: 6px; font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-size: clamp(2.6rem, 7vw, 6.4rem); font-weight: 500; line-height: .88; letter-spacing: -.055em; }
h2 { font: 500 clamp(1.7rem, 4vw, 3.4rem)/1 "Iowan Old Style", "Palatino Linotype", Georgia, serif; letter-spacing: -.035em; }
h4 { margin-bottom: 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .11em; font-size: .66rem; }
.run-id { color: var(--muted); font-size: .78rem; }
.verdict { min-width: 170px; padding: 18px 22px; border: 1px solid currentColor; text-align: center; font-size: 1.8rem; font-weight: 800; letter-spacing: .16em; transform: rotate(-1deg); }
.verdict-pass { color: var(--success); }
.verdict-fail { color: var(--error); }
.summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; margin: 42px 0; background: var(--line); border: 1px solid var(--line); }
.metric { min-height: 118px; padding: 18px; background: var(--panel); }
.metric strong { display: block; margin-top: 12px; font: 500 2rem/1 "Iowan Old Style", Georgia, serif; }
.metric span { color: var(--muted); font-size: .68rem; text-transform: uppercase; letter-spacing: .11em; }
.filters { position: sticky; z-index: 4; top: 10px; display: grid; grid-template-columns: minmax(180px, 1fr) 2fr auto auto; gap: 12px; align-items: center; margin: 30px 0 58px; padding: 14px; border: 1px solid var(--line); background: rgba(23,26,28,.94); backdrop-filter: blur(16px); box-shadow: 0 16px 40px rgba(0,0,0,.28); }
.search-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.filters input[type="search"] { width: 100%; padding: 10px 12px; color: var(--ink); border: 1px solid var(--line); background: #0c0f10; }
.filters fieldset { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0; padding: 0; border: 0; }
.filters legend { position: absolute; width: 1px; height: 1px; overflow: hidden; }
.filters label { color: var(--muted); font-size: .72rem; text-transform: uppercase; }
.filters button { padding: 9px 14px; color: var(--paper); border: 0; background: var(--acid); cursor: pointer; font-weight: 700; }
.filters output { color: var(--muted); font-size: .7rem; white-space: nowrap; }
.section { margin-top: 76px; scroll-margin-top: 110px; }
.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: baseline; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.section-heading span { color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; }
.timeline { position: relative; margin-top: 28px; }
.timeline::before { content: ""; position: absolute; top: 8px; bottom: 8px; left: 13px; width: 1px; background: var(--line); }
.timeline-event { position: relative; display: grid; grid-template-columns: 28px 1fr; gap: 18px; margin: 0 0 18px; }
.timeline-marker { z-index: 1; width: 11px; height: 11px; margin: 21px 0 0 8px; border: 2px solid var(--acid); border-radius: 50%; background: var(--paper); }
.timeline-card, .effect-card, .finding { padding: 20px; border: 1px solid var(--line); background: var(--panel); box-shadow: 8px 8px 0 rgba(0,0,0,.16); }
.row-heading { display: flex; justify-content: space-between; gap: 18px; align-items: start; }
.sequence { display: inline-block; min-width: 32px; color: var(--muted); }
.tag, .status, .severity-label, .finding-status { display: inline-block; margin-left: 7px; padding: 3px 7px; border: 1px solid var(--line); color: var(--muted); font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; }
.tag.mutation { color: var(--warning); border-color: color-mix(in srgb, var(--warning), transparent 50%); }
.status-error, .severity-blocker .severity-label, .severity-error .severity-label { color: var(--error); }
.status-warning, .severity-warning .severity-label { color: var(--warning); }
.status-info, .severity-info .severity-label { color: var(--info); }
.severity-notice .severity-label { color: var(--notice); }
.metadata { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; color: var(--muted); font-size: .7rem; }
details { margin-top: 17px; border-top: 1px dashed var(--line); padding-top: 12px; }
summary { width: fit-content; color: var(--acid); cursor: pointer; font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; }
.evidence-grid, .comparison-grid, .diff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin-top: 14px; background: var(--line); border: 1px solid var(--line); }
.evidence-grid section, .comparison-grid section, .diff-grid section { min-width: 0; padding: 14px; background: #111415; }
.effect-card, .finding { margin-top: 16px; }
.before { box-shadow: inset 3px 0 var(--warning); }
.after { box-shadow: inset 3px 0 var(--notice); }
.finding { border-left-width: 5px; }
.severity-blocker, .severity-error { border-left-color: var(--error); }
.severity-warning { border-left-color: var(--warning); }
.severity-notice { border-left-color: var(--notice); }
.severity-info { border-left-color: var(--info); }
.finding-message { max-width: 78ch; margin: 18px 0; font-family: "Iowan Old Style", Georgia, serif; font-size: 1.2rem; }
.remediation { margin-top: 16px; padding: 14px 16px; border-left: 3px solid var(--acid); background: rgba(217,255,67,.055); }
.remediation p { margin: 5px 0 0; }
.inline-error { margin-top: 14px; padding: 12px; color: var(--error); background: rgba(255,107,85,.06); }
.command { margin: 14px 0 0; padding: 12px; border: 1px solid var(--line); background: #090b0c; }
.warning-strip { margin: 12px 0; padding: 12px 15px; border-left: 3px solid var(--warning); background: rgba(255,200,87,.07); }
.empty-state { padding: 32px; color: var(--muted); border: 1px dashed var(--line); text-align: center; }
.empty-value { color: #6f7475; font-style: italic; }
.report-footer { margin-top: 80px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: .72rem; }
@media (max-width: 900px) {
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .filters { position: static; grid-template-columns: 1fr; }
  .masthead { grid-template-columns: 1fr; }
  .verdict { width: fit-content; }
}
@media (max-width: 620px) {
  .shell { width: min(100% - 20px, 1220px); padding-top: 24px; }
  .summary-grid, .evidence-grid, .comparison-grid, .diff-grid { grid-template-columns: 1fr; }
  .row-heading { display: block; }
  .status, .finding-status { margin: 10px 0 0; }
}
@media print {
  :root { color-scheme: light; --ink: #111; --muted: #555; --panel: #fff; --panel-raised: #fff; --line: #aaa; --paper: #fff; }
  .shell { width: 100%; padding: 0; }
  .filters { display: none; }
  .timeline-card, .effect-card, .finding { break-inside: avoid; box-shadow: none; }
  details { display: block; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;

/**
 * Render a complete offline HTML report. The input is defensively redacted and
 * every dynamic value is HTML-escaped; no report value is interpolated into
 * executable JavaScript.
 */
export function renderHtmlReport(
  input: RunResult,
  options: HtmlReportOptions = {},
): string {
  const { result, rendererRedacted } = sanitize(input);
  const blocking = isBlocking(result);
  const passed = result.assertions.filter(
    (assertion) => assertion.passed,
  ).length;
  const appliedMutations = result.mutations.filter(
    (mutation) => mutation.result === "applied",
  ).length;
  const title = options.title ?? `Agent Crash Test — ${result.pack.name}`;
  const generatedAt = options.generatedAt ?? result.identity.completedAt;
  const warnings = [
    ...(rendererRedacted
      ? ["Secret-shaped values were redacted again during HTML rendering."]
      : []),
    ...result.executionWarnings,
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_STYLE}</style>
</head>
<body>
  <main class="shell">
    <header class="masthead">
      <div>
        <div class="eyebrow">Agent Crash Test / Flight Recorder</div>
        <h1>${escapeHtml(result.pack.name)}</h1>
        <div class="run-id">Run <code>${escapeHtml(result.identity.runId)}</code> · ${escapeHtml(result.pack.id)}</div>
      </div>
      <div class="verdict verdict-${blocking ? "fail" : "pass"}" aria-label="Run verdict ${blocking ? "fail" : "pass"}">${blocking ? "FAIL" : "PASS"}</div>
    </header>

    <section class="summary-grid" aria-label="Run summary">
      <div class="metric"><span>Assertions passed</span><strong>${passed}/${result.assertions.length}</strong></div>
      <div class="metric"><span>Findings</span><strong>${result.findings.length}</strong></div>
      <div class="metric"><span>Events</span><strong>${result.events.length}</strong></div>
      <div class="metric"><span>Mutations applied</span><strong>${appliedMutations}/${result.mutations.length}</strong></div>
      <div class="metric"><span>Determinism</span><strong>${escapeHtml(result.identity.determinism)}</strong></div>
    </section>

    ${warnings.map((warning) => `<div class="warning-strip"><strong>Warning:</strong> ${escapeHtml(warning)}</div>`).join("\n")}
    ${result.executionError ? `<div class="warning-strip"><strong>Execution ${escapeHtml(result.executionError.kind)}:</strong> ${escapeHtml(result.executionError.message)}</div>` : ""}

    ${renderFilterControls()}

    <section class="section" id="findings">
      <div class="section-heading"><h2>Findings</h2><span>${result.findings.length} recorded</span></div>
      ${result.findings.map(renderFinding).join("\n")}
      <p class="empty-state" data-filter-empty${result.findings.length ? " hidden" : ""}>No findings match the current filters.</p>
    </section>

    <section class="section" id="state-diff">
      <div class="section-heading"><h2>State diff</h2><span>${result.effects.length} observed effects</span></div>
      ${result.effects.map(renderEffect).join("\n")}
      <p class="empty-state" data-filter-empty${result.effects.length ? " hidden" : ""}>No state observations match the current filters.</p>
    </section>

    <section class="section" id="timeline">
      <div class="section-heading"><h2>Timeline</h2><span>${result.events.length} events</span></div>
      <div class="timeline">
        ${result.events.map(renderTimelineEvent).join("\n")}
      </div>
      <p class="empty-state" data-filter-empty${result.events.length ? " hidden" : ""}>No timeline events match the current filters.</p>
    </section>

    <section class="section" id="reproduction">
      <div class="section-heading"><h2>Reproduction</h2><span>Local command</span></div>
      <p class="command"><code>${escapeHtml(result.reproduction.command)}</code></p>
      <div class="metadata">
        <span>Pack SHA-256 <code>${escapeHtml(result.identity.packSha256)}</code></span>
        <span>Schema ${result.schemaVersion}</span>
        <span>Fail on ${escapeHtml(result.policy.failOn)}</span>
        <span>Process closed ${result.policy.processClosed ? "yes" : "unknown"}</span>
      </div>
    </section>

    <footer class="report-footer">
      Offline report · defensively redacted at render time · no telemetry or network requests
      ${generatedAt ? ` · Completed ${escapeHtml(generatedAt)}` : ""}
    </footer>
  </main>
  <script>${REPORT_SCRIPT}</script>
</body>
</html>`;
}
