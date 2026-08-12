# Second-Pass Product Scope

**Purpose:** Translate the second-pass review into concrete product requirements.
**Relationship to current repository:** Extends, rather than replaces, the v0.1 MCP stdio and fixture runner.
**Priority language:** P0 = required for broad usefulness; P1 = high-value follow-up; P2 = intentionally deferred.

---

## 1. Second-pass conclusion

The current implementation has the right core insight: tool failures are often dangerous because the observable response does not tell the whole story. A write may commit before a timeout, a retry may create a duplicate, a stale result may be paired with a new request, or a permission error may be treated as success.

The main weakness is not the mutation list or the report model. It is the distance between the tool and the user’s real workflow:

- the user must usually author a pack before seeing value;
- the current v0.1 runner is primarily scripted rather than transparent to an existing agent/client;
- the state model is excellent for fixtures but harder to apply to arbitrary test systems;
- the core contract is MCP-shaped even though the underlying problem is broader;
- the installation path is Node-oriented and the public package/release path is not yet the easiest route for every language community;
- the project needs stronger interoperation with existing replay, trace, and CI systems;
- the community corpus is a promise rather than yet a broad, maintained asset.

The second pass therefore focuses on adoption friction, actual client behavior, portable contracts, and repeatable evidence.

---

## 2. Product problem statement

### 2.1 User problem

Open-source developers are increasingly building applications in which an agent chooses and invokes tools. Existing tests often verify one of the following:

- the tool returns the expected output;
- the MCP server satisfies protocol shape requirements;
- a trace can be recorded or replayed;
- a model produces a plausible final answer;
- a benchmark score is above a threshold.

Those checks do not consistently answer whether the requested real-world effect happened exactly once when the tool timed out, returned malformed data, returned stale data, failed after committing, or was retried.

### 2.2 Cost of not solving it

Without an effect-level failure harness:

- duplicate writes may reach production;
- teams may silently rely on untrusted annotations;
- failures may be discovered only through user reports or operational incidents;
- maintainers must repeatedly invent local scripts for the same failure classes;
- regression fixes remain anecdotal rather than executable;
- open-source projects lack a shared vocabulary for agent-side-effect correctness.

### 2.3 Product opportunity

Make realistic failures cheap to inject, make state differences explicit, and turn each discovered incident into a portable regression fixture that can run in local development and CI.

---

## 3. Target users and second-pass jobs

### 3.1 MCP server maintainer

**Job:** Verify that a server’s write tools remain safe under timeouts, retries, disconnects, and malformed responses.

**Required outcome:** The maintainer can run a transparent proxy against the real server and see the physical calls and state transition.

### 3.2 Agent application developer

**Job:** Verify that the actual client/agent handles ambiguous tool outcomes correctly.

**Required outcome:** The developer can exercise the existing agent without replacing it with a specially scripted test runner.

### 3.3 Framework maintainer

**Job:** Provide a reusable test harness for users of a framework without adopting Agent Crash Test’s implementation language.

**Required outcome:** A stable adapter contract, JSONL bridge, and one reference integration are available.

### 3.4 CI or release maintainer

**Job:** Fail a check when a known effect contract regresses and retain useful artifacts for review.

**Required outcome:** JUnit, Markdown, JSON, and GitHub-native summaries work without a hosted account.

### 3.5 Open-source contributor

**Job:** Add one failure scenario or control fixture without learning the whole codebase.

**Required outcome:** A contribution template, schema validation, fixture tests, review rubric, and example pack exist.

---

## 4. P0 requirements

### P0-01 — Transparent local MCP proxy

#### Requirement

Provide a local process that can sit between an existing MCP client/agent and a target MCP stdio server. It must observe and forward the protocol traffic while applying controlled mutations to the target response or transport behavior.

#### Required behavior

- start a target MCP stdio server;
- expose a proxy endpoint or stdio interface usable by an existing MCP client;
- forward initialization and tool discovery;
- record both logical client requests and physical target calls;
- inject faults at explicit phases;
- preserve correlation between client-visible request, target request, response, and mutation;
- terminate the target cleanly on completion, timeout, or interruption;
- emit a deterministic run report;
- avoid requiring changes to the user’s agent source code.

#### Acceptance criteria

- Given an existing MCP client configured to talk to a proxy, when it invokes a target tool, then the target receives the expected request and the proxy records both directions.
- Given a write tool that commits before returning, when `commit_then_response_lost` is injected, then the client sees the configured failure while the state observer can prove whether the write committed.
- Given a client that retries after a timeout, when the retry occurs, then the report distinguishes the original physical call from the retry.
- Given a proxy run is interrupted, then the target process is closed or killed within the documented grace period and the report identifies cleanup status.
- Given a target returns malformed protocol data, then the proxy reports a typed protocol failure without hanging.

#### Non-goals

- remote HTTP or OAuth targets in the first proxy release;
- host-wide network isolation;
- transparent interception of arbitrary desktop applications;
- model-level evaluation.

#### Dependencies

- normalized event contract;
- mutation phase model;
- process lifecycle hardening;
- redaction and safety policy.

---

### P0-02 — Capture a successful workflow

#### Requirement

Allow a user to record a local, authorized, successful MCP interaction and generate a starter pack that can be edited and replayed.

#### Required behavior

- capture tool discovery and calls;
- allow the user to provide or confirm the scenario name;
- redact secrets before writing the capture;
- record whether the capture is deterministic, partial, or nondeterministic;
- generate a pack with placeholder effect contracts where state observation is not available;
- clearly mark placeholders as incomplete rather than silently treating them as assertions;
- support a dry-run preview before writing files;
- preserve a stable source hash and capture metadata;
- never upload captured content by default.

#### Acceptance criteria

- Given a healthy local MCP server, when capture completes, then the user receives a valid starter pack and a human-readable summary of captured tools.
- Given the captured trace contains token-shaped values, then those values are absent from all persisted artifacts.
- Given no effect observer is configured, then the generated pack contains an explicit “effect contract required” warning.
- Given the user cancels or rejects the capture, then no pack is written or an incomplete file is clearly marked as such.
- Given the capture includes multiple calls, then ordering, arguments, and response summaries are preserved without exposing unsafe raw content.

#### Design decision

Capture is a starting-point generator, not a claim that observed behavior is correct. The generated pack must require explicit review of intended and forbidden effects.

---

### P0-03 — Protocol-neutral normalized contract

#### Requirement

Define the internal and serialized concepts around tool calls, outcomes, mutations, effects, and findings independently of MCP-specific wire details.

#### Required concepts

- logical operation;
- physical invocation;
- tool request;
- tool result or failure;
- mutation and mutation phase;
- state snapshot;
- effect transition;
- assertion;
- finding;
- reproduction metadata;
- determinism and data-boundary metadata.

#### Acceptance criteria

- The assertion engine can consume normalized events from MCP stdio and fixture clients without branching on raw protocol details.
- A second adapter can emit the normalized event model without importing the MCP SDK.
- Reports identify the adapter and protocol separately from the effect/finding semantics.
- Schema versioning allows a v1 pack to remain runnable while a v2 pack adds phase and effect metadata.

---

### P0-04 — Pluggable state observers

#### Requirement

Make state observation an explicit interface with safe, test-only implementations. The runner must not assume that a tool response or annotation proves what happened.

#### First observer types

1. fixture state observer;
2. declared read-only tool probe;
3. local JSON snapshot command with explicit opt-in;
4. test database/file observer through a documented adapter interface.

#### Required safety controls

- explicit observer declaration;
- timeout and output-size limit;
- redaction before persistence;
- no implicit credential inheritance;
- clear unsafe/external-boundary status;
- before/after snapshots;
- diff normalization and stable path ordering;
- failure when the observer cannot establish the expected evidence, unless the pack explicitly allows an inconclusive result.

#### Acceptance criteria

- A pack cannot silently pass a required effect assertion when the observer failed.
- A probe’s declared read-only annotation is treated as a claim, not proof.
- A snapshot observer records source, timestamp, redaction status, and error state.
- The report distinguishes “effect absent,” “effect present,” and “effect could not be observed.”

---

### P0-05 — Ambiguous-outcome mutation family

#### Requirement

Add mutations that model the most important real-world failure: the caller cannot tell whether the side effect occurred.

#### Required initial mutations

- `commit_then_response_lost`;
- `disconnect_after_commit`;
- `partial_success`;
- `stale_read_then_conflicting_write`;
- `approval_bypassed` as a controlled workflow assertion rather than an arbitrary security scanner.

#### Mutation phase vocabulary

- `before_underlying_call`;
- `during_underlying_call`;
- `after_commit_before_response`;
- `after_response_before_client`;
- `client_visible_transport_failure`;
- `observer_only`.

#### Acceptance criteria

- Every mutation declares its phase and whether the underlying call may have committed.
- Every mutation has a passing control and a failing control.
- Every mutation has a stable seed, explanation, remediation, and serialization version.
- A mutation cannot be reported as “timeout” when the actual semantic condition is “response lost after commit.”

---

### P0-06 — CI-native reporting

#### Requirement

Make reports immediately useful in common open-source CI systems.

#### Required outputs

- terminal summary;
- Markdown artifact;
- versioned JSON;
- JUnit XML;
- GitHub Actions step summary;
- exact reproduction command;
- stable finding fingerprint.

#### Acceptance criteria

- A failing pack produces a non-zero exit code while still writing reports.
- JUnit consumers can identify suite, test, duration, failure, and skipped/inconclusive status.
- GitHub summary shows the first divergence and a concise remediation without requiring the artifact download.
- Re-running the same pack and seed produces the same finding fingerprint when the environment is unchanged.

#### Deliberate sequencing

SARIF may follow as an opt-in adapter. It must not be the default because findings are behavioral reliability results, not automatically code vulnerabilities.

---

### P0-07 — Distribution without language lock-in

#### Requirement

Make the tool easy to install and invoke from repositories that do not use TypeScript.

#### Required distribution forms

- public npm package and `npx` path;
- GitHub Action;
- versioned release archives or binaries for supported platforms;
- documented Docker/Podman option;
- generic JSONL adapter contract;
- one Python consumer example;
- one JavaScript consumer example.

#### Acceptance criteria

- A clean machine can install and run the demo without cloning the repository.
- The Action can run without requiring users to build the project manually.
- Release artifacts include checksums, version metadata, license, and security notes.
- The documentation states exactly which features require Node, Docker, or an adapter.

---

### P0-08 — Canonical failure corpus

#### Requirement

Ship a small but high-quality corpus that demonstrates why the project exists across common side-effect types.

#### Initial categories

- create exactly once;
- update without overwriting a newer value;
- send only after confirmation;
- delete only with authorization;
- approve only after required lookup;
- deploy once despite an uncertain response;
- append to a file or queue exactly once;
- reject a denied action without compensating side effects.

#### Acceptance criteria

- Each category has at least one passing control and one intentionally broken control.
- Every pack runs offline with no production credentials.
- Every pack has a story, expected effect, forbidden effect, remediation, and contribution metadata.
- At least five fixtures are understandable to a developer who has never seen MCP.

---

## 5. P1 requirements

### 5.1 Generic JSONL execution bridge

Define a minimal streaming protocol for an external client or agent to emit:

- run start;
- tool call;
- tool result;
- tool error;
- state snapshot;
- run end.

The bridge must not require the external process to import TypeScript. It should support line-delimited JSON, explicit correlation IDs, bounded records, and redaction metadata.

### 5.2 Python and JavaScript integrations

The first integrations should be thin wrappers, not independent engines:

- Python `pytest` helper that invokes the runner and maps findings to tests;
- JavaScript/Vitest or Node test helper;
- examples showing how to wrap an existing agent/client;
- clear guidance for other languages to implement the JSONL contract.

### 5.3 Trace interoperability

Support import/export through a stable JSONL representation and optional OpenTelemetry mapping. Do not require users to abandon their existing recorder or observability stack.

### 5.4 Baseline and compare

Add a command that compares two runs or two server revisions while preserving the distinction between:

- a new failure;
- a fixed failure;
- a changed trace with unchanged effect;
- an unchanged known failure;
- an inconclusive run.

### 5.5 Optional sandbox execution

Provide a documented Docker/Podman execution profile with:

- network disabled by default;
- read-only root filesystem where practical;
- non-root user;
- bounded CPU, memory, process count, and time;
- explicit workspace mount;
- minimal environment;
- artifact extraction.

The core runner must continue to state that normal stdio mode does not enforce host isolation.

---

## 6. P2 boundaries

The following should remain explicitly deferred until P0/P1 adoption evidence exists:

- remote authenticated MCP servers;
- OAuth lifecycle management;
- arbitrary production-state observers;
- model-as-judge scoring;
- prompt-injection red-team campaigns as a core feature;
- A2A and Agent Skills protocol adapters;
- hosted trace storage;
- multi-tenant dashboards;
- automatic remediation patch generation;
- broad desktop automation.

---

## 7. Migration requirements from v0.1

The expansion must preserve current users and examples.

### Required compatibility behavior

- v1 packs remain runnable;
- current fixture runner remains supported;
- current six mutation names remain stable or have documented aliases;
- existing terminal, Markdown, and JSON report consumers are not broken without a versioned migration;
- current Action inputs continue to work;
- new proxy/capture features are additive commands or explicit modes;
- report schema changes are versioned;
- a v1-to-v2 pack upgrader or migration guide is provided before new schema becomes default.

### Migration test cases

- run every existing demo pack through the new engine;
- compare v0.1 and expanded reports for equivalent pass/fail semantics;
- verify intentional failures remain intentional;
- verify no existing fixture gains hidden network or credential behavior;
- verify old reproduction commands remain understandable.

---

## 8. Second-pass release gate

The second-pass scope is complete when:

- the proxy can exercise a real local MCP client;
- capture produces a valid reviewed starter pack;
- at least one non-fixture observer works safely;
- ambiguous-outcome mutations have stable controls;
- JUnit and GitHub summaries work in a sample repository;
- a Python and JavaScript consumer can run the same conceptual contract;
- the public installation path works from a clean machine;
- external testers can complete the golden path without maintainer narration;
- the README accurately distinguishes scripted, proxy, and generic-adapter capabilities.

If these gates cannot be met, the project may still ship a narrow v0.1, but it must not describe itself as a broad agent reliability layer yet.
