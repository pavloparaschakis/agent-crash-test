# Final Product Decision

## Decision

Proceed with Agent Crash Test as scoped. The research validates that the problem is real and that the reproduce/intervene/confirm workflow is interesting. The v0.1 repository now implements the open-source maintainer baseline; the remaining work is validation with external users and disciplined expansion, not widening the core.

> Prove the agent did what you asked—and nothing else.

## What we are building

An MCP-first, local-first crash-test pack toolkit that:

1. defines or imports a scenario;
2. injects controlled faults;
3. evaluates effect and behavioral assertions;
4. compares intended and observed state changes;
5. creates a reproducible crash-test pack;
6. runs the pack locally and in GitHub Actions;
7. reports a precise remediation path;
8. adds recording and real-agent adapters only after the core pack format is stable.

## What we are not claiming

- We are not the first project to perturb MCP tool responses.
- We are not replacing official MCP conformance tests.
- We are not certifying an agent or server as secure.
- We are not promising that a test suite can prove all possible model behavior.
- We are not guaranteeing 5,000 GitHub stars.

## Why it can still be useful

The project can earn adoption if it is dramatically easier to try and contribute to than adjacent systems:

- one-command local demo;
- no API key for the core path;
- deterministic fixtures;
- visible final-state diff;
- GitHub Action artifacts (PR comments are deferred);
- no mandatory hosted workbench;
- no mandatory LLM judge;
- an open corpus of failure scenarios;
- clear separation between observed fact, inference, and security advisory.
- no promise to replace established record/replay or agent-testing frameworks.

## The signature demo

Use a fictional invoice workflow:

1. The agent requests one invoice.
2. The tool times out after creating it.
3. The agent retries.
4. Two invoices or two outbound messages now exist.
5. A normal API assertion may see a successful response.
6. Agent Crash Test compares state and reports the duplicate side effect.

The second demo, added only with a real-agent adapter, should cover tool poisoning: a tool returns an instruction that attempts to redirect the agent to another tool. The report must distinguish the injected content from the observed agent response and must not label a static string match as proof of exploitability.

## MVP boundary

The first public build must include:

- MCP stdio support;
- fixture-backed execution;
- six mutation classes;
- state snapshots and state-diff assertions;
- terminal, Markdown, and JSON reports;
- GitHub Action example;
- redaction and safe defaults;
- broken demo server;
- contributor fixture template.

Defer transparent recording/import, Streamable HTTP, OAuth, model adapters, A2A, hosted dashboards, automatic patch application, HTML/JUnit/SARIF reporting, and broad client compatibility until the core loop is stable.

## Implementation status — v0.1

Implemented: MCP stdio and deterministic fixture transports; six mutations; direct state/effect probes; result, annotation, and forbidden-transition assertions; redacted terminal/Markdown/JSON reports; a composite GitHub Action; a broken invoice demo server; eight demo packs; six mutation control pairs; and unit plus integration coverage.

At the original v0.1 boundary, deliberately absent were transparent recording/import, remote transports and OAuth, arbitrary agent/model execution, generic production-state introspection, PR-comment publishing, HTML/JUnit/SARIF, and publishing to npm or a marketplace. The expanded preview changes only the locally implemented items listed below; it does not silently broaden the remote or hosted boundary.

## Expanded implementation status

The working tree now includes the first local expansion slice: a transparent MCP stdio proxy, bounded redacted capture, capture-to-starter-pack generation, JSON snapshot observers, ten phase-aware mutation semantics, reusable effect contracts, strict JSONL normalization, stable finding fingerprints, JUnit, GitHub-summary, SARIF, local report compare/explain/export helpers, and a public Node API surface. The proxy/capture paths are experimental until external clients and independent repositories validate them. Full replay-platform import/compare semantics, remote protocols, hosted features, and model execution remain deliberately deferred.

## Go/no-go criteria before public release

Go only if all are true:

- five external testers complete the demo;
- the signature duplicate-side-effect failure is reproducible three times;
- the report explains the failure without maintainer narration;
- a fixture can be added in under 30 minutes;
- secrets do not survive redaction tests;
- a failing fixture produces a non-zero CI exit code;
- the README does not overclaim novelty or security.

No-go if the project is merely a prettier scanner, requires a hosted account for its first value, or cannot distinguish “requested action failed” from “requested action succeeded plus an extra action occurred.”
