# Research, Positioning, and Competitive Decisions

**Purpose:** Record the evidence behind the second- and third-pass changes and prevent the project from making stale or inflated claims.
**Research review date:** 2026-08-02
**Evidence rule:** Treat product pages and papers as evidence of positioning and available capabilities, not proof of adoption or implementation quality.

---

## 1. Research conclusion

The problem is real and increasingly important, but the category is not empty. Adjacent projects already address parts of MCP testing, agent evaluation, trace replay, server auditing, and intervention.

The opportunity is therefore not to claim that nobody has thought about agent failures. The opportunity is to provide a sharply defined, open-source layer that combines:

- controlled failure injection;
- actual-client or agent interception;
- explicit effect and state contracts;
- physical call timelines;
- deterministic, CI-native evidence;
- community-owned failure packs.

The project should complement adjacent tools and become the shared reliability layer between them.

---

## 2. Research sources

### MCP and protocol context

- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) — tool schemas, annotations, and tool interaction semantics.
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) — authorization boundary context.

### Adjacent open-source and developer tools

- [mcptest on PyPI](https://pypi.org/project/mcp-agent-test/) — YAML fixtures, mocked MCP servers, trajectory assertions, capture, and agent regression testing.
- [MCPReplay](https://mcpreplay.dev/) — local-first recording, replay, sharing, and trace diffing.
- [MCP Observatory](https://github.com/KryptosAI/mcp-observatory) — MCP server testing, breaking changes, security-oriented checks, and replay.

### Research and emerging ecosystem

- [AgentCheck](https://arxiv.org/abs/2607.11098) — a reproduce/intervene/mitigate workbench for agents over MCP.
- [OpenTelemetry GenAI observability](https://opentelemetry.io/blog/2026/genai-observability/) — agent and tool execution visibility through standardized telemetry concepts.

### CI interoperability

- [GitHub SARIF overview](https://docs.github.com/en/code-security/concepts/code-scanning/sarif-files) — how third-party analysis results appear in GitHub code scanning.
- [GitHub SARIF upload guidance](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file?learn=code_security_integration&learnProduct=github) — upload, categories, permissions, and fingerprint considerations.

These sources establish that MCP testing and agent observability are active categories. They do not establish that any specific project is a direct substitute for Agent Crash Test’s intended effect-level failure contracts.

---

## 3. Competitive landscape

### 3.1 Direct and near-direct competitors

| Capability | Agent Crash Test | mcptest | MCPReplay | MCP Observatory | AgentCheck |
|---|---|---|---|---|---|
| Offline fixtures | Strong | Strong | Partial | Partial | Partial |
| YAML authoring | Strong | Strong | Not central | Not central | Not central |
| Record/capture | Planned expansion | Strong | Strong | Available/related | Related |
| Trace replay/diff | Planned/interoperable | Partial | Strong | Related | Related |
| Fault injection | Core differentiator | Error scenarios | Not central | Security/test checks | Intervention-oriented |
| Real-client interception | Expansion centerpiece | Agent-runner oriented | Recorder/proxy-oriented | Related | Workbench-oriented |
| Physical call timeline | Core | Trajectory oriented | Strong | Strong/related | Strong/related |
| Effect/state contract | Core differentiator | Assertions/trajectories | Limited/trace-oriented | Breaking/security-oriented | Intervention evidence |
| Community fixture corpus | Planned | Project-owned | Trace-oriented | Project-owned | Research-oriented |
| CI integration | Strong | Strong | Strong | Strong/related | Not the primary wedge |
| Language neutrality | Planned | Python-centered | CLI/local web | CLI/tool-centered | Workbench/research |
| Security certification | Explicitly no | Explicitly no | Explicitly no | Security-oriented | Research-oriented |

Ratings describe positioning from publicly described capabilities, not a quality judgment.

### 3.2 Indirect substitutes

- ordinary unit/API tests;
- custom retry tests;
- manually written mock servers;
- production observability traces;
- model evaluation frameworks;
- security scanners and red-team harnesses;
- manual testing in an inspector UI;
- doing nothing until an incident occurs.

The most dangerous substitute is non-consumption: teams often know retries and tool calls can be risky but never turn the risk into a reproducible test.

### 3.3 Adjacent future entrants

- observability platforms that add fault injection;
- MCP server registries that add compatibility or safety tests;
- agent frameworks that add built-in tool-call regression tests;
- CI platforms that add agent-specific test result ingestion;
- security tools that expand into behavioral reliability.

The project should therefore build a portable contract and community corpus before a platform vendor can turn the whole idea into a proprietary feature.

---

## 4. Differentiation decision

### Own this position

> **The reproducible “uncertain outcome” test layer for tool-using agents.**

The strongest scenario is not “the tool returned an error.” It is:

1. a side effect may have committed;
2. the caller cannot tell;
3. the caller chooses a recovery action;
4. Agent Crash Test proves whether that recovery created an extra or forbidden effect.

This is concrete, explainable, and valuable across tools such as issue creation, messages, payments, file operations, deployments, approvals, and database updates.

### Do not own these positions

- generic MCP inspector;
- generic trace viewer;
- generic model evaluator;
- generic replay engine;
- generic security scanner;
- hosted agent observability platform.

---

## 5. Strategic implications from research

### Implication 1 — Add capture, but do not become a replay clone

Capture is required to reduce authoring friction. It should generate a starter pack and effect-contract TODOs. Full trace replay, sharing, and browser visualization are not necessary to own the reliability niche.

### Implication 2 — Add a proxy, not only a scripted runner

Scripted runners test a declared workflow. A transparent proxy lets the real client reveal its actual retry and recovery behavior. This is the single most important product expansion.

### Implication 3 — Make the contract portable

A Python user should not need to adopt a TypeScript test engine as a prerequisite. The normalized contract and JSONL bridge should be language-neutral.

### Implication 4 — Interoperate with observability

OpenTelemetry export can connect test evidence to existing traces, but it must remain optional. The crash-test report remains the normative test result because it contains expected effects, forbidden effects, mutation semantics, and reproduction data.

### Implication 5 — Treat GitHub output as a distribution channel

JUnit, GitHub summaries, artifacts, and optional SARIF make the tool appear in the normal review flow. SARIF should be opt-in and clearly labeled because GitHub interprets it as code-scanning data.

### Implication 6 — The corpus is a strategic asset

The first-party and community pack library is what makes the tool interesting to people who do not yet have a specific bug. It provides examples, regression cases, and a shared vocabulary.

---

## 6. Research hypotheses to validate

### Hypothesis H1 — Real-client interception beats more YAML features

**Test:** Give users a proxy prototype and a richer pack editor separately. Ask which one they would install first.
**Pass:** At least 70% choose or rank real-client testing as the higher-value next capability.

### Hypothesis H2 — Capture reduces activation friction

**Test:** Compare hand-authored and capture-assisted cohorts.
**Pass:** Capture-assisted users reach a meaningful finding at least twice as often or twice as quickly.

### Hypothesis H3 — Effect contracts are understandable outside MCP

**Test:** Show generic create/send/update examples to Python and JavaScript developers.
**Pass:** At least 80% can identify intended and forbidden effects without protocol explanation.

### Hypothesis H4 — The “uncertain outcome” story is a strong adoption hook

**Test:** Compare README/demo messaging for generic agent testing versus duplicate-after-timeout.
**Pass:** The concrete side-effect story produces materially higher demo completion and repository clicks.

### Hypothesis H5 — Community contributors will add packs

**Test:** Give five external developers a pack template and one failing fixture.
**Pass:** At least four create a valid pack, and at least three include a meaningful remediation.

### Hypothesis H6 — Existing tools will complement rather than block adoption

**Test:** Ask users of replay, inspector, and agent-evaluation tools where the proposed effect-contract layer fits.
**Pass:** At least three users can name a workflow where Agent Crash Test adds evidence not already available.

---

## 7. Messaging tests

Test these headlines against actual users:

1. “Prove the agent did what you asked—and nothing else.”
2. “Chaos tests for tool-using agents.”
3. “Catch duplicate tool effects after timeouts and retries.”
4. “Contract tests for agent side effects.”
5. “Inject failures into real agent tool calls.”

The likely public hierarchy is:

- headline: concrete promise;
- subheadline: failure injection and state/effect evidence;
- examples: duplicate create/send/deploy;
- technical detail: MCP, proxy, fixture, JSONL, CI.

Avoid leading with “MCP” in the first sentence of the landing page if the project’s final ambition is broader than MCP.

---

## 8. Competitive monitoring plan

Review quarterly:

- new MCP testing tools;
- capture and replay capabilities;
- agent framework testing APIs;
- OpenTelemetry GenAI conventions;
- CI result formats;
- new papers on agent interventions and tool safety;
- GitHub Actions or package distribution changes;
- community requests for adapters and fixtures.

For each significant competitor change, record:

- what changed;
- whether it overlaps directly;
- whether it changes user expectations;
- whether Agent Crash Test should interoperate, differentiate, fast-follow, monitor, or ignore;
- what existing roadmap item should be removed if a new investment is made.

---

## 9. Positioning acceptance criteria

The positioning is ready when:

- a developer can explain the project in one sentence;
- the README names adjacent tools without attacking or dismissing them;
- a user can tell why a trace viewer alone is insufficient;
- a user can tell why a model evaluator alone is insufficient;
- a user can tell why a protocol conformance test alone is insufficient;
- the project makes no “nobody thought of this” claim;
- the public category is broad enough for non-MCP adapters;
- the first demo proves effect/state evidence rather than only an error response;
- launch messaging can be supported by a real package, proxy, and corpus.

---

## 10. Final research decision

The research supports proceeding, but only with disciplined differentiation:

- **Lead** on effect-level failure injection and uncertain-outcome recovery.
- **Fast-follow** on capture, JUnit, GitHub summaries, JSONL, and OpenTelemetry export.
- **Monitor** remote transports, framework-specific adapters, and hosted features.
- **Ignore for now** model judging, security certification, and a broad web platform.

The project should win attention by making one painful class of agent failure concrete, reproducible, and reusable—not by claiming to cover every problem in the agent ecosystem.
