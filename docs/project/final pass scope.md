# Final Pass Scope

## Agent Crash Test — end-to-end build, hardening, and public open-source release specification

**Document status:** Source of truth; local v0.1 implementation and hardening are complete, while external launch gates remain
**Target release:** Public experimental release / v0.1.0
**Repository:** Agent Crash Test
**Last reviewed:** 2026-08-01
**Primary promise:** **Prove the agent did what you asked—and nothing else.**

---

## 0. Executive decision

Agent Crash Test is now a runnable, hardened local v0.1 source preview. It is not yet ready for a credible public launch announcement until the external matrix, Action, tester, ownership, and release-operation gates are completed.

The project does not need to build every adjacent capability before opening the repository. It does need one focused hardening pass that makes the current narrow promise trustworthy:

1. the observed event trace must be complete;
2. duplicate and extra calls must not be hidden by the mutation engine;
3. effect probes must be safe and visible;
4. every report format must be useful, reproducible, and redacted;
5. transport failures and child-process lifecycle must be reliable;
6. the supported platform/install story must be tested rather than assumed;
7. the repository must be internally consistent and operationally ready for public maintenance;
8. external testers must confirm that a new user can understand and reproduce a failure without maintainer narration.

The correct launch shape is a deliberately narrow **MCP stdio + local fixture crash-test pack runner**. Recording/replay, real-agent execution, OAuth, hosted dashboards, model judging, PR comments, and rich reporting formats remain later work.

### Release recommendation

Use a two-stage public release:

- **Public source / experimental preview:** allowed after the P0 correctness and safety blockers pass, even if the package remains private to npm and the Action is used by GitHub reference.
- **Public v0.1.0 announcement:** allowed only after the full release gates in this document pass, including clean-machine, cross-platform, Action, tester, and launch-asset validation.

Do not describe the project as a security certification, agent evaluator, general replay tool, or guaranteed path to 5,000 GitHub stars.

---

## 1. Product definition

### 1.1 Problem

Agent and tool workflows fail in ways ordinary API tests do not expose:

- a write succeeds but its response times out;
- retry logic performs the write twice;
- a stale response is paired with a new request;
- a malformed result causes the caller to make a wrong decision;
- a permission denial is misinterpreted as success;
- a requested action succeeds and an extra action also occurs;
- a tool declares a safety or idempotency property that its observed effect does not support.

The project packages these failures as deterministic, reviewable crash-test packs. A pack defines a small workflow, injects a controlled fault, observes an explicitly declared effect, evaluates assertions, and produces a remediation-oriented report.

### 1.2 Primary users

1. **MCP server maintainer** — wants a local regression suite for tool behavior and side effects.
2. **Agent application developer** — wants to test how a scripted tool workflow recovers from realistic failures.
3. **Open-source contributor** — wants to add a portable failure fixture without understanding the entire runner.
4. **CI maintainer** — wants a non-zero check and a machine-readable artifact without a hosted account.
5. **Security-minded evaluator** — wants clear evidence and boundaries, not inflated safety claims.

### 1.3 Core user outcome

Given a local MCP server or deterministic fixture, a user can:

1. discover its tools;
2. author or initialize a crash-test pack;
3. inject one or more deterministic faults;
4. execute a scripted sequence;
5. observe declared output/state effects;
6. see the exact mutated event sequence;
7. receive a failure explanation, reproduction command, and remediation;
8. fail a GitHub check when a blocking invariant regresses.

### 1.4 Non-goals for v0.1

The following are explicitly not required for the public v0.1 release:

- running an arbitrary desktop agent;
- running a real language model in the default path;
- proving prompt-injection resistance;
- certifying a server or agent as secure;
- generic database or production-state introspection;
- transparent capture of arbitrary sessions;
- protocol recording/replay as the primary product;
- remote authenticated MCP servers;
- OAuth implementation;
- Streamable HTTP as a required transport;
- A2A or Agent Skills adapters;
- hosted dashboards or telemetry;
- automatic code patches;
- PR comments or line annotations;
- HTML, JUnit, or SARIF as required report formats;
- a large fixture corpus before the first release;
- an npm package publication unless explicitly chosen in the release decision.

These may be valuable P1/P2 work. They must not delay a useful, trustworthy local release unless they become necessary to validate the core promise.

---

## 2. Current baseline and known truth

### 2.1 Already present

The repository currently contains:

- TypeScript package with Node.js ESM build;
- MCP stdio client using the stable v1 TypeScript SDK surface;
- deterministic YAML fixture client;
- six mutation types;
- pack and fixture schemas using YAML and Zod;
- scripted step execution with retries;
- effect probes and assertions;
- terminal, Markdown, and JSON report writers;
- redaction for JSON reports;
- local broken invoice MCP server;
- seven real-MCP packs and one fixture pack;
- CLI commands for `demo`, `init`, `discover`, `mutate`, `run`, and `doctor`;
- explicit unavailable responses for deferred P1 command names;
- composite GitHub Action;
- GitHub CI workflow;
- issue forms, security policy, contribution guide, code of conduct, changelog, license, and versioning file;
- unit and integration tests.

### 2.2 Current implementation evidence

Relevant files:

- [src/runner.ts](../../src/runner.ts)
- [src/mutations.ts](../../src/mutations.ts)
- [src/mcp-client.ts](../../src/mcp-client.ts)
- [src/fixture-client.ts](../../src/fixture-client.ts)
- [src/pack.ts](../../src/pack.ts)
- [src/command-line.ts](../../src/command-line.ts)
- [src/assertions.ts](../../src/assertions.ts)
- [src/reporters.ts](../../src/reporters.ts)
- [src/cli.ts](../../src/cli.ts)
- [examples/packs](../../examples/packs)
- [action.yml](../../action.yml)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)

### 2.3 Current verification baseline

The existing local verification has demonstrated:

- TypeScript compilation;
- unit and integration tests;
- real MCP stdio connection to the bundled server;
- deterministic fixture execution;
- intentional duplicate-side-effect failures;
- stale-output and malformed-result failures;
- permission-denial/no-effect passing control;
- report generation;
- basic report JSON redaction;
- dependency audit with no currently reported production vulnerabilities.

This was the prototype baseline. The repository has now implemented the P0 correctness, safety, report, CLI, and repository-quality work below. External OS/Action/tester/ownership gates remain explicitly separate and are not represented as completed merely because local tests pass.

### 2.4 Current known gaps that must not be hidden

The first audit found ten meaningful gaps. They are now addressed in code or configuration: duplicate physical events, before/after fixture transitions, all-format redaction, fail-closed probes, typed lifecycle errors, context-aware stale results, reproduction/timelines, the OS matrix configuration, a documented GitHub-first/private npm decision, and reconciled repository docs. The remaining gaps are external validation and ownership decisions listed in the release gates below.

---

## 3. Definition of done

### 3.1 Public-source ready

The repository may be made public when all of the following are true:

- the core test runner is correct for its documented P0 behavior;
- all report formats are safe enough for local use and clearly bounded;
- the README does not promise unavailable functionality;
- the build and test commands work from a clean clone;
- the license and security/contribution documents are present;
- no bundled fixture contains a credential or production endpoint;
- P1 omissions are explicit;
- a maintainer is identified and able to receive issues;
- the repository can accept a fixture contribution.

### 3.2 Public v0.1 announcement ready

In addition to the above:

- the duplicate trace and report fidelity fixes are complete;
- all P0 tests pass on supported operating systems;
- the Action is proven in a separate sample repository;
- five external testers complete the quickstart;
- a failure can be understood without oral explanation;
- demo video/GIF and before/after artifacts exist;
- the repository name and ownership are confirmed;
- the release tag and notes are prepared;
- the first 72-hour issue-response plan is assigned.

### 3.3 Stable release ready

This is not required for the first open-source launch. It additionally requires:

- signed/pinned release artifacts;
- a compatibility policy and migration tooling;
- pinned GitHub Action references;
- cross-platform support policy with automated coverage;
- stable pack/report schemas;
- dependency update automation;
- a documented security response process with maintained contacts.

---

## 4. Priorities and sequencing

### P0-A — correctness and trust blockers

Must be built before public announcement:

1. Complete event trace for duplicate calls, retries, mutations, and effect probes.
2. Correct transition/extra-effect assertion semantics.
3. Reproduction command and call timeline in reports.
4. Redaction across terminal, Markdown, and JSON.
5. Safe, visible effect-probe behavior.
6. Clear transport/process error classification and lifecycle cleanup.
7. Deterministic metadata and repeatability tests.

### P0-B — release quality blockers

Must be completed before public v0.1 announcement:

1. Clean-machine install and demo test.
2. Windows, macOS, and Linux validation.
3. Separate sample-repository GitHub Action validation.
4. README, roadmap, checklist, audit, and launch docs reconciled.
5. Maintainer/repository configuration completed.
6. Launch assets created.
7. Five-user external validation completed.

The local implementation for these items is complete where it can be completed
without repository ownership or independent testers. Remaining items are
intentionally marked as external gates below.

### P1 — valuable follow-up, not a launch blocker

- local unauthenticated Streamable HTTP;
- recording proxy and import;
- real-agent adapter;
- local model adapter;
- schema-drift mutation;
- poisoned-content/canary packs with a real sink oracle;
- HTML, JUnit, SARIF;
- PR comments and annotations;
- version comparison;
- fixture minimization;
- compatibility cards and badges;
- expanded fixture corpus.

### P2 — ecosystem expansion

- OAuth and remote authenticated targets;
- A2A and Agent Skills;
- hosted index/dashboard;
- public benchmark/challenge service;
- client adapters and broad ecosystem integrations.

### Scope rule

Any new feature added before v0.1 must answer all three questions:

1. Does it help a user reproduce, understand, fix, or prevent a tool-workflow failure?
2. Can it be built without weakening the deterministic local trust boundary?
3. Which existing task will be removed or delayed to make room for it?

If the answer to the third question is “none,” the feature belongs in P1/P2.

---

## 5. Target architecture

### 5.1 System boundary

```text
                 pack.yaml / fixture.yaml
                           |
                           v
                  +------------------+
                  | Pack validator   |
                  | schema + semantics|
                  +---------+--------+
                            |
                            v
                  +------------------+
                  | Scripted runner  |
                  | steps + retries  |
                  +----+---------+---+
                       |         |
             +---------+         +----------+
             v                              v
   +-------------------+          +-------------------+
   | Mutation engine   |          | Client adapter    |
   | fault decisions   |          | fixture / MCP     |
   +---------+---------+          +---------+---------+
             |                              |
             +---------------+--------------+
                             v
                    +------------------+
                    | Event recorder   |
                    | complete trace  |
                    +--------+---------+
                             |
              +--------------+---------------+
              v                              v
     +------------------+           +------------------+
     | Effect observers |           | Assertion engine |
     | safe probes      |           | expected state   |
     +--------+---------+           +--------+---------+
              +---------------+--------------+
                              v
                    +------------------+
                    | Versioned report |
                    | redacted outputs |
                    +--------+---------+
                             |
             +---------------+----------------+
             v                                v
      terminal / Markdown / JSON       GitHub Action artifact
```

### 5.2 Design constraints

- The pack is the durable asset; the runner is an execution adapter.
- P0 is local-first and credential-free by default.
- The runner never infers production state.
- Every observed call that can affect the result must have a trace event.
- Every injected mutation must be identifiable in the trace and report.
- An effect probe is an explicit observation action, not a magical database snapshot.
- Tool annotations are untrusted claims and may be asserted, but never treated as proof.
- A failure report must distinguish observed fact from inference and remediation advice.
- The report schema is versioned independently from the pack schema.
- A failing assertion must preserve enough evidence to reproduce the same scenario.

### 5.3 Components and responsibilities

#### Pack validator

Responsibilities:

- parse YAML;
- validate schema;
- validate transport-specific requirements;
- validate assertion-specific required fields;
- validate probe safety metadata;
- reject ambiguous or unsupported fields with actionable errors;
- preserve pack source path and content hash.

#### Client adapter

Responsibilities:

- connect and close cleanly;
- list tools and capture normalized manifest;
- invoke tools with JSON arguments;
- classify protocol, transport, and server errors;
- enforce request timeout and cancellation;
- never leak raw credentials into errors or reports.

#### Mutation engine

Responsibilities:

- select mutations by stable ID/type/tool/occurrence;
- apply mutations without modifying the source pack or server code;
- record mutation intent and result;
- support deterministic seeds and mutation version;
- expose duplicate/retry behavior to the event recorder;
- keep mutation state scoped to a run and request context.

#### Event recorder

Responsibilities:

- capture logical step events;
- capture physical tool invocations;
- capture injected duplicate calls;
- capture retry attempts;
- capture effect-probe calls;
- capture outcomes, errors, duration, mutation IDs, and correlation IDs;
- preserve ordering and parent/child relationships;
- redact before persistence to report formats.

#### Effect observer

Responsibilities:

- observe only fixture state or explicitly authorized read-only tools;
- record probe calls separately from scenario calls;
- verify/read manifest annotations where available;
- require explicit opt-in for uncertain probe safety;
- never silently mutate the target while measuring it.

#### Assertion engine

Responsibilities:

- evaluate deterministic assertions only;
- include exact event/effect evidence;
- identify the first divergent event when possible;
- support blocking severity policy;
- distinguish assertion failure from runner failure;
- preserve expected and observed values after redaction.

#### Reporters

Responsibilities:

- produce terminal, Markdown, and JSON outputs from the same report model;
- apply the same redaction policy to every output;
- include reproduction and scope warnings;
- avoid claiming security guarantees;
- maintain stable report schema fields.

---

## 6. Canonical run model

The implementation should evolve the current loose types into the following explicit model. Exact TypeScript names may vary, but the semantics must remain.

### 6.1 Run identity

```ts
interface RunIdentity {
  runId: string;
  startedAt: string;
  completedAt?: string;
  runnerVersion: string;
  reportSchemaVersion: number;
  packSchemaVersion: number;
  packId: string;
  packSource: string;
  packSha256: string;
  serverManifestSha256?: string;
  mutationSeed?: number;
  platform: {
    os: string;
    arch: string;
    node: string;
  };
}
```

Requirements:

- `runId` must be unique per execution but not used as a determinism input.
- `packSha256` and normalized manifest hash must be reproducible.
- timestamps are metadata, not assertion inputs.
- reports must state whether a run is deterministic, partially deterministic, or nondeterministic.

### 6.2 Logical scenario event

```ts
interface ScenarioEvent {
  eventId: string;
  sequence: number;
  parentEventId?: string;
  kind: "step" | "retry" | "duplicate" | "effect_probe";
  stepId?: string;
  tool: string;
  arguments: JsonObject;
  attempt: number;
  outcome: "success" | "error" | "timeout" | "mutated";
  output?: JsonValue;
  error?: CallError;
  mutationIds: string[];
  mutationVersion?: string;
  startedAt?: string;
  durationMs: number;
  redactionApplied: boolean;
}
```

Rules:

- One physical tool invocation equals one event.
- A retry is a new physical event with an `attempt` greater than one and a parent logical step.
- A duplicate invocation is a new physical event with `kind: "duplicate"` and a parent pointing to the original attempt.
- An effect probe is a new event with `kind: "effect_probe"`; it is never silently omitted.
- The event trace must make it possible to answer how many times the server was actually called.
- `call_count` must count physical calls by default and may optionally count logical steps if a future schema field says so.

### 6.3 Mutation record

```ts
interface MutationRecord {
  id: string;
  type: MutationType;
  version: string;
  seed?: number;
  appliesTo?: string;
  occurrence?: number;
  requestedAtEvent?: string;
  appliedAtEvent?: string;
  parameters: JsonObject;
  result: "applied" | "not_matched" | "blocked" | "failed";
}
```

Every declared mutation must appear in the report, including mutations that did not match an occurrence. This makes a “passing” run distinguishable from a mutation that was never applied.

### 6.4 Effect value

```ts
interface ObservedEffect {
  id: string;
  source: "fixture_state" | "tool";
  tool?: string;
  path: string;
  before?: JsonValue;
  after?: JsonValue;
  expected?: JsonValue;
  observed?: JsonValue;
  probeEventId?: string;
  safety: "fixture" | "declared_read_only" | "explicit_unsafe_opt_in";
}
```

P0 may continue to use a single observed value for simple paths, but the report model must leave room for before/after semantics.

### 6.5 Finding

```ts
interface Finding {
  id: string;
  severity: "blocker" | "error" | "warning" | "notice" | "info";
  status: "failed" | "passed" | "skipped";
  message: string;
  whyItMatters?: string;
  expected?: JsonValue;
  observed?: JsonValue;
  evidenceEventIds: string[];
  remediation?: string;
  reproduction: {
    command: string;
    workingDirectory?: string;
    packPath: string;
  };
  redactionApplied: boolean;
}
```

### 6.6 Report envelope

```ts
interface RunReport {
  schemaVersion: 1;
  identity: RunIdentity;
  pack: PackSummary;
  transport: "stdio" | "fixture";
  server: ServerSummary;
  mutations: MutationRecord[];
  events: ScenarioEvent[];
  effects: ObservedEffect[];
  assertions: AssertionResult[];
  findings: Finding[];
  executionWarnings: string[];
  policy: {
    failOn: Severity;
    networkBoundary: "not_enforced" | "external_sandbox_required";
    credentialPolicy: "minimal_environment";
  };
}
```

Backward compatibility:

- keep `schemaVersion: 1` for additive fields that do not change semantics;
- if the event shape changes incompatibly, increment the report schema version;
- add migration guidance before removing existing fields;
- never silently reinterpret old `call_count` or transition semantics.

---

## 7. P0 correctness work packages

### P0-01 — Complete physical invocation trace

**Problem:** the current duplicate mutation performs a second client call but only one event is emitted.

**Build:**

- move event creation to the layer that owns every physical client invocation;
- give original, retry, duplicate, and probe calls distinct event IDs;
- record parent/child relationships;
- record the mutation ID responsible for the duplicate;
- record the duplicate outcome, even if it is ignored for the logical step result;
- decide and document whether `call_count` counts physical calls or logical steps; default to physical calls;
- make the terminal and Markdown reports show a compact timeline.

**Acceptance criteria:**

- Given one `duplicate_call` mutation, the JSON report contains two physical invocation events.
- The second event has `kind: duplicate` and points to the first event.
- `call_count` sees two calls unless configured for logical-step counting.
- A duplicate server error is not silently discarded; it appears as evidence or warning.
- The effect assertion still evaluates the final observed state.
- A test fails if the trace says one call while the fixture/server state proves two.

**Tests:**

- fixture duplicate call event test;
- stdio duplicate call event test;
- call-count physical-call test;
- duplicate error visibility test;
- report timeline snapshot test.

### P0-02 — Correct transition semantics

**Problem:** `no_extra_transition` is currently an alias for equality against a single effect value.

**Decision:** either implement real transition semantics now or remove the name from the P0 surface. The recommended choice is implementation because extra side effects are the product’s signature use case.

**Build:**

- define `allowed_effects` and `forbidden_effects` or equivalent named transition contracts;
- support initial and final values for fixture state;
- support explicit effect probe before/after values where safe;
- identify an extra transition when a forbidden path changes;
- distinguish missing expected effect, extra effect, duplicate effect, and changed effect;
- include the first divergent event ID;
- do not claim a generic state diff where no state source was supplied.

**Minimum schema proposal:**

```yaml
assertions:
  - id: no-unconfirmed-send
    type: no_extra_transition
    effect: outbound_messages
    path: length
    expected: 0
    forbidden_change: increase
    remediation: Reject the send unless confirmation is true.
```

For more complex cases:

```yaml
state_contract:
  effects:
    - path: invoices.length
      expected_delta: 1
    - path: outbound_messages.length
      expected_delta: 0
  forbidden:
    - path: permissions
      change: any
```

**Acceptance criteria:**

- A requested invoice plus an extra outbound message is reported as an extra transition.
- A missing invoice is reported as a missing transition.
- Two invoices where one is expected are reported as a duplicate transition.
- An unrelated permission change is reported as forbidden when declared.
- A pack without a state/effect source cannot claim a real-world side-effect assertion.

**Tests:**

- fixture before/after transition tests;
- extra message test;
- missing effect test;
- duplicate effect test;
- forbidden unrelated path test;
- no-state-source validation test.

### P0-03 — Reproduction command and evidence links

**Problem:** reports currently do not give a copyable reproduction command or a compact call sequence.

**Build:**

- derive a reproducible command from the actual invocation context;
- include the pack path and working directory;
- include the selected mutation profile or pack mutation IDs;
- include a deterministic seed when one exists;
- include the first divergent event and relevant evidence IDs;
- show a compact timeline in terminal and Markdown;
- keep verbose event details in collapsible Markdown sections;
- include a JSON `reproduction` object.

**Example:**

```text
Reproduce:
  cd /repo
  node dist/cli.js run examples/packs/timeout-retry-duplicates.yaml --format terminal,json --output artifacts/agent-crash-test

First divergence: event duplicate-create-attempt-2
Expected: invoices.length = 1
Observed: invoices.length = 2
```

**Acceptance criteria:**

- Copying the command from a failing local report reproduces the same finding.
- A report generated from a different working directory still gives a usable absolute or clearly relative path.
- JSON includes pack path, command, mutation IDs, seed, and first divergent event.
- Markdown is useful as a GitHub issue body without maintainer explanation.
- Terminal output remains concise for CI logs.

### P0-04 — Redaction in every output format

**Problem:** JSON is redacted, but terminal and Markdown can interpolate raw effect values and finding evidence.

**Build:**

- centralize redaction before report model serialization;
- redact terminal strings, Markdown values, JSON values, errors, arguments, outputs, effect values, and evidence;
- preserve JSON shape where possible;
- support key-based and value-pattern redaction;
- add configurable custom secret regex only if it cannot accidentally print the original value in an error;
- never log the full environment;
- add a report warning when a value was redacted;
- ensure redaction runs before writing any file.

**Minimum key patterns:**

- authorization;
- bearer;
- token;
- secret;
- password;
- cookie;
- API key variants;
- private key variants;
- cloud credential names;
- session and refresh tokens;
- webhook signing secrets.

**Minimum value patterns:**

- `Bearer ...`;
- OpenAI-style keys;
- GitHub tokens;
- Google API keys;
- AWS access-key-shaped values;
- private key blocks;
- common JWT-shaped values;
- configurable user-provided patterns.

**Acceptance criteria:**

- A secret in tool output does not appear in terminal output.
- A secret in tool output does not appear in Markdown output.
- A secret in tool output does not appear in JSON output.
- A secret in an error message is redacted.
- A secret-looking argument is redacted while non-sensitive neighboring fields remain.
- Redaction tests assert the original string is absent from every artifact.
- Reports state that redaction occurred without revealing the redacted value.

### P0-05 — Safe effect probes

**Problem:** a `source: tool` probe can call any named tool, while the pack format only asks authors to promise that it is read-only.

**Recommended safety model:**

1. Fixture state probes are always allowed.
2. MCP tool probes require the tool to be present in the manifest.
3. The tool must declare a read-only annotation where available.
4. If the annotation is missing or contradictory, fail closed by default.
5. An explicit `allow_unsafe_probe: true` opt-in may be added for experimental use, with a prominent warning and a separate severity.
6. Every probe call is recorded in the event trace.
7. Probe effects are not silently included in scenario call counts.

**Important trust rule:** MCP annotations are untrusted claims. A read-only annotation is a precondition for the harness to call the probe by default, not evidence that the server actually behaved read-only.

**Acceptance criteria:**

- A probe for a missing tool is rejected before scenario execution or reported as a clear configuration failure.
- A probe without a read-only declaration is blocked by default.
- An explicitly unsafe probe requires both `execution.allow_unsafe_probes: true` in the pack and `--allow-unsafe-probes` at runtime, and produces a warning.
- Probe calls appear in JSON evidence.
- Probe calls do not change the expected scenario event count unless explicitly requested.
- A probe failure does not silently turn an assertion into a pass.

### P0-06 — Transport and process lifecycle

**Problem:** all client invocation failures are currently broadly classified as server errors, and a real hung child process has no complete documented timeout/kill policy.

**Build:**

- define error classes: configuration, spawn, initialization, protocol, request timeout, transport closed, server error, assertion failure, internal error;
- configure per-step request timeout with a safe default;
- configure maximum process lifetime for the run;
- cancel/abort an in-flight request when timeout occurs;
- close transport in `finally` blocks;
- terminate a child process that exceeds the allowed lifetime;
- wait for termination and escalate only when necessary;
- avoid orphaned processes on assertion failure or Ctrl-C;
- preserve the original error class in JSON;
- map errors to documented CLI exit codes.

**Acceptance criteria:**

- A missing command returns a configuration/spawn error with a useful message.
- A child that never responds is terminated within the configured bound.
- A protocol initialization failure is distinguishable from a tool-returned server error.
- Ctrl-C and test failure do not leave a child process running.
- The runner does not hang indefinitely on a malformed server.
- The report states whether the server process was cleanly closed.

### P0-07 — Context-aware stale mutation

**Problem:** stale-result state is currently global, so a stale response can come from an unrelated previous tool.

**Build:**

- scope previous successful outputs by tool name and, where applicable, request correlation key;
- preserve the original arguments and event ID on the stale response;
- make stale mutation behavior explicit in the report;
- reject stale injection when no eligible prior response exists unless the pack explicitly allows fallback to current output.

**Acceptance criteria:**

- A stale `get_customer` response can reuse a prior `get_customer` response.
- A stale `get_customer` response cannot reuse a `create_invoice` output.
- A stale response is linked to its source event.
- A first-call stale mutation produces a clear “not applicable” or documented fallback.
- Tests cover two tools with different output shapes.

### P0-08 — Determinism metadata and repeatability

**Build:**

- add mutation engine version;
- add seed and normalized pack hash;
- add normalized manifest hash;
- add environment/runtime metadata that is safe to disclose;
- sort tools, effects, assertions, and report collections where ordering is not semantically meaningful;
- preserve event order where it is semantically meaningful;
- define how generated IDs and timestamps are excluded from equality;
- add a `determinism` status to the report.

**Acceptance criteria:**

- Running the same fixture twice yields equal semantic events/effects/findings after removing timestamps and run ID.
- A changed pack hash is visible in the report.
- A changed tool manifest hash is visible in the report.
- The seed is visible when a mutation uses one.
- No random value affects outcomes without being seeded.

---

## 8. Pack schema and authoring specification

### 8.1 Canonical v1 pack

```yaml
version: 1
id: billing/retry-is-idempotent
name: Retrying invoice creation produces one invoice
description: A write that succeeds before a timeout must not be duplicated by retry.
protocol: mcp
transport: stdio

server:
  command: node
  args: [dist/server.js]
  cwd: ../..
  env: {}

execution:
  request_timeout_ms: 10000
  max_run_ms: 60000
  network: not_enforced
  inherit_env: false

effect_probes:
  - id: invoice_count
    source: tool
    tool: get_state
    path: invoices.length
    safety: declared_read_only
    description: Read-only count exposed by the local test server.

steps:
  - id: create
    call: create_invoice
    arguments:
      customer_id: cus_1
      amount: 100
      request_id: req_1
    retry:
      max_attempts: 2
      on: [timeout]
    capture: create_result

mutations:
  - id: timeout-after-write
    type: timeout
    applies_to: create_invoice
    occurrence: 1
    duration_ms: 0
    seed: 42

assertions:
  - id: exactly-one-invoice
    type: effect_equals
    effect: invoice_count
    expected: 1
    severity: error
    remediation: Use a durable request or idempotency key for the write.

artifacts:
  remediation: Make the side effect idempotent before declaring idempotentHint.
```

### 8.2 Schema validation rules

The validator must reject:

- missing `version`, `id`, `name`, `protocol`, `transport`, `server`, `steps`, or `assertions`;
- malformed pack IDs;
- unsupported protocol or transport;
- stdio packs without a command;
- fixture packs without a fixture path;
- tool probes without a tool name;
- `result_path_equals` without a step and path;
- effect assertions without an effect ID;
- `call_count` without a tool and count bound;
- malformed retry policy;
- unknown mutation types;
- invalid severity values;
- effect claims without state or effect source;
- unsafe probes without explicit opt-in.

The validator should warn, not fail, for:

- missing descriptions;
- missing remediation on a blocking assertion;
- annotations that are present but not relevant;
- a mutation with a seed that a mutation type does not use;
- unused captures;
- an effect probe whose path resolves to undefined, unless the assertion explicitly expects missing.

### 8.3 Authoring ergonomics

`init` must create:

- a valid starter pack;
- a README or comment explaining how to edit the pack;
- a minimal fixture example or link to the bundled fixture;
- an optional GitHub workflow snippet without silently modifying user workflows.

`discover` must print:

- tool name;
- description;
- input schema summary;
- output schema presence;
- annotations;
- normalized server metadata;
- a warning that annotations are untrusted claims.

`mutate` must clearly state whether it:

- runs declared mutations dynamically;
- generates new pack files;
- applies a named profile;
- skips mutations not present in the selected pack.

The current v0.1 behavior is dynamic selection of declared mutations, not generation. Preserve that honesty unless generation is implemented.

---

## 9. Mutation specification

All mutations must be deterministic, isolated from source files, identifiable in reports, and tested against both a fixture client and the MCP stdio client where meaningful.

### 9.1 Timeout / latency

Purpose: simulate a response that is delayed or unavailable after the server may have applied an effect.

Required semantics:

- invoke the underlying operation according to the selected mode;
- return a timeout outcome to the scripted runner;
- preserve the fact that the underlying call may have applied an effect;
- support deterministic duration;
- support request cancellation in real process mode;
- record whether the timeout was injected before or after the server response/effect.

Minimum tests:

- immediate injected timeout;
- delayed timeout;
- timeout followed by retry;
- timeout on a read-only operation;
- timeout process cleanup.

### 9.2 Retryable error

Purpose: simulate an error that causes a retry policy to run.

Required semantics:

- return a typed retryable outcome;
- preserve any underlying effect if injection occurs after execution;
- cause retry only when the step policy includes the error kind;
- record every physical call;
- stop after `max_attempts`;
- report whether the final state is safe despite retry.

Minimum tests:

- retry allowed;
- retry disallowed;
- max attempts reached;
- effect applied once;
- effect duplicated;
- retryable error on a permission-denied response.

### 9.3 Malformed result

Purpose: return an output that violates the declared or expected result contract.

Required semantics:

- preserve raw response only in redacted in-memory/report form;
- produce a deterministic malformed value;
- ensure result-path/schema assertions fail clearly;
- never crash the reporter because the output is not shaped as expected.

Minimum tests:

- scalar where object expected;
- missing nested field;
- invalid array/object shape;
- malformed text content;
- redaction of malformed secret-shaped content.

### 9.4 Stale result

Purpose: return a prior eligible response for the current tool/request context.

Required semantics:

- key prior response by tool and request context;
- identify source event;
- prevent cross-tool type contamination;
- make first-call behavior explicit;
- show stale source and target in the report.

Minimum tests:

- same-tool stale result;
- cross-tool rejection;
- first-call fallback;
- stale output after a successful state change;
- stale output plus retry.

### 9.5 Duplicate call

Purpose: physically invoke a tool twice while the logical step expects one call.

Required semantics:

- perform two physical invocations;
- record both events;
- parent the duplicate event to the original;
- preserve duplicate outcome/errors;
- evaluate final state after both calls;
- expose physical call count.

Minimum tests:

- idempotent fixture passes;
- non-idempotent fixture fails;
- duplicate error visible;
- duplicate call count is two;
- duplicate is not confused with retry;
- duplicate effect is visible in state.

### 9.6 Permission denied

Purpose: prevent the underlying operation and return a typed permission error.

Required semantics:

- do not invoke the underlying client;
- record a blocked/preflight event;
- allow explicit retry policy only if the pack requests it;
- assert no side effect occurred;
- distinguish injected denial from server-returned denial.

Minimum tests:

- no underlying invocation;
- no state change;
- blocked event appears;
- retry policy behavior;
- terminal warning and JSON error class.

---

## 10. Assertion specification

### P0 assertions

#### `effect_equals`

Passes when the named observed effect equals the expected JSON value after optional path selection.

Must report:

- effect ID;
- selected path;
- expected value;
- observed value;
- probe event ID;
- first divergent event when available.

#### `effect_not_equals`

Passes when the named effect does not equal the forbidden value.

Must not treat `undefined` as an automatic pass without stating that the effect was missing.

#### `result_path_equals`

Passes when a captured step output contains the expected value at the declared path.

Must report:

- step ID;
- output path;
- expected value;
- observed value;
- event ID of the captured step.

#### `must_not_call`

Passes when no physical event calls the forbidden tool, unless the assertion explicitly scopes a phase/step.

Must detect calls made by duplicate mutations, retries, and effect probes according to the assertion’s declared scope.

#### `call_count`

Default meaning: exact physical call count for the named tool across scenario events.

Optional future fields:

```yaml
type: call_count
tool: create_invoice
exactly: 1
phase: scenario
```

For v0.1, preserve compatibility with the existing `max` field only if its exact semantics are documented and tested. Prefer replacing ambiguous `max` with `exactly` and `at_most` in the next schema revision.

#### `annotation_matches`

Passes when a declared manifest annotation equals the expected value.

The result must say “declared annotation matches,” not “behavior is safe.”

#### `state_path_equals`

P0 alias or explicit form for a path in a declared state/effect source. It must not imply generic production-state discovery.

#### `no_extra_transition`

Must be implemented as a true transition assertion before public announcement or removed from the supported P0 assertion list. It must detect forbidden changes, not merely compare one final scalar.

### Assertion failure contract

Every failed assertion must include:

- stable assertion ID;
- severity;
- human message;
- why it matters when available;
- expected and observed values;
- relevant event IDs;
- relevant effect IDs;
- remediation;
- reproducible command;
- redaction status.

### Severity policy

Default `fail-on` is `error`.

Ranking:

```text
info < notice < warning < error < blocker
```

Behavior:

- unknown `fail-on` values are configuration errors, not silent defaults;
- `warning` fails only when `--fail-on warning` is selected;
- `blocker` always fails under the default policy;
- runner/configuration errors have their own non-zero exit code and must never be confused with passing assertions.

---

## 11. Report specification

### 11.1 Terminal report

The terminal report must show, in this order:

1. tool/version;
2. pack name and ID;
3. pass/fail counts;
4. mutation summary;
5. first divergent event;
6. compact event timeline;
7. effect expected vs observed;
8. findings by severity;
9. reproduction command;
10. remediation;
11. execution/security warnings.

Example target:

```text
Agent Crash Test 0.1.0
Pack: demo/timeout-retry-duplicates
Transport: stdio | Determinism: deterministic

Assertions: 1 passed, 1 failed
Mutation: timeout-after-write applied at create_invoice#1

Timeline:
  1 create_invoice attempt=1  MUTATED_TIMEOUT  effect may have applied
  2 create_invoice attempt=2  SUCCESS
  3 get_state      probe=invoice_count  SUCCESS

ERROR exactly-one-invoice
Expected: invoice_count = 1
Observed: invoice_count = 2
First divergence: event create_invoice#2

Reproduce:
  node dist/cli.js run examples/packs/timeout-retry-duplicates.yaml --format terminal,json

Fix: Use a request ID or idempotency key to make retries safe.
Warning: host-network denial is not enforced in normal stdio mode.
```

### 11.2 Markdown report

The Markdown report must be usable as a GitHub issue or PR artifact.

Required sections:

- summary;
- status badge text, not a security badge;
- pack and run metadata;
- mutation summary;
- expected vs observed effects;
- findings;
- reproduction command;
- compact timeline;
- collapsible detailed evidence;
- remediation;
- safety warnings;
- report schema version.

Use `<details>` for verbose event/output evidence. Apply redaction before interpolation.

### 11.3 JSON report

The JSON report is the integration contract.

Required properties:

- `schemaVersion`;
- run identity;
- pack identity and hash;
- server/manifest summary;
- mutation records;
- complete event trace;
- effect values and probe safety;
- assertion results;
- findings;
- reproduction metadata;
- execution warnings;
- policy/network/credential boundaries.

JSON must be valid even when:

- zero assertions pass;
- zero tools are listed;
- the server fails during initialization;
- a tool returns malformed output;
- a child process times out;
- all values are redacted.

### 11.4 Report file behavior

- report directories are created safely;
- pack IDs are normalized to collision-resistant filenames;
- filename collisions cannot silently overwrite another pack’s report;
- output writes are atomic where practical;
- report writes do not contain secrets;
- an artifact path is printed after successful write;
- an error writing a report is a non-zero internal/reporting error.

---

## 12. CLI specification

### 12.1 Command table

| Command | P0 behavior | Exit behavior |
|---|---|---|
| `demo` | Run bundled packs and show intentional findings; demo itself exits 0 | 0 when demo executed successfully |
| `init [path]` | Create starter pack and instructions | 0 on write; 2 on invalid args/path |
| `discover --stdio "..."` | Connect, list, normalize tools | 0 on success; 2 config; 3 spawn/transport |
| `run <path>` | Run one pack or pack directory | 0 pass; 1 blocking findings; 2 invalid pack/config; 3 target failure; 4 policy block; 10 internal |
| `mutate <path> --profile ...` | Select and run declared mutation types | Same as `run` |
| `doctor` | Check runtime and safety boundary | 0 healthy; non-zero if required runtime is unsupported |
| `record/import/compare/explain/export` | Explicitly report P1 unavailable | 4 |

Exit codes must be implemented, tested, and documented. Do not let a raw uncaught error collapse every failure into the internal-error code.

### 12.2 `run`

Required options:

- `--format terminal,markdown,json`;
- `--output <directory>`;
- `--fail-on <severity>`;
- `--seed <integer>` or pack-declared seed;
- `--request-timeout-ms <integer>`;
- `--max-run-ms <integer>`;
- `--allow-unsafe-probes` only when explicitly required;
- `--no-color` for CI.

Input behavior:

- a YAML file runs one pack;
- a directory recursively loads pack YAML files but must reject fixture-only YAML when passed as a pack directory unless an explicit fixture path is used;
- invalid or empty directories produce a helpful configuration error;
- files are run in stable sorted order;
- one failed pack does not prevent report generation for remaining packs unless a fatal process error occurs.

### 12.3 `init`

Required behavior:

- support simple executable plus argument parsing;
- do not claim to parse arbitrary shell syntax;
- write a valid starter pack;
- print the exact created path;
- never overwrite an existing pack without an explicit flag;
- offer `--force` only if overwrite semantics are clearly documented;
- preserve user files in the target directory.

### 12.4 `discover`

Required behavior:

- use the same environment and client safety policy as `run`;
- show tool manifest in terminal or JSON;
- redact descriptions/metadata if they contain secret-shaped values;
- close the server cleanly;
- classify spawn, initialization, protocol, and transport failures.

### 12.5 `doctor`

Must check:

- Node version;
- package build availability;
- stdio transport availability;
- output directory writeability;
- pack path resolution;
- whether the current mode enforces network denial;
- whether the process is running in a documented external sandbox;
- whether action/report settings are valid.

---

## 13. Security and trust specification

### 13.1 Threat model

The harness may execute a local command selected by a pack author and may process arbitrary tool output. Threats include:

- a target server reading inherited credentials;
- a target server reading user files through a permissive working directory;
- tool output containing secrets;
- malformed output crashing the reporter;
- a malicious fixture using path traversal;
- an unsafe effect probe mutating the target;
- a report artifact leaking sensitive evidence;
- an orphaned server process continuing after a run;
- a user misunderstanding a test observation as a security certification.

### 13.2 Environment policy

Default P0 behavior:

- do not pass the full parent environment;
- permit only the minimal platform variables needed to start a process;
- do not inherit arbitrary tokens, cloud credentials, proxy credentials, or application secrets;
- treat explicit pack `env` as user-supplied sensitive input;
- never print environment values;
- redact environment-derived error strings;
- document that `HOME`, `USERPROFILE`, filesystem access, and host networking are not complete isolation boundaries.

Recommended hardening:

- make `HOME`/`USERPROFILE` opt-in where platform behavior allows;
- offer `--sandbox-required` to refuse normal host execution;
- add a documented container/VM example for untrusted servers;
- validate `cwd` and fixture paths against an allowed project root when safe;
- reject absolute fixture paths by default unless explicitly allowed.

### 13.3 Network policy

Normal stdio mode cannot enforce host-network denial. The tool must:

- say this prominently in reports;
- never claim “offline” unless it is running in a sandbox that enforces no network;
- avoid adding HTTP transport to P0;
- document how users can run the server in a container/VM with network denial;
- provide a future sandbox adapter boundary without pretending the current process is isolated.

### 13.4 Effect-probe policy

See P0-05. The important rule is that an effect probe is a tool call, and tool calls can have side effects. The runner must make the risk explicit and visible.

### 13.5 Report policy

- redact all output formats;
- do not persist raw unredacted server responses by default;
- do not include full command-line secrets in reproduction commands;
- replace sensitive environment assignments with placeholders;
- write a warning when reproduction requires a user-supplied secret;
- never send telemetry by default;
- never upload artifacts automatically outside the explicit GitHub Action behavior.

### 13.6 Security language

Allowed language:

- “The test observed…”;
- “The declared effect did not match…”;
- “The tool annotation claims…”;
- “This fixture demonstrates a reproducible failure mode…”;
- “Run untrusted servers in an external sandbox…”

Forbidden language:

- “certified safe”;
- “secure by default” without qualification;
- “proven exploit-resistant” from a static fixture;
- “no network access” in normal stdio mode;
- “guaranteed no side effects” unless the test environment enforces that boundary.

---

## 14. Test strategy and acceptance suite

### 14.1 Test layers

#### Unit tests

Required coverage:

- JSON path access and mutation;
- YAML schema validation;
- semantic validation;
- redaction keys and values;
- redaction in every report format;
- mutation matching by tool/occurrence;
- mutation determinism;
- stale-result context isolation;
- error severity ranking;
- exit-code mapping;
- report filename collision handling;
- assertion expected/observed evidence;
- transition semantics.

#### Contract tests

Required coverage:

- MCP initialization;
- tools/list normalization;
- tools/call success;
- tools/call `isError` response;
- malformed protocol response;
- missing output schema;
- annotation normalization;
- server disconnect;
- process launch failure;
- request timeout;
- protocol version compatibility behavior.

#### Integration tests

Required coverage:

- fixture pack end-to-end;
- stdio pack end-to-end;
- duplicate invocation trace;
- retry after timeout;
- stale result;
- malformed result;
- permission denial/no effect;
- unsafe probe block;
- Markdown/JSON artifact generation;
- non-zero exit for blocking finding;
- zero exit for passing pack;
- report generation after a target failure.

#### End-to-end tests

Required environments:

- clean clone with only documented prerequisites;
- Node 20, 22, and 24;
- macOS;
- Linux;
- Windows;
- a separate sample repository invoking `action.yml`;
- a failing Action run that uploads artifacts;
- a passing Action run;
- a malformed pack Action run with configuration exit code.

#### Manual acceptance tests

Five external testers must:

1. clone the repository;
2. follow only the README;
3. run the demo;
4. explain one failure;
5. open a Markdown or JSON report;
6. create or modify one pack;
7. run one failing pack and one passing pack;
8. inspect the Action workflow;
9. answer whether they would use the tool on a real local MCP server;
10. report confusion, failed commands, and missing context.

Targets:

- 5/5 complete the demo;
- at least 4/5 understand the extra-side-effect finding without explanation;
- at least 4/5 can add a fixture in 30 minutes;
- 0/5 encounter an unredacted test secret;
- 0/5 experience an orphaned child process;
- median time to first visible failure under 10 minutes.

### 14.2 Required regression matrix

| Area | Passing case | Failing case | Required evidence |
|---|---|---|---|
| Initialization | healthy server | missing/broken command | typed error + exit 3 |
| Discovery | normalized manifest | protocol failure | JSON manifest/error |
| Timeout | read-only retry safe | write duplicated | events + effect |
| Retryable error | retry policy respected | max attempts exceeded | attempt trace |
| Malformed result | valid schema | invalid shape | result path failure |
| Stale result | fresh response | stale response reused | source/target event IDs |
| Duplicate | idempotent effect | duplicate side effect | two physical calls |
| Permission | no underlying call | configured retry behavior | blocked event |
| Probe safety | fixture/read-only probe | unsafe probe blocked | warning/error |
| Redaction | normal report | secret-shaped output | secret absent from all formats |
| CI | pass | fail | correct action status/artifact |

### 14.3 Determinism test protocol

For each representative pack:

1. run it three times;
2. remove run ID, timestamps, and nondeterministic process metadata;
3. compare event order, mutation records, effects, assertions, findings, and exit policy;
4. fail if semantic output differs;
5. document any intentionally nondeterministic field.

### 14.4 Fuzz and robustness tests

Before public announcement, add bounded fuzz cases for:

- empty YAML;
- YAML scalar instead of object;
- deeply nested JSON;
- arrays with missing paths;
- invalid Unicode;
- huge strings within a bounded test limit;
- duplicate YAML keys;
- unexpected assertion fields;
- malformed MCP content arrays;
- cyclic or non-JSON internal values where adapter casts are involved.

The runner must fail cleanly, not hang or write a partial misleading report.

---

## 15. CI and GitHub Action scope

### 15.1 Repository CI

The repository workflow must:

- run on pull requests and pushes;
- use least-privilege `contents: read` permissions;
- install with `npm ci`;
- typecheck/build;
- run unit/integration tests;
- run the demo;
- upload demo reports;
- run dependency audit or an explicit documented alternative;
- test Node 20, 22, and 24;
- test Linux, macOS, and Windows before v0.1 announcement;
- avoid exposing secrets to fork pull requests;
- avoid relying on uncommitted `dist` output.

### 15.2 Composite Action

The Action must:

- install the action package reproducibly;
- build the CLI from source;
- run packs from the calling repository;
- pass `path`, `format`, `output`, and `fail-on` inputs;
- upload artifacts even after a failing run;
- preserve the failing exit code;
- emit a clear safety/network warning;
- work on supported GitHub-hosted runners;
- document that consuming workflows should pin the Action to a commit or release tag;
- avoid requiring a token by default;
- avoid PR comments in P0.

### 15.3 Action sample repository test

Create a temporary or dedicated sample repository with:

- one passing fixture pack;
- one intentional failing pack;
- the Action reference;
- artifact upload;
- expected check status;
- README instructions.

Acceptance:

- passing sample workflow is green;
- failing sample workflow is red;
- failed run still exposes Markdown and JSON artifacts;
- no repository secret is needed;
- fork pull requests do not gain write permissions.

### 15.4 Action pinning

Before stable release:

- pin `actions/checkout`;
- pin `actions/setup-node`;
- pin `actions/upload-artifact`;
- document update procedure;
- consider Dependabot GitHub Actions updates;
- use a release tag for the Agent Crash Test Action only after a release exists.

For experimental v0.1, tags may be acceptable in examples, but the README must say that commit pinning is preferred for production CI.

---

## 16. Cross-platform and package readiness

### 16.1 Supported platform policy

Choose and document the actual v0.1 support matrix:

- macOS latest supported GitHub runner;
- Ubuntu latest supported GitHub runner;
- Windows latest supported GitHub runner;
- Node 20, 22, 24.

If Windows support is not ready, do not advertise it as supported. Mark it experimental and list the known limitations.

Check specifically:

- path resolution;
- executable command parsing;
- stdio child process behavior;
- shell quoting;
- environment variable names;
- temporary directories;
- line endings;
- output encoding;
- `npm` script wildcard behavior;
- Action `bash` shell availability;
- report filename normalization.

### 16.2 Package decision

Make one explicit decision before public release:

#### Option A — GitHub-first source release

- keep `private: true`;
- README begins with clone/install/build commands;
- do not advertise `npx`;
- Action builds from the checked-out source;
- publish no npm package yet;
- revisit npm after name and API stabilize.

#### Option B — npm CLI release

- check package name availability;
- remove or revise `private: true`;
- define `files`/`.npmignore` intentionally;
- decide whether `dist` is committed or built during publish;
- test `npm pack` and install into a clean directory;
- test `npx agent-crash-test demo`;
- document package versioning and deprecation policy;
- ensure source maps and licenses are handled intentionally;
- publish only after a real owner and release process exist.

Recommended for the first public source launch: Option A, followed by npm publication once the pack/report API has external validation.

### 16.3 Cross-platform scripts

Replace Unix-only scripts or document their limitation:

- `npm run clean` uses the cross-platform `scripts/clean.mjs` Node implementation;
- shell glob behavior may differ across operating systems;
- Action uses Bash explicitly;
- command strings with quotes are not a full shell parser.

Preferred approach: use small Node scripts for clean/build/test orchestration or use Node’s test discovery in a platform-neutral way.

---

## 17. Repository and documentation reconciliation

Before public launch, this file becomes the source of truth. Existing documents should be updated so they do not contradict implementation.

### Required updates

- Mark implemented P0 items in [15-roadmap-and-issue-backlog.md](15-roadmap-and-issue-backlog.md) or rewrite its checklist as historical/completed work.
- Correct [25-implementation-audit.md](25-implementation-audit.md) so it says the Action uploads artifacts if that behavior remains.
- Correct the README Action section: do not instruct users to upload artifacts in a following step if the Action already uploads them, or clearly call the following step optional.
- Update test counts in the implementation audit after final tests.
- Update [22-repo-checklist.md](22-repo-checklist.md) to distinguish “must complete before public source” from “stable release only.”
- Mark `npx` as intentionally deferred if Option A is selected.
- Add Windows/macOS support claims only after validation.
- Keep P1/P2 features clearly labeled as deferred.
- Ensure LinkedIn content does not claim PR comments, model execution, or tool-poisoning detection in v0.1.
- Ensure launch copy says “observed failure” rather than “security proof.”

### Required public files

Already present or required:

- `README.md`;
- license;
- `SECURITY.md`;
- `CONTRIBUTING.md`;
- `CODE_OF_CONDUCT.md`;
- `CHANGELOG.md`;
- versioning policy;
- issue forms;
- CI workflow;
- Action definition;
- example packs;
- test instructions;
- release notes.

Add before launch if maintained by the project:

- feature request issue form;
- `CODEOWNERS` if ownership is known;
- Dependabot configuration;
- maintainer response policy;
- support matrix;
- architecture diagram;
- demo artifact folder or linked release asset.

---

## 18. Community and maintenance readiness

### GitHub settings to configure manually

- public repository ownership;
- repository description;
- topics: `mcp`, `agents`, `ai-agents`, `testing`, `developer-tools`, `open-source`;
- issue templates enabled;
- Discussions enabled if there is a maintainer capacity to answer them;
- labels: `good first issue`, `help wanted`, `fixture`, `false positive`, `security`, `documentation`, `P1`, `P2`;
- security policy visibility;
- branch protection for main;
- required CI checks;
- code review requirement if there is a team;
- release permissions;
- Action permissions and workflow approval settings.

### Maintainer policy

Document:

- who owns triage;
- expected response time;
- how false positives are handled;
- what qualifies as a security report;
- whether bundled fixture contributions require tests;
- when breaking pack/report changes are allowed;
- how contributors are credited;
- how abandoned issues are labeled.

### Contribution path

A contributor must be able to:

1. copy an existing fixture;
2. change one scenario/effect/assertion;
3. run one command;
4. see pass/fail output;
5. add a test if behavior changes;
6. open a pull request without private credentials.

Target: a first fixture contribution in under 30 minutes for a developer familiar with YAML and Node.

---

## 19. Launch asset scope

### Required assets

1. 30–60 second screen recording:
   - run demo;
   - show timeout/retry;
   - show duplicate effect;
   - show failure report;
   - show remediation.
2. Animated terminal GIF or short video.
3. Before/after state-diff screenshot.
4. Architecture diagram using the component model in this file.
5. GitHub Action screenshot or artifact example.
6. One fixture contribution example.
7. One technical launch article.
8. Reviewed LinkedIn launch copy.

### Demo narrative

The demo must communicate this within 60 seconds:

1. “The server claims invoice creation is idempotent.”
2. “The response times out after the write.”
3. “The scripted runner retries.”
4. “Two invoices exist.”
5. “The report shows both physical calls and the extra effect.”
6. “The remediation is to enforce idempotency, not merely declare it.”

### Before/after example

Before:

```text
create_invoice(request_id=req_1) -> invoice inv_1
timeout returned to caller
retry create_invoice(request_id=req_1) -> invoice inv_2
Observed invoices: 2
Expected invoices: 1
```

After:

```text
create_invoice(request_id=req_1) -> invoice inv_1
timeout returned to caller
retry create_invoice(request_id=req_1) -> existing invoice inv_1
Observed invoices: 1
Expected invoices: 1
```

The screenshot/report must show the exact call sequence, not just a final “failed” label.

### LinkedIn content requirements

The launch posts should:

- lead with the failure mode, not generic AI hype;
- show real terminal/report evidence;
- say local/no API key for the core path;
- invite fixture contributions;
- avoid claiming the first or only fault-injection tool;
- avoid security certification language;
- use one primary CTA;
- link to the public repository;
- include a short demo asset.

Recommended post sequence:

1. founder launch;
2. contrarian insight: “an agent saying done is not evidence”;
3. technical demo;
4. fixture contributor request;
5. follow-up with real usage data.

---

## 20. Release and operations runbook

### T-minus 14 days

- confirm repository name and owner;
- complete correctness hardening;
- recruit five testers;
- open a private test repository or branch;
- run clean-machine install;
- start cross-platform matrix;
- begin demo recording.

### T-minus 7 days

- freeze P0 scope;
- complete Action sample repository;
- reconcile all documentation;
- finish README and screenshots;
- create feature request form;
- set GitHub labels and protection;
- prepare release notes;
- review security language.

### T-minus 2 days

- run complete `npm ci`/build/check matrix;
- run dependency audit;
- verify every README link;
- verify every example pack;
- verify report redaction with canary secrets;
- verify no production credentials/endpoints in repository;
- verify Action artifact upload;
- verify fail/pass exit codes;
- create release tag plan;
- prepare launch responses.

### Launch day

- make repository public;
- publish release/tag if using a release;
- publish demo asset;
- publish LinkedIn post;
- publish technical article;
- share in relevant communities where allowed;
- monitor installation failures;
- answer substantive issues;
- do not inflate star or download metrics.

### First 72 hours

- prioritize install blockers;
- label good-first-issue opportunities;
- merge a fixture only if it is deterministic and safe;
- collect first-user language;
- publish a short follow-up with real findings;
- track false positives separately from feature requests;
- do not add major P1 features in response to the first exciting comment without re-scoping.

### Rollback criteria

Pause the announcement or mark the release experimental if:

- a report leaks a test secret;
- the Action runs a target twice unexpectedly;
- a child process remains alive after failure;
- a failing pack exits zero;
- a passing pack exits non-zero;
- a report claims an unimplemented capability;
- an effect probe causes an unannounced side effect;
- the clean install fails on a documented supported platform.

---

## 21. Success metrics

Stars are a distribution signal, not a quality gate. Track them, but do not optimize the product around an unearned promise of 5,000 stars.

### Activation metrics

Measure within the first 30 days:

- repository visitors who run the demo, when measurable through opt-in/visible signals;
- clean quickstart completion rate;
- median time to first visible failure;
- percentage of testers who understand the failure without explanation;
- percentage of testers who can add a fixture;
- Action installation success rate;
- first-run error rate;
- number of external repositories running a pack or Action.

Targets:

- 5/5 private testers complete the demo;
- at least 4/5 understand the signature failure;
- median time to first failure under 10 minutes;
- fixture addition under 30 minutes;
- zero known secret leaks;
- zero known orphaned child processes.

### Quality metrics

- deterministic repeatability rate;
- false-positive rate from tester reports;
- report clarity score;
- percentage of failures with reproducible commands;
- percentage of failing runs with first-divergence evidence;
- percentage of reports with complete mutation records;
- number of supported-platform failures;
- time to diagnose an issue;
- time to merge a safe fixture contribution.

### Adoption metrics

Track monthly:

- stars and star velocity;
- forks;
- unique repository visitors;
- release downloads if published;
- Action usage in public repositories;
- fixture contributions;
- external issues and pull requests;
- repeat users;
- discussions and community mentions;
- number of users describing the project as a failure lab rather than a generic scanner.

### Reconsideration triggers

Reconsider positioning after three public releases if:

- fewer than 20 external repositories complete the quickstart;
- fewer than 5 users report a reproducible value event;
- installation failure exceeds 30%;
- most users describe it as a generic scanner;
- fixture contributions remain below 5 after 90 days;
- mutation results are not stable or understandable;
- the tool cannot demonstrate a meaningful extra-side-effect failure outside the bundled demo.

---

## 22. Detailed implementation backlog

The following work packages are the build order. Do not start P1 product expansion until P0-A and P0-B are complete.

### Phase 0 — establish a clean baseline

- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run demo`.
- [x] Record current test count and demo findings.
- [x] Ignore generated runtime artifacts.
- [x] Preserve the workspace without destructive Git/history operations.
- [x] Maintain the release checklist in `22-repo-checklist.md`; this workspace has no Git repository for branch creation.

**Exit:** baseline is reproducible and documented.

### Phase 1 — event trace and mutation correctness

- [x] Refactor physical-call execution so every invocation emits an event.
- [x] Add duplicate event parent/child metadata.
- [x] Add retry event metadata.
- [x] Add effect-probe event metadata.
- [x] Add mutation records for applied/not-matched/blocked mutations.
- [x] Make `call_count` count physical calls by default.
- [x] Preserve duplicate server-error evidence in the event timeline.
- [x] Scope stale responses by tool/request context.
- [x] Add deterministic mutation version and seed.
- [x] Add repeatability test suite.

**Exit:** the report cannot claim one call when two physical calls occurred.

### Phase 2 — state/effect contract correctness

- [x] Define transition schema.
- [x] Implement before/after effect values for fixture state.
- [x] Implement forbidden change detection.
- [x] Implement missing/extra/duplicate/changed transition evidence.
- [x] Identify first divergent event.
- [x] Add no-state-source validation.
- [x] Keep the invoice demo on explicit effect contracts and cover state contracts in regression fixtures.
- [x] Add tests for requested and forbidden transitions.

**Exit:** the signature demo proves extra effect semantics, not only scalar equality.

### Phase 3 — safety hardening

- [x] Centralize redaction before all report renderers.
- [x] Add terminal/Markdown redaction tests.
- [x] Expand secret key/value detectors.
- [x] Keep custom redaction patterns deferred until a safe configuration contract exists.
- [x] Implement read-only probe enforcement.
- [x] Add explicit unsafe-probe opt-in and warning.
- [x] Record probe calls.
- [x] Add sandbox boundary warning to every stdio report.
- [x] Keep HOME/USERPROFILE in the minimal compatibility environment and document that this is not isolation.
- [x] Add report tests proving secrets never appear in any output format.

**Exit:** no known test secret survives into terminal, Markdown, JSON, or error output.

### Phase 4 — process and error reliability

- [x] Define error class model.
- [x] Add request timeout configuration.
- [x] Add maximum run duration.
- [x] Add abort/cancellation handling through SDK timeouts, transport close, and signal cleanup.
- [x] Add child process termination and cleanup tests.
- [x] Give cleanup its own bounded grace period instead of inheriting a shorter run budget.
- [x] Cover malformed-protocol and initialization-timeout child cleanup with actual PID checks.
- [x] Cover a post-initialization transport disconnect and prevent it from passing through a call-count-only assertion.
- [x] Add signal cleanup handling where testable.
- [x] Map config/spawn/transport/protocol/server/assertion/internal errors to documented exits.
- [x] Runtime-validate normalized MCP `tools/list` manifests, including non-empty unique names and object-shaped schemas/annotations.
- [x] Ensure report generation still occurs on target failure.

**Exit:** no hanging or orphaned process is known in supported scenarios.

### Phase 5 — report and CLI quality

- [x] Add reproduction command to findings.
- [x] Add event timeline to terminal and Markdown.
- [x] Add first-divergence evidence.
- [x] Add expected/observed effect table.
- [x] Add mutation summary.
- [x] Add deterministic metadata.
- [x] Add report collision-resistant filenames.
- [x] Add a local sample-repository Action smoke harness; hosted GitHub execution remains an external gate.
- [x] Add empty/zero-tool/initialization-failure report behavior.
- [x] Validate report formats before execution.
- [x] Test every implemented documented exit code.
- [x] Update README examples with final output.

**Exit:** a user can diagnose and reproduce a failure from the artifact alone.

### Phase 6 — cross-platform and clean-install validation

- [x] Decide supported OS matrix.
- [x] Add macOS CI.
- [x] Add Windows CI.
- [x] Configure Node 20/22/24 on supported OSes.
- [x] Replace Unix-only npm scripts.
- [x] Test command quoting and path resolution locally.
- [x] Test clean-install commands locally.
- [x] Test clean pack run.
- [x] Decide that the GitHub-first/private-npm option makes publication not applicable to v0.1; `npm run package:check` packs the private source release, installs it into a clean consumer, and runs the installed CLI.
- [x] Test output directory permissions.
- [x] Test CRLF and UTF-8 behavior.

**Exit:** platform claims are evidence-backed.

### Phase 7 — GitHub Action and repository operations

- [ ] Build/run a separate external Action sample repository.
- [x] Add an in-repository passing Action self-test workflow.
- [x] Add an in-repository failing Action self-test workflow.
- [x] Configure artifact upload after failure.
- [ ] Test fork pull-request permissions.
- [x] Pin Action dependencies in repository workflows.
- [x] Add a tag-driven source-preview release workflow with checksum and manifest generation; GitHub execution and signing remain external.
- [x] Add Dependabot configuration.
- [x] Add feature request issue form.
- [x] Prepare the declarative label set in `.github/labels.yml`; apply labels in GitHub settings after ownership is confirmed.
- [ ] Configure Discussions if support capacity exists.
- [ ] Configure branch protection and required checks.
- [x] Add `CODEOWNERS` for the currently authenticated maintainer account; transfer/ownership confirmation remains external.

**Exit:** an external repository can adopt the Action without maintainer intervention.

### Phase 8 — documentation and launch assets

- [x] Reconcile roadmap checkboxes.
- [x] Reconcile implementation audit.
- [x] Reconcile README Action/artifact wording.
- [x] Decide GitHub-first vs npm-first distribution.
- [x] Add support matrix.
- [x] Add architecture diagram.
- [x] Add before/after report sample.
- [x] Generate the repository-owned animated terminal explainer and state-diff assets.
- [ ] Record a real demo GIF/video from the public repository and Action run.
- [x] Review LinkedIn copy.
- [x] Draft technical launch article.
- [x] Add first-72-hour response policy (owner assignment remains external).
- [x] Add the source-preview release runbook with preflight, tag, asset verification, and rollback procedure.
- [x] Add the copyable fixture contribution template and link it from the README and contribution guide.
- [x] Add passing/failing control pairs for all ten implemented P0 mutation semantics and test their stable seeds.
- [x] Confirm all local relative links; final repository-URL review remains dependent on the public remote.

**Exit:** a public visitor sees one coherent story and no stale promises.

### Phase 9 — external validation and release

- [ ] Recruit five testers.
- [ ] Run the manual evaluation script.
- [ ] Record completion time and confusion.
- [ ] Fix installation blockers.
- [ ] Fix report comprehension blockers.
- [ ] Re-run all acceptance tests.
- [x] Perform a read-only GitHub/npm name collision check; no exact target was found on 2026-08-01, but it must be rechecked immediately before publication.
- [ ] Confirm repository ownership.
- [x] Prepare source-preview release notes; final release date, owner, and tag remain external.
- [ ] Decide whether to publish npm.
- [ ] Create release tag.
- [ ] Publish repository or preview.
- [ ] Monitor first 72 hours.

**Exit:** public v0.1 announcement is defensible.

---

## 23. File-level change map

### Source changes expected

| File | Required work |
|---|---|
| `src/types.ts` | Add trace/event/mutation/report metadata and explicit error/transition types |
| `src/runner.ts` | Centralize physical invocation recording, retries, probes, lifecycle, timeout policy |
| `src/mutations.ts` | Emit duplicate/retry mutation records, context-aware stale state, deterministic metadata |
| `src/mcp-client.ts` | Typed error classification, runtime tools/list manifest validation, timeout/cancellation, safe process close, probe safety metadata |
| `src/fixture-client.ts` | Before/after state support, deterministic effect tracking, fixture error behavior |
| `src/pack.ts` | New schema fields, semantic validation, safety/transition checks, deterministic normalized hash |
| `src/command-line.ts` | Quote-aware, non-shell command splitting shared by `init` and `discover` |
| `src/assertions.ts` | True transition assertions, event evidence, expected/observed output, clearer missing values |
| `src/reporters.ts` | Centralized redaction, reproduction, timeline, first divergence, stable output, collision-safe paths |
| `src/redaction.ts` | Broader safe detectors and reusable redaction of all report strings/values |
| `src/cli.ts` | Exit-code mapping, timeout flags, format validation, platform-neutral behavior, command reproduction |
| `src/test/**` | Regression, contract, security, process, cross-platform, and report completeness tests |
| `examples/packs/**` | Update demo to exercise real transition and physical-call trace semantics |
| `examples/packs/README.md` | Copyable contributor template, safety rules, review checklist, and clean-clone verification path |

### Repository changes expected

| File/area | Required work |
|---|---|
| `package.json` | Decide npm/private mode; add lint/format/check scripts; make scripts cross-platform |
| `package-lock.json` | Keep reproducible and audited |
| `scripts/action-sample-check.mjs` | Run the copy-ready sample packs locally and verify passing/failing exits and artifacts |
| `scripts/package-check.mjs` | Pack the source release, install it into a clean consumer, and smoke-test the installed CLI |
| `scripts/release-assets.mjs` | Generate a SHA-256 checksum and machine-readable source-release manifest from one npm tarball |
| `scripts/release-assets-check.mjs` | Test release-asset generation in an isolated temporary directory |
| `action.yml` | Validate external Action behavior and pin strategy |
| `.github/workflows/ci.yml` | Add supported OS matrix and clean artifact behavior |
| `.github/workflows/release.yml` | Verify a semantic tag, run acceptance, build source-preview assets, and create the GitHub release with job-scoped write permission |
| `.github/dependabot.yml` | Monitor npm and Action dependencies |
| `.github/ISSUE_TEMPLATE/**` | Add feature request and ensure descriptions are accurate |
| `CODEOWNERS` | Add when owner/team is known |
| `README.md` | Final install story, report samples, support matrix, safety limits |
| `CHANGELOG.md` | Convert Unreleased into actual v0.1.0 notes on release |
| `22-repo-checklist.md` | Split public-source and stable-release gates |
| `15-roadmap-and-issue-backlog.md` | Mark completed baseline and preserve only true future tasks |
| `25-implementation-audit.md` | Update current facts after hardening |
| launch assets | Add GIF/video/screenshots/diagram/article |

---

## 24. Open decisions

These should be decided before the corresponding work starts. The recommended decision is included to prevent drift.

| Decision | Recommended answer | Owner | Blocking? |
|---|---|---|---|
| GitHub-first or npm-first? | GitHub-first experimental source release; npm later | Maintainer | Yes before packaging work |
| Is `no_extra_transition` P0? | Yes; implement true transition semantics | Engineering/product | Yes |
| Are physical duplicate calls visible? | Yes; always record them | Engineering | Yes |
| Are tool probes allowed without read-only annotations? | No by default; explicit unsafe opt-in only | Engineering/security | Yes |
| Does `call_count` count retries/duplicates? | Physical calls by default | Product/engineering | Yes |
| Is host networking denied? | No in normal stdio; require external sandbox for guarantee | Security/docs | Yes for wording |
| Which OSes are supported? | Node 20/22/24 on macOS/Linux/Windows if matrix passes | Maintainer | Yes before claim |
| Will the Action comment on PRs? | No in P0; artifact only | Product | No, already decided |
| Which report schema is stable? | JSON v1 after trace changes are complete | Engineering | Yes before integrations |
| Is telemetry collected? | No by default | Maintainer | Yes for trust |
| Who owns security reports? | Named maintainer/contact in public repo | Maintainer | Yes before launch |
| What is the support promise? | Best effort for experimental v0.1 | Maintainer | Yes before announcement |

---

## 25. Final release checklist

### Correctness

- [x] Every physical tool invocation has an event.
- [x] Duplicate invocation is visible as a distinct event.
- [x] Retry attempts are visible and parented.
- [x] Effect probes are visible and safe.
- [x] Stale output is context-aware.
- [x] `no_extra_transition` is a real transition assertion.
- [x] Missing, extra, duplicated, and changed effects are distinguishable through explicit state/effect evidence.
- [x] First divergence is identified where possible.
- [x] Determinism metadata is present.
- [x] Repeatability is tested semantically; the three-run manual protocol remains a release gate.

### Security

- [x] Terminal output is redacted.
- [x] Markdown output is redacted.
- [x] JSON output is redacted.
- [x] Error messages are redacted.
- [x] Environment inheritance is minimal and documented.
- [x] Unsafe probes are blocked unless explicitly opted in.
- [x] Network-boundary warning is prominent and accurate.
- [x] No telemetry is sent by default.
- [x] No production credentials/endpoints are bundled.
- [x] Child processes are cleaned up.

### Reports and CLI

- [x] Reproduction command is present.
- [x] Mutation summary is present.
- [x] Timeline is present.
- [x] Expected vs observed values are present.
- [x] JSON report is versioned.
- [x] Report filenames cannot collide silently.
- [x] Pass/fail/config/transport/internal exit-code paths are implemented; internal error remains a defensive fallback.
- [x] Empty and initialization-failure reports are valid.

### Platform and CI

- [x] Clean-install commands succeed locally.
- [ ] Node 20/22/24 succeed in an executed external matrix.
- [x] Linux/macOS/Windows matrix is configured; external runner evidence remains required.
- [x] In-repository Action self-test has passing and failing workflows.
- [x] Failed Action is configured to upload artifacts.
- [x] Fork PR workflow permissions are least-privilege by configuration.
- [x] Dependency audit passes locally with no production exceptions.
- [x] Source-preview release workflow generates checksums and a machine-readable manifest; GitHub execution and signing remain external.

### Repository

- [ ] Repository owner confirmed for publication externally; the current authenticated account is prepared in `CODEOWNERS`.
- [ ] README reviewed by someone who did not build it.
- [x] License present.
- [x] Security policy present.
- [x] Contribution guide present.
- [x] Code of conduct present.
- [x] Changelog prepared.
- [x] Versioning policy present.
- [x] Feature request form present.
- [ ] Labels configured.
- [ ] Discussions decision made.
- [x] Maintainer response policy present.
- [ ] Branch protection configured externally.
- [x] Dependabot or equivalent configured.

### Launch

- [x] Repository-owned demo explainer exists.
- [ ] Real demo GIF/video from the public repository exists.
- [x] Before/after artifact/example exists.
- [x] Architecture diagram exists.
- [x] Technical launch article exists.
- [x] LinkedIn posts reviewed.
- [ ] Five external testers completed the quickstart.
- [ ] First-72-hour owner is assigned.
- [x] Source-preview release notes are prepared.
- [ ] Release tag and final release notes are created under the confirmed repository owner.
- [x] No claim implies a 5,000-star guarantee.

---

## 26. Exact verification runbook

Run from a clean clone.

```bash
npm ci
npm run typecheck
npm test
npm run demo
npm audit --omit=dev
npm run workflow:check
npm run release:check
```

Build and inspect the CLI:

```bash
npm run build
node dist/cli.js help
node dist/cli.js doctor
node dist/cli.js discover --stdio "node dist/examples/broken-invoice-server.js" --format json
```

Run a passing fixture:

```bash
node dist/cli.js run examples/packs/fixture-duplicate-call.yaml \
  --format terminal,markdown,json \
  --output artifacts/agent-crash-test
```

Run an intentionally failing pack and verify non-zero status:

```bash
node dist/cli.js run examples/packs/timeout-retry-duplicates.yaml \
  --format terminal,markdown,json \
  --output artifacts/agent-crash-test
```

The integration suite also runs the ten mutation control pairs under
`examples/controls/`, proving that each P0 mutation has a healthy baseline and
an intentionally failing expectation.

Verify unsupported P1 behavior is explicit:

```bash
node dist/cli.js record
```

Inspect artifacts for:

- no raw test secrets;
- reproduction command;
- complete physical event trace;
- mutation records;
- expected/observed values;
- warnings and network boundary;
- stable JSON schema.

Then run the same commands on every supported OS and Node version.

---

## 27. What not to build before the hardening sprint is complete

Do not begin:

- HTTP transport;
- OAuth;
- replay proxy;
- local model integration;
- real-agent integration;
- prompt-injection challenge packs;
- PR comments;
- hosted dashboard;
- badges;
- large fixture corpus;
- desktop integrations;
- auto-fix patches;
- benchmark index.

The current product becomes more valuable by making one failure contract trustworthy. Additional surface before that point increases the number of ways the project can appear impressive while producing incomplete evidence.

---

## 28. Final decision rule

Open the repository publicly when the P0-A correctness/safety gates and basic source-repository gates pass.

Announce v0.1 only when the external validation and launch gates pass.

Do not wait for every P1 feature. Do not ship the current prototype unchanged and call it production-ready.

The release is ready when a stranger can run one command, observe a real extra-effect failure, understand exactly what happened, reproduce it, see no leaked secret, add a fixture, and run the same contract in CI.
