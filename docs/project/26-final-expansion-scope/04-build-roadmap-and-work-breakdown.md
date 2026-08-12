# Build Roadmap and Work Breakdown

**Purpose:** Turn the second- and third-pass scope into an executable sequence.
**Planning model:** Now / Next / Later, with explicit gates and cut lines.
**Rule:** Every new commitment must identify its dependency and the work it displaces if capacity is limited.

---

## 1. Roadmap thesis

The project should not attempt to build every possible agent-testing capability. The build must proceed from the existing trusted foundation toward the smallest broadly useful expansion:

```text
Stable v0.1 baseline
  → versioned normalized contracts
  → real-client proxy
  → capture and starter packs
  → effect/state adapter layer
  → CI and language interoperability
  → community corpus
  → optional ecosystem integrations
```

The critical path is not “more mutations.” It is:

1. real-client execution;
2. semantic mutation fidelity;
3. state evidence;
4. low-friction onboarding;
5. repeatable external validation.

---

## 2. Milestone overview

| Milestone | Theme | Outcome | Exit gate |
|---|---|---|---|
| E0 | Baseline freeze | v0.1 behavior is pinned and documented | Existing acceptance suite passes from clean environments |
| E1 | Contract foundation | Protocol-neutral event/effect/report contracts exist | Fixture and MCP paths produce equivalent normalized semantics |
| E2 | Real-client proxy | Actual MCP client can be tested without source changes | Proxy catches a controlled duplicate-side-effect regression |
| E3 | Capture and observers | User can generate a pack and verify external test state | Captured pack plus observer produces a trustworthy finding |
| E4 | CI and distribution | External repositories can install and run the tool | Clean sample repositories pass and fail correctly |
| E5 | Community corpus | Reusable, reviewed failure assets exist | Corpus review and contribution workflow operate without author pairing |
| E6 | Interoperability | Other language/tooling ecosystems can consume contracts | Python and JavaScript examples run the same conceptual case |
| E7 | Public expansion release | Product is broadly useful and honestly positioned | Public launch gates and external validation complete |

---

## 3. E0 — Baseline freeze

### Objective

Protect the current implementation while expansion work begins.

### Work items

#### E0-01 — Freeze current v0.1 contract

- record supported commands;
- record pack schema v1;
- record mutation behavior and names;
- record report schema v1;
- tag or archive a baseline release candidate;
- identify intentional failures and controls;
- capture current acceptance output.

**Acceptance:** A clean checkout can reproduce the current v0.1 pass/fail matrix.

#### E0-02 — Add compatibility fixtures

- one passing fixture for each existing mutation;
- one failing fixture for each existing mutation;
- one report fixture per renderer;
- one old pack migration fixture;
- one malformed pack fixture per major validation class.

**Acceptance:** Future engine changes can be compared against a stable golden corpus.

#### E0-03 — Document current boundary

The README and release notes must clearly state:

- scripted versus real-client behavior;
- local fixture versus stdio determinism;
- network-boundary limitations;
- unsupported P1 commands;
- no security certification claim.

**Acceptance:** Five external readers correctly explain what v0.1 does and does not test.

### E0 exit gate

No expansion work may change the v0.1 baseline semantics without a versioned decision and updated compatibility evidence.

---

## 4. E1 — Protocol-neutral contract foundation

### Objective

Move MCP-specific assumptions to the adapter boundary.

### Work items

#### E1-01 — Define normalized event schema

- add schema version;
- add run ID and operation ID;
- distinguish logical and physical calls;
- add mutation phase;
- add commit/response status;
- add observer events;
- define sequence and parent-child semantics;
- validate bounded JSON values.

**Dependencies:** Existing event model and report schema.
**Acceptance:** Existing fixture and MCP runs emit the same normalized event categories for equivalent behavior.

#### E1-02 — Define effect contract v2

- add effect class;
- add intended and forbidden transitions;
- add cardinality;
- add ordering;
- add authorization/approval expectation;
- add recovery expectation;
- preserve v1 state contracts through an adapter.

**Acceptance:** The contract can express create-once, update-without-lost-write, send-after-confirmation, and deploy-once cases.

#### E1-03 — Define adapter capability metadata

- adapter ID and version;
- supported transport;
- real-client support;
- mutation phase support;
- observer support;
- deterministic classification;
- sandbox requirement;
- unsupported behavior.

**Acceptance:** A report makes it impossible to mistake a fixture-only run for a real-client run.

#### E1-04 — Define migration and compatibility rules

- pack v1 loader;
- report v1 renderer compatibility;
- mutation aliases where necessary;
- clear unsupported status;
- migration diagnostics.

**Acceptance:** All existing examples run without manual edits.

### E1 exit gate

No proxy or capture code is allowed to invent separate assertion or report semantics.

---

## 5. E2 — Real-client transparent proxy

### Objective

Exercise real local MCP clients and agents without requiring their source code to be rewritten.

### Work items

#### E2-01 — Client-facing proxy transport

- accept client-facing stdio traffic;
- start and connect to target server;
- forward initialization;
- forward discovery;
- forward calls and responses;
- preserve message framing;
- handle target EOF and malformed messages;
- close both sides safely.

**Acceptance:** A standard MCP client can use the proxy as if it were the target server.

#### E2-02 — Physical event recorder

- record client-to-proxy messages;
- record proxy-to-target messages;
- record target-to-proxy responses;
- record proxy-to-client responses;
- assign operation and event IDs;
- mark forwarded, mutated, duplicated, dropped, and malformed events.

**Acceptance:** A report shows the exact difference between a client-visible retry and the underlying physical calls.

#### E2-03 — Proxy mutation phases

Implement in this order:

1. response delay/timeout;
2. retryable error;
3. malformed result;
4. stale result;
5. duplicate physical call;
6. permission denial;
7. commit-then-response-lost;
8. disconnect-after-commit.

**Acceptance:** Each mutation has a control, a deterministic seed, a semantic explanation, and a phase-specific report.

#### E2-04 — Process lifecycle

- target startup timeout;
- target hang timeout;
- target crash;
- proxy interruption;
- child process cleanup;
- bounded stderr capture;
- orphan-process detection in tests;
- partial report on abnormal termination.

**Acceptance:** No test leaves an orphaned target process under supported platforms.

#### E2-05 — Proxy configuration and safety

- explicit target command;
- minimal environment by default;
- explicit environment opt-in;
- working-directory policy;
- target trust level;
- unsafe observer flag;
- optional external sandbox command;
- warning when host network is not blocked.

**Acceptance:** The user can understand what code will run and what it can access before execution.

### E2 exit gate

An external tester can configure a real local client to use the proxy and reproduce a duplicate effect without changing client source code.

---

## 6. E3 — Capture and state observers

### Objective

Remove hand-authoring friction while keeping effect contracts explicit and safe.

### Work items

#### E3-01 — Capture session

- capture discovery and calls;
- redact before persistence;
- bound size and duration;
- annotate nondeterminism;
- support cancellation;
- create capture envelope;
- display trust and data-boundary warnings.

**Acceptance:** A clean local session produces a reviewable capture without secrets.

#### E3-02 — Starter-pack generator

- infer steps;
- infer tool names and arguments;
- preserve ordering;
- create mutation placeholders;
- create observer placeholders;
- mark incomplete contracts;
- generate a human-readable review checklist.

**Acceptance:** A user can move from capture to first runnable pack without manually translating the entire trace.

#### E3-03 — Fixture state observer

- maintain current behavior;
- add before/after snapshots;
- expose normalized deltas;
- identify observer errors.

**Acceptance:** Existing fixture tests remain deterministic and reports include state evidence.

#### E3-04 — JSON snapshot observer

- execute an explicitly declared local command;
- pass only pack-owned inputs;
- bound output and duration;
- redact output;
- classify safety;
- fail closed when required.

**Acceptance:** A test repository can observe a local test database or file state through a controlled adapter without production credentials.

#### E3-05 — Observer SDK

- define `before`, `after`, and `diff` methods;
- define safety and isolation metadata;
- define failure semantics;
- include TypeScript reference implementation;
- include language-neutral JSON contract.

**Acceptance:** A contributor can implement a custom observer without modifying the core runner.

### E3 exit gate

At least one non-fixture observer demonstrates a real state delta, and an observer failure cannot create a false pass.

---

## 7. E4 — CI and distribution

### Objective

Make the expanded tool a normal dependency of open-source repositories.

### Work items

#### E4-01 — JUnit reporter

- suite and test names;
- pass/fail/skipped/inconclusive status;
- duration;
- failure message;
- mutation and finding metadata;
- safe truncation;
- stable output order.

**Acceptance:** At least two CI parsers consume the result without custom transformation.

#### E4-02 — GitHub summary

- pass/fail headline;
- count by severity;
- first divergent event;
- expected/observed delta;
- remediation;
- reproduction command;
- artifact links;
- warning for inconclusive or unsupported cases.

**Acceptance:** A reviewer can understand a failure from the check summary without downloading raw JSON.

#### E4-03 — Stable finding fingerprints

- canonical normalized inputs;
- no timestamps or absolute paths;
- schema-major inclusion;
- mutation version inclusion;
- collision tests;
- documented changes when fingerprints evolve.

**Acceptance:** The same logical regression is recognized across repeated CI runs.

#### E4-04 — Public package and release artifacts

- remove private-package barrier at the approved release point;
- publish versioned npm package;
- publish release archives/binaries where feasible;
- publish checksums;
- publish SBOM;
- publish provenance/attestation where supported;
- document install paths;
- test uninstall/reinstall and clean cache behavior.

**Acceptance:** A clean machine can run the demo using the documented one-line path.

#### E4-05 — Action hardening

- pin internal actions by commit;
- minimal permissions;
- explicit Node/runtime behavior;
- artifact upload on failure;
- no secret printing;
- separate sample repository;
- release tag and SHA usage documentation.

**Acceptance:** The Action runs in a separate consumer repository on both pass and fail scenarios.

### E4 exit gate

Three clean consumer repositories can install or invoke the tool and receive correct CI status/artifacts without maintainer intervention.

---

## 8. E5 — Community corpus and contributor engine

### Objective

Turn the repository into a reusable public library of failure cases.

### Work items

#### E5-01 — Corpus taxonomy

Organize packs by:

- effect class;
- mutation class;
- protocol/adapter;
- language;
- state observer;
- severity;
- determinism;
- authorization requirement.

#### E5-02 — Canonical packs

Create at least 20 carefully reviewed packs across:

- create;
- update;
- delete;
- send;
- approve;
- deploy;
- publish;
- read/stale data;
- permission denial;
- duplicate and ambiguous outcome.

#### E5-03 — Contribution workflow

- fixture template;
- pack validator;
- passing and failing controls;
- redaction check;
- deterministic seed check;
- remediation requirement;
- review checklist;
- issue form;
- contributor attribution.

#### E5-04 — Community operations

- CODEOWNERS for core and corpus;
- labels by mutation/effect/adapter;
- monthly fixture challenge;
- failure-of-the-week post;
- office hours or async review thread;
- release notes crediting authors;
- clear security-report path.

### E5 exit gate

A contributor who did not write the engine can submit a valid fixture PR using the documented path and receive a consistent review.

---

## 9. E6 — Interoperability

### Objective

Make the contracts usable outside the TypeScript/MCP implementation.

### Work items

#### E6-01 — Generic JSONL bridge

Implement the minimal external event stream and validate it strictly.

#### E6-02 — Python wrapper

- `pytest` integration;
- fixture discovery;
- normal test failure mapping;
- JUnit support;
- example agent/client;
- documentation for virtual environments and `pipx`.

#### E6-03 — JavaScript wrapper

- Node test helper;
- Vitest or Jest example;
- direct package API where stable;
- Action usage.

#### E6-04 — OpenTelemetry exporter

- map operation and tool-call spans;
- preserve mutation and finding attributes;
- redact content by default;
- document trace-size and privacy implications;
- test with a local collector.

#### E6-05 — Import/export adapters

Evaluate compatibility with existing recorder/replay formats. Implement only formats with a clear user path and stable semantics.

### E6 exit gate

The same conceptual test case can be executed from Python and JavaScript, and a third-party contributor can understand how to add another adapter.

---

## 10. E7 — Public expanded release

### Objective

Launch the expanded product only after it can defend its claims.

### Required evidence

- clean installation;
- cross-platform core path;
- real-client proxy;
- capture;
- state observer;
- mutation controls;
- JUnit and GitHub summary;
- public package or release artifact;
- external consumer repositories;
- external tester feedback;
- complete documentation map;
- support and security processes;
- demo and launch assets.

### E7 exit gate

All P0 requirements and external gates in [05-test-strategy-and-perfection-gates.md](05-test-strategy-and-perfection-gates.md) pass.

---

## 11. Parallel workstreams

### Workstream A — Core contracts

E0, E1, migration, schema, versioning.

### Workstream B — Proxy and process lifecycle

E2 transport, mutation phases, cleanup, safety.

### Workstream C — Capture and observers

E3 capture envelope, generator, observers, SDK.

### Workstream D — Reporting and CI

JUnit, summary, fingerprints, Action, release artifacts.

### Workstream E — Ecosystem and community

Python/JavaScript examples, corpus, docs, governance, launch.

Workstreams may proceed in parallel after E1 contracts stabilize. No adapter or reporter may bypass the shared normalized event and finding model.

---

## 12. Capacity-based cut plan

### If capacity is very limited

Ship only:

- normalized contracts;
- one real-client MCP proxy;
- two ambiguous-outcome mutations;
- capture-to-starter-pack;
- one state observer beyond fixtures;
- JUnit;
- GitHub summary;
- one Python and one JavaScript example.

Cut:

- optional SARIF;
- OpenTelemetry export;
- binaries;
- broad corpus expansion;
- HTTP adapter.

### If proxy is technically blocked

Do not pretend the scripted runner exercises real agent decisions. Release a clearly labeled “scripted MCP reliability preview,” keep the generic adapter design, and run a time-boxed proxy investigation before committing to more features.

### If capture is unreliable

Ship a high-quality `init` wizard and a manually curated starter corpus, but do not call the result automatic capture. Capture must never produce misleading tests.

### If state observers are unsafe

Keep fixture and explicit read-only probes, document the limitation, and do not add arbitrary command observers until isolation and redaction are proven.

---

## 13. Roadmap review cadence

### Weekly

- P0 progress;
- failing tests and flaky tests;
- proxy/process incidents;
- new external feedback;
- scope additions and removals.

### Monthly

- activation funnel;
- external repository usage;
- corpus contributions;
- false positives and inconclusive runs;
- competitive and ecosystem changes;
- release readiness.

### At every milestone gate

- verify acceptance evidence;
- update the decision log;
- remove stale claims from README and launch content;
- explicitly decide whether the next milestone remains justified.

---

## 14. Definition of roadmap success

The roadmap is successful when each milestone produces user-visible value, not merely internal infrastructure:

- E1 makes behavior portable;
- E2 tests real clients;
- E3 makes authoring easy and observation trustworthy;
- E4 makes CI adoption routine;
- E5 makes contribution and reuse possible;
- E6 makes the tool language- and ecosystem-friendly;
- E7 launches an honest, durable open-source product.
