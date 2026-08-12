# Product Requirements Document

## Problem statement

Agent tools are becoming software interfaces for actions with real consequences, but most teams test them as ordinary APIs: they validate schemas, call happy paths, and discover failures only after an agent encounters ambiguity, latency, stale state, or an unsafe side effect. Existing tools now cover protocol conformance, replay, security probing, response perturbation, and agent evaluation. Agent Crash Test should deliberately remain close to that proven direction while making the implementation more practical for open-source maintainers: local-first fixtures, GitHub-native CI, reusable community scenarios, and explicit checks for intended versus extra side effects.

The cost of not solving this is silent failure: an agent can report success after an incomplete action, repeat a charge, leak sensitive context, select the wrong tool, or fail to recover from a transient error. These failures are difficult to reproduce because the model, tool environment, and timing are all moving at once.

## Goals

1. Let a new user run a meaningful failure demonstration in under two minutes.
2. Let a maintainer create a regression fixture from a real or synthetic interaction in under ten minutes.
3. Make at least six high-value failure classes testable without an LLM or cloud account, with twelve classes as the first expansion target.
4. Provide CI outputs that are usable by GitHub Actions, humans, and machine tooling.
5. Create a public contribution model where new fixtures are easy to author and review.
6. Build a credible path toward 5,000 GitHub stars through usefulness, public artifacts, and community fixtures.

## Non-goals for v1

- Certifying that an agent or server is secure.
- Replacing MCP official conformance tests.
- Recreating any one adjacent project feature-for-feature; the project should borrow the validated reproduce/intervene/confirm loop while owning its own fixture, CI, and community experience.
- Supporting every agent framework.
- Running uncontrolled tests against production systems.
- Building a hosted analytics product.
- Training or fine-tuning models.
- Guaranteeing a particular GitHub star count.
- Automatically applying patches to a user's repository.

## Product principles

- A test must have an observable input, output, and expectation.
- A failure must include a reproduction path.
- A warning must not be presented as a confirmed vulnerability.
- A passing tool response is not sufficient evidence of a passing workflow; when a state oracle exists, intended and forbidden state changes must be checked.
- The default mode must be safe for local development.
- Every network or side-effect boundary must be visible.
- Reports should teach users how to fix the issue.

## Functional requirements

### P0-01: Server discovery

The CLI must start a local MCP server over stdio, initialize the session, list tools, capture schemas, and classify transport errors. The P0 protocol baseline is MCP 2025-06-18 / the stable v1.x TypeScript SDK surface; newer protocol revisions are tested behind compatibility fixtures before adoption.

**Acceptance criteria:**

- Given a valid stdio command, discovery returns a normalized server manifest.
- Given an invalid command, the report identifies process, transport, or protocol failure.
- Logs never expose environment variable values by default.
- Given an unsupported transport, the CLI explains that it is deferred rather than attempting a partial connection.

### P0-02: Baseline contract checks

The CLI must validate tool names, descriptions, input schemas, declared output schemas, and annotations. It must treat MCP annotations as untrusted hints and test declared-versus-observed behavior only when the pack supplies an observable effect probe.

**Acceptance criteria:**

- Missing descriptions produce a deterministic finding.
- Malformed normalized tool-manifest data produces a deterministic discovery failure.
- Missing annotations produce a conservative-risk notice, not a claim that the server is defective.
- A tool declaring `readOnlyHint` or `idempotentHint` that contradicts an observed effect produces an evidence-backed failure.
- Every finding includes an identifier, severity, evidence, and remediation.

### P0-03: Test-pack authoring and execution

The CLI must create and run a portable crash-test pack containing a small scenario, a mutation profile, effect probes, assertions, expected recovery, and remediation notes. The P0 runner may be a deterministic scripted client; it does not claim to be a general agent evaluator.

**Acceptance criteria:**

- `init` creates a valid starter pack without network credentials.
- A pack validates before execution and names every required effect probe.
- The pack can run against a fixture-backed mock or local stdio server.
- The same pack, mutation seed, and runner version produce the same deterministic result.

### P0-04: Deterministic rerun

The CLI must rerun a pack against a local server or fixture-backed mock and report the first differing call, effect, or assertion.

**Acceptance criteria:**

- A fixture-backed pack can run offline.
- A local-server run reports protocol, declared-output, effect, and assertion differences.
- The report identifies the first divergent event.
- A rerun is deterministic when the same pack, seed, and target version are used.

### P0-05: Stateful fixture oracle

The fixture format must support a deterministic effect model for the demo and offline paths. The initial implementation may use in-memory JSON state, a fixture-backed mock, or explicitly declared read-only MCP effect probes; it must not require generic production-database introspection or arbitrary shell snapshot commands.

**Acceptance criteria:**

- A fixture can declare initial state, expected final-state delta, or named effect probes.
- A fixture can declare forbidden state changes and forbidden tool calls.
- The report distinguishes missing, extra, duplicated, and changed transitions.
- State comparisons use explicit effect probes and paths in v0.1. Ignored-field configuration for generic snapshots is deferred until a snapshot adapter exists.

### P0-06: Fault injection

The CLI must support six deterministic mutations: latency/timeout, retryable error, malformed structured result, stale result, duplicate call, and permission denied. Schema drift and poisoned-content are P1 because they overlap strongly with existing contract/security tools and, in the latter case, require a real agent runner to evaluate resistance.

**Acceptance criteria:**

- Each mutation has a stable identifier and reproducible seed.
- Mutations do not affect the source server process directly.
- The report states what was mutated and what behavior was expected.
- Unsafe mutation profiles require explicit opt-in.

### P0-07: Behavioral and side-effect assertions

The test format must express ordering, confirmation, idempotency, final-state/effect deltas, extra-action prohibitions, and side-effect invariants. Data-exposure and injection-resistance claims require an agent-runner adapter and are P1.

**Acceptance criteria:**

- Assertions can pass or fail without semantic LLM judging.
- Assertion failures link to the exact call sequence.
- A fixture can include a human-readable explanation.
- Assertions support negative requirements such as `must_not_call`.
- A fixture can assert that no unrequested entity, message, payment, deletion, or permission change occurred.

### P0-08: Reports

The CLI must emit terminal, Markdown, and JSON reports. JUnit XML, SARIF, and static HTML are P1 once the finding schema is stable.

**Acceptance criteria:**

- Exit code is non-zero for configured blocking severities.
- Reports remain useful when zero tests or zero tools exist.
- JSON has a versioned schema.
- Markdown is suitable for a pull-request summary and JSON is versioned for integrations.

### P0-09: GitHub Action

The repository must include a minimal action that installs the CLI, runs tests, and uploads artifacts. Pull-request comments are intentionally P1.

**Acceptance criteria:**

- The example workflow works on a clean public repository.
- A failing test produces a concise terminal summary and uploads the full report artifact.
- The action can be version-pinned by the consuming workflow; the repository pins third-party Action dependencies by commit.
- Fork pull requests do not receive unsafe secret access by default.

### P0-10: Demo server and fixtures

The repository must include a local demo server and deterministic scripted runner with deliberate failures, seven stdio scenario packs, one fixture pack, and fixture/state-contract regression coverage.

**Acceptance criteria:**

- The demo needs no external account.
- The quickstart exposes at least five visible findings, including one extra-side-effect finding.
- Every demo failure has a corresponding test and explanation.
- A contributor can add a fixture using a documented template.

## P1 requirements

- Streamable HTTP against local, unauthenticated endpoints; OAuth and remote authenticated targets remain out of scope.
- MCP configuration import and a protocol-aware transparent recording proxy.
- Recorded-fixture import adapters where format and licensing permit.
- Generic agent-command adapter and canary-based poisoned-content packs.
- Compare two server versions.
- Generate remediation suggestions for schemas and descriptions.
- Support local model adapters.
- Add client adapters for popular open-source agent runners.
- Add fixture minimization and delta debugging.
- Add a public static compatibility-card generator.
- Add an interactive timeline viewer.
- Add JUnit XML, SARIF, and static HTML reporters.

## P2 requirements

- A2A task lifecycle adapter.
- Agent Skills adapter.
- Distributed multi-agent failure scenarios.
- Hosted opt-in benchmark index.
- Longitudinal drift monitoring.
- Organization policies and signed test attestations.
- HTTP OAuth, remote credentials, and production-target execution.
