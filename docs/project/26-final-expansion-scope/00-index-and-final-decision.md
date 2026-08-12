# Final Expansion Scope — Index and Final Decision

**Project:** Agent Crash Test
**Document set:** Second-pass and third-pass expansion dossier
**Status:** Strategic source of truth for the next product build
**Review date:** 2026-08-02
**Current baseline:** Hardened v0.1 local MCP stdio + fixture runner
**Primary promise:** **Prove the agent did what you asked—and nothing else.**

---

## 1. Purpose of this dossier

The existing repository already contains a credible v0.1 foundation: deterministic fixture packs, a local MCP stdio runner, six mutation types, effect probes, state assertions, redacted reports, a GitHub Action, and a contribution corpus.

The second and third passes identified a more important question than “what other features could be added?”:

> What must change for Agent Crash Test to become useful to a major portion of the open-source agent and developer-tooling community rather than only to maintainers who are willing to hand-author MCP YAML packs?

This dossier answers that question end to end. It turns the findings into:

- a product reframe;
- an explicit P0/P1/P2 build scope;
- a protocol-neutral architecture direction;
- a transparent proxy and capture workflow;
- a pluggable state-observation model;
- an adapter and interoperability plan;
- a community fixture and governance program;
- detailed test and perfection gates;
- measurable adoption and quality targets;
- public-release and operations requirements;
- decisions, risks, experiments, and cut lines.

This is not a request to discard the current implementation. It is the expansion plan that protects its strongest idea while removing its largest adoption barriers.

---

## 2. Final strategic decision

### 2.1 Reframe the category

The project should no longer be described primarily as an “MCP crash-test runner.” Its durable category should be:

> **Open-source failure-injection and side-effect contract testing for tool-using agents.**

MCP remains the first and most mature transport adapter. It should continue to receive first-class support, examples, documentation, and CI coverage. However, the core concepts must not be structurally locked to MCP wire messages.

The expanded product should serve:

- MCP server authors;
- agent application developers;
- teams using Python, TypeScript, Rust, Go, or other languages;
- framework maintainers;
- CI and release maintainers;
- open-source projects that expose tools, commands, APIs, or workflow actions;
- researchers and evaluators who need reproducible failure cases;
- security-minded developers who need evidence without a certification claim.

### 2.2 Preserve the central differentiator

The project must not become a generic model evaluator, observability dashboard, protocol scanner, or replay viewer. Its differentiator is the intersection of four capabilities:

1. **Inject a controlled, realistic fault.**
2. **Observe the actual call and physical-event timeline.**
3. **Verify intended and forbidden state transitions.**
4. **Produce a deterministic, reviewable, CI-friendly finding.**

The product should own the question:

> When a tool call fails ambiguously, did the intended effect happen exactly once, and did anything else happen?

### 2.3 Promote the highest-leverage deferred work

The following capabilities move from “interesting future work” to the primary expansion sequence:

- a transparent local MCP proxy that can exercise a real client or agent;
- capture/record of a successful workflow into a starter pack;
- a protocol-neutral normalized event and pack contract;
- pluggable state observers and effect oracles;
- first-class ambiguous-outcome mutations;
- a generic JSONL adapter and thin language integrations;
- CI-native JUnit and GitHub summary output;
- public package/binary distribution and supply-chain trust;
- a curated, community-owned failure corpus.

### 2.4 Explicitly avoid feature sprawl

The following remain out of the core expansion unless external evidence changes the decision:

- hosted telemetry or a mandatory dashboard;
- model-based judging as a pass/fail authority;
- broad security certification or a “safe agent” badge;
- production credentials and live customer-state introspection;
- a large collection of framework-specific integrations;
- a custom web UI before the CLI/proxy path is proven;
- automatic code fixes;
- remote OAuth and multi-tenant infrastructure as an early milestone.

---

## 3. Final product definition

### 3.1 One-sentence definition

Agent Crash Test is an open-source, local-first reliability test kit that injects realistic failures into tool-using workflows and verifies the resulting calls, state transitions, side effects, and recovery behavior.

### 3.2 Product promise

> **Break the workflow in a controlled way. Prove the requested effect happened exactly once—and nothing else happened.**

### 3.3 The ideal golden path

```text
Install
  ↓
Run a safe demo
  ↓
Point at an existing local agent/client and tool server
  ↓
Capture one successful workflow
  ↓
Generate a starter crash-test pack
  ↓
Inject one realistic fault
  ↓
See the first divergent event and state delta
  ↓
Fix the workflow or tool
  ↓
Rerun the same deterministic case
  ↓
Add the pack to CI
  ↓
Contribute the generalized failure case to the community corpus
```

The user should see useful evidence before they are required to understand advanced YAML, protocol details, or custom adapter APIs.

### 3.4 What a successful finding contains

Every blocking finding should contain:

- the pack and mutation identity;
- the target protocol and adapter;
- the logical request and physical calls;
- attempt numbers and parent/child relationships;
- the mutation phase;
- the expected effect contract;
- the observed state before and after;
- forbidden or extra transitions;
- the first divergent event;
- a stable finding fingerprint;
- a concise explanation of why the failure matters;
- a remediation suggestion;
- an exact reproduction command;
- redaction status and data-boundary warnings;
- the environment and runner versions needed to reproduce it.

---

## 4. Document map

| File | Purpose | Primary audience |
|---|---|---|
| [01-second-pass-product-scope.md](01-second-pass-product-scope.md) | Detailed product additions identified in the second pass | Product and engineering |
| [02-third-pass-community-scope.md](02-third-pass-community-scope.md) | Final reframe for broad open-source usefulness | Product, maintainers, community |
| [03-target-architecture-and-contracts.md](03-target-architecture-and-contracts.md) | Architecture, interfaces, schemas, data flow, security | Engineering |
| [04-build-roadmap-and-work-breakdown.md](04-build-roadmap-and-work-breakdown.md) | Sequenced implementation plan and dependencies | Engineering and project planning |
| [05-test-strategy-and-perfection-gates.md](05-test-strategy-and-perfection-gates.md) | Test plan, acceptance criteria, and definition of perfection | Engineering and release |
| [06-community-corpus-and-adapter-program.md](06-community-corpus-and-adapter-program.md) | Fixture corpus, adapters, contributor workflow, governance | Maintainers and contributors |
| [07-research-positioning-and-competitive-decisions.md](07-research-positioning-and-competitive-decisions.md) | Current research, competitive set, positioning, validation | Product and launch |
| [08-metrics-success-and-star-goal.md](08-metrics-success-and-star-goal.md) | Success measurement, targets, review cadence, 5k-star framing | Product and community |
| [09-public-release-and-operations.md](09-public-release-and-operations.md) | Packaging, launch, support, security, release operations | Maintainers and launch |
| [10-open-questions-and-decision-log.md](10-open-questions-and-decision-log.md) | Decisions, unresolved questions, risks, experiments, cut lines | Whole project |

---

## 5. Priority model

### P0 — required for the expanded product to be broadly useful

P0 means the project is materially weaker or misleading without the capability. P0 work must have implementation, tests, documentation, and external validation.

- protocol-neutral internal contract;
- transparent local MCP stdio proxy;
- actual-client execution path;
- capture-to-starter-pack workflow;
- explicit mutation phases and ambiguous-outcome mutations;
- pluggable state-oracle interface;
- stable normalized trace/report model;
- JUnit and GitHub summary output;
- one-line installation and public release distribution;
- at least two non-identical integration examples, including one Python and one JavaScript consumer;
- high-quality canonical fixture corpus;
- redaction, sandbox boundary, and supply-chain documentation;
- external usability validation.

### P1 — important for ecosystem depth and repeat adoption

- generic JSONL adapter;
- Python/pytest wrapper;
- JavaScript test-runner wrapper;
- OpenTelemetry trace export/import;
- trace import from compatible recorder formats;
- baseline and compare mode;
- optional Docker/Podman sandbox profile;
- opt-in SARIF output with stable fingerprints;
- fixture registry and compatibility cards;
- failure minimization and pack generation improvements;
- local unauthenticated Streamable HTTP adapter;
- public challenge mode.

### P2 — deliberately deferred strategic options

- remote authenticated targets;
- OAuth workflows;
- A2A and Agent Skills adapters;
- hosted index or dashboard;
- broad multi-agent scenarios;
- model-assisted diagnosis or judging;
- production verification connectors;
- automated remediation patches.

---

## 6. Final definition of success

The expansion is successful when all of the following are true:

1. A developer can test a real local tool-using client without changing the client source code.
2. A new user can capture a happy path and create a meaningful test in under ten minutes.
3. A failure report proves a state or side-effect difference rather than merely showing an error string.
4. The same failure can be reproduced locally and in CI with a stable command and seed.
5. Python and JavaScript projects can integrate without adopting the internal TypeScript implementation.
6. The community can contribute fixtures without understanding the runner internals.
7. The project complements replay, observability, conformance, and agent-evaluation tools rather than pretending to replace them.
8. The project earns repeat use in external repositories.
9. The project is honest about nondeterminism, sandbox boundaries, and unsupported protocols.
10. The repository can be maintained by contributors other than the original author.

GitHub stars are an important distribution signal, but they are not proof of product success. The project should pursue 5,000 stars through usefulness, interoperability, a compelling demonstration, and community-owned assets—not through a claim that the number is guaranteed.

---

## 7. Governing principles

1. **Effect over output:** a successful final message is not evidence that the workflow was safe.
2. **Real clients matter:** scripted tests are a foundation; transparent interception is the adoption wedge.
3. **Protocol-neutral by design:** MCP is first, not the permanent boundary of the product.
4. **Deterministic by default:** randomness is seeded, mutation phases are explicit, and reports are replayable.
5. **Safe by default:** production credentials and external side effects are never implied.
6. **Evidence over scores:** the tool reports observable facts and contracts, not an unsupported safety grade.
7. **Interoperate before competing:** export standard traces and import useful existing formats where practical.
8. **Community assets are the moat:** the reusable fixture corpus is more valuable than a long feature list.
9. **Every new feature must lower time-to-value or increase finding quality:** otherwise it belongs in the parking lot.
10. **No hidden scope expansion:** every P0 addition must name the work it displaces or the release it extends.

---

## 8. Immediate next actions

The next implementation cycle should begin in this order:

1. Freeze the v0.1 baseline and tag it as the stable scripted/fixture foundation.
2. Add the protocol-neutral normalized event and effect contracts behind compatibility adapters.
3. Build the local transparent MCP stdio proxy with an explicit mutation-phase model.
4. Add capture of a successful session and starter-pack generation.
5. Add the first state-oracle adapter beyond fixture state.
6. Add the ambiguous-outcome mutation family and end-to-end controls.
7. Add JUnit and GitHub summary outputs with stable finding fingerprints.
8. Create the Python and JavaScript consumer examples.
9. Publish the first expanded public release only after the external validation gates pass.

The detailed build order, acceptance criteria, and cut lines are defined in the linked documents.
