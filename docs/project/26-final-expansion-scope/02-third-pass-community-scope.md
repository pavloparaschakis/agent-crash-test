# Third-Pass Final Community Scope

**Purpose:** Define the final product shape required for usefulness across a major wider part of the open-source community.
**Strategic change:** Move from “MCP crash-test runner” to “tool-use reliability testing, with MCP as the first adapter.”

---

## 1. Why a third pass is necessary

The second pass identified concrete missing capabilities: a transparent proxy, capture, protocol-neutral contracts, state observers, ambiguous-outcome mutations, CI integrations, and broader distribution.

The third pass asks whether those additions are arranged into a product that developers will actually adopt. The answer is only yes if the project changes its center of gravity in four ways:

1. **From hand-authored test packs to a fast path from an existing workflow.**
2. **From scripted calls to the real client or agent behavior.**
3. **From MCP-specific implementation to a language- and protocol-neutral contract.**
4. **From a tool repository to a community-owned reliability corpus and interoperability layer.**

Without those changes, the project risks becoming a technically thoughtful but niche utility used only by MCP specialists.

---

## 2. Final category and positioning

### 2.1 Category statement

> **Effect-level chaos and contract testing for tool-using agents.**

“Chaos” communicates deliberate failure injection. “Contract testing” communicates repeatability and CI. “Effect-level” distinguishes the project from output-only evaluation and trace-only replay.

### 2.2 Positioning statement

For developers building agents and tool-driven applications who need confidence that failures will not cause duplicate or unintended side effects, Agent Crash Test is an open-source reliability test kit that injects realistic tool failures and verifies state transitions. Unlike output-only evals, protocol conformance checks, or replay viewers, it proves the intended effect and forbidden effects using deterministic evidence.

### 2.3 Short description

> Inject a timeout, stale result, retry, disconnect, or malformed response into a real tool workflow—and verify what actually happened.

### 2.4 Message hierarchy

**Category:** Tool-use reliability testing.
**Differentiator:** Failure injection plus effect/state contracts.
**Outcome:** Catch duplicate, missing, stale, unauthorized, and extra side effects before production.
**Proof:** Reproducible packs, physical event timelines, expected-versus-observed state deltas, CI artifacts, and community fixtures.

### 2.5 Claims to make

- “Test the failure modes ordinary happy-path tests miss.”
- “Verify exactly-once effects after uncertain tool outcomes.”
- “Run locally and in CI without production credentials.”
- “Exercise a real local client through a transparent proxy.”
- “Turn incident stories into portable regression packs.”

### 2.6 Claims not to make

- “Certifies that your agent is safe.”
- “Finds all prompt injection vulnerabilities.”
- “Proves an agent is reliable in every environment.”
- “Replaces observability, security testing, replay, or model evaluation.”
- “Guarantees zero duplicate side effects.”
- “Guarantees 5,000 GitHub stars.”

---

## 3. Wider community segments

### 3.1 MCP server authors

**Need:** Validate tool behavior and idempotency.
**Entry point:** MCP stdio proxy and fixture packs.
**Proof of value:** A duplicate write is demonstrated with a concrete state delta.

### 3.2 Agent application developers

**Need:** Test how their actual client reacts to tool failures.
**Entry point:** Transparent proxy with no source changes.
**Proof of value:** The same agent retries, stops, asks for confirmation, or compensates as expected.

### 3.3 Python developers

**Need:** Use an existing pytest workflow and avoid adopting a Node-specific testing model.
**Entry point:** Python wrapper or JSONL bridge.
**Proof of value:** A failure appears as a normal test failure with JUnit output.

### 3.4 JavaScript and TypeScript developers

**Need:** Use the package from Node, Vitest, Jest, or a GitHub Action.
**Entry point:** npm package, Action, and test helper.
**Proof of value:** A pack is run as part of a normal pull request.

### 3.5 Framework maintainers

**Need:** Offer a standard reliability test contract to their users.
**Entry point:** Adapter API and generic event bridge.
**Proof of value:** The framework can emit tool events without embedding the entire crash engine.

### 3.6 Open-source maintainers outside AI

**Need:** Test any tool-driven workflow with side effects: CLIs, APIs, automation, integrations, deployers, and bots.
**Entry point:** Generic JSONL adapter and state observer.
**Proof of value:** The same effect contract catches an unintended duplicate issue, email, deployment, or file mutation.

### 3.7 Researchers and evaluators

**Need:** Reproducible interventions and comparable failure cases.
**Entry point:** Versioned mutation packs, seeds, reports, and trace export.
**Proof of value:** A study or benchmark can rerun the exact failure and inspect evidence.

---

## 4. The final product surface

### 4.1 User-facing surfaces

1. **CLI:** fastest local path, discovery, capture, run, explain, and report.
2. **Transparent proxy:** actual-client behavior under controlled faults.
3. **Pack format:** portable scenario, mutation, effect, assertion, and recovery contract.
4. **State observer adapters:** fixture, tool, snapshot command, and community adapters.
5. **CI integrations:** GitHub Action, JUnit, Markdown, JSON, and optional SARIF.
6. **Adapter SDK:** a small contract for other languages and protocols.
7. **Community corpus:** reusable packs with human-readable failure stories.
8. **Documentation and examples:** zero-to-first-finding path for multiple languages.

### 4.2 The first-run experience

The first five minutes must answer four questions:

- What kind of failure does this catch?
- Can I run it safely without credentials?
- Can it observe something concrete rather than judge vibes?
- Can I put it in CI after I fix the problem?

The demo should show an “apparently successful” workflow that produces an unintended duplicate effect, then show the repaired workflow passing the same mutation.

### 4.3 The first custom workflow

The user should be able to:

1. capture a successful local session;
2. inspect and approve redaction;
3. name the intended effect;
4. declare one forbidden effect;
5. select a mutation profile;
6. run once;
7. receive a report with first divergence and remediation;
8. commit the pack and CI configuration.

The workflow must be possible without writing a custom plugin. Advanced users can add observers, adapters, and mutation extensions later.

---

## 5. Final architecture decision

### 5.1 Layered design

```text
Protocol/client adapters
  ├── MCP stdio proxy
  ├── MCP fixture transport
  ├── generic JSONL bridge
  └── future protocol adapters

Normalized execution contract
  ├── logical operations
  ├── physical calls
  ├── results/errors
  ├── mutation phases
  └── correlation and determinism

Effect and state layer
  ├── fixture state
  ├── read-only tool probe
  ├── JSON snapshot command
  └── user-provided state adapter

Assertion and reporting layer
  ├── effect contracts
  ├── forbidden transitions
  ├── stable findings
  ├── terminal/Markdown/JSON/JUnit
  └── GitHub/optional SARIF/OpenTelemetry export
```

### 5.2 Why this architecture is broad enough

The project gains breadth through adapters and contracts, not through a new bespoke implementation for every ecosystem. The hard reliability logic remains centralized:

- mutation scheduling;
- event normalization;
- state-delta evaluation;
- finding fingerprints;
- redaction;
- deterministic reproduction;
- report generation.

The adapters only translate a client or protocol into that shared contract.

### 5.3 Why this architecture is not overbuilt

It does not require:

- a hosted service;
- a database;
- model APIs;
- a framework-specific agent runtime;
- a production proxy;
- a complex UI;
- a new distributed tracing backend.

The first expanded release remains local-first and CI-native.

---

## 6. Effect contracts for the wider community

### 6.1 Minimum contract

Every useful test must be able to declare:

- precondition;
- intended transition;
- forbidden transition;
- cardinality;
- ordering;
- observation source;
- recovery expectation;
- severity;
- remediation.

### 6.2 Example conceptual contract

```yaml
effect_contract:
  name: create_issue_once
  class: create
  precondition:
    issue_count: 0
  intended:
    issue_count: 1
  forbidden:
    duplicate_issue_count: 2
    outbound_notifications: 2
  cardinality: exactly_once
  recovery:
    uncertain_outcome: query_before_retry
  severity: blocker
```

The exact v2 schema may differ, but the semantics must be expressible independent of whether the effect is an MCP tool, a CLI command, a database call, or an agent framework callback.

### 6.3 Effect classes

The initial vocabulary should be deliberately small:

| Class | Typical risk | Required question |
|---|---|---|
| `read` | stale or unauthorized data | Did the agent use the correct version and permission? |
| `create` | duplicates | Was exactly one object created? |
| `update` | lost update | Was newer state preserved? |
| `delete` | irreversible action | Was deletion authorized and singular? |
| `send` | duplicate communication | Was one message sent only after confirmation? |
| `approve` | governance bypass | Was the approval gate respected? |
| `deploy` | operational blast radius | Was deployment triggered once and reported honestly? |
| `publish` | external visibility | Did the public action happen only once and with the expected content? |

---

## 7. Interoperability requirements

### 7.1 Existing tools are complements

The project should integrate conceptually with:

- protocol inspectors for discovery and manual invocation;
- record/replay tools for trace capture and diffing;
- agent evaluation tools for final answer and trajectory quality;
- observability systems for production traces;
- security tools for threat and vulnerability analysis.

Agent Crash Test owns deterministic controlled failure and effect verification. It should accept or export evidence where practical instead of asking users to abandon tools they already use.

### 7.2 OpenTelemetry relationship

OpenTelemetry export should be optional. The project’s internal report remains purpose-built for deterministic test evidence, while an exporter maps logical operations, tool invocations, mutations, and findings to spans/events where that mapping is meaningful.

Do not place secrets or full prompts into telemetry by default. Content capture must remain opt-in and redacted.

### 7.3 GitHub relationship

The GitHub Action should expose:

- a check conclusion;
- a concise step summary;
- downloadable Markdown and JSON artifacts;
- optional JUnit for test dashboards;
- optional SARIF only when the user understands the code-scanning implications.

Finding fingerprints must be stable enough to prevent noisy duplicate alerts across runs.

---

## 8. Community growth mechanism

The project becomes broadly useful when every failure can become a shared asset.

### Required loop

```text
User finds failure
  → strips sensitive data
  → minimizes scenario
  → adds expected and forbidden effects
  → adds passing control
  → contributes pack
  → maintainer reviews semantics
  → pack enters compatibility corpus
  → other projects reuse it
```

### Contribution experience

A contributor should be able to add a pack in three levels:

1. **YAML-only:** add a fixture and assertions.
2. **Adapter-assisted:** add a state observer or generic client bridge.
3. **Engine contribution:** add a mutation, assertion, reporter, or transport adapter.

Every level must have a clear template, validation command, and review rubric.

---

## 9. Perfection definition

Perfection is not “supports every framework.” For this project, perfection means:

- a real local client can be tested without source changes;
- the common failure classes are semantically precise;
- state evidence is explicit and safe;
- a user can get value before writing advanced configuration;
- reports are actionable for both humans and CI;
- the core contracts are portable across languages;
- the community can add high-quality failure cases;
- integrations remain optional and composable;
- the project never overclaims what a deterministic test can prove.

### Observable signs of perfection

- a new user understands the demo without oral explanation;
- a maintainer can explain a finding in one pull-request comment;
- a contributor can add a fixture without asking how the entire runner works;
- an agent developer can test their actual client;
- a Python user does not feel forced to become a Node maintainer;
- a report shows exactly where behavior diverged;
- a repeat run does not produce a different explanation without a meaningful cause.

---

## 10. Third-pass go/no-go decision

Proceed with the expanded direction if:

- at least five external developers confirm that real-client interception is more valuable than another report format;
- at least three external repositories can run a generated pack;
- at least one Python and one JavaScript example work from clean environments;
- the capture workflow reduces first-test setup materially compared with hand-authored packs;
- the project can explain its difference from replay, conformance, security, and model-evaluation tools in one paragraph;
- the community corpus produces examples that are useful without access to private applications.

If these conditions are not met, narrow the scope back to a high-quality MCP/fixture tool and avoid claiming broad protocol-neutral usefulness.
