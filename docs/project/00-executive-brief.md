# Executive Brief

## One-sentence concept

Agent Crash Test is a local-first, open-source crash-test pack and stateful contract-testing toolkit for MCP servers and future agent tool protocols.

## Product promise

If a tool works only when the network is perfect, the schema never changes, the user never says “no,” and the model never receives hostile content, it is not ready for an agent. Agent Crash Test makes those assumptions executable and testable.

## The opportunity

Agent tooling is moving from demos into software that can read, write, purchase, deploy, modify, and communicate. The ecosystem already has protocol conformance tests, registries, security scanners, replay tools, agent workbenches, and model benchmarks. The sharper gap is a reusable test-pack layer that lets maintainers express a failure mode once—fault, expected recovery, and allowed effects—and reuse it across local development, CI, and eventually multiple agent runners.

## Target users

Primary users are open-source MCP server maintainers, teams building agent-facing APIs, and developers responsible for integrating third-party tools. Secondary users are security researchers, framework authors, agent platform maintainers, and contributors who want a practical entry point into agent reliability.

## Differentiation

Agent Crash Test is not primarily:

- an opaque readiness score;
- a hosted monitoring dashboard;
- a model leaderboard;
- a protocol conformance clone;
- a language-specific unit-testing library;
- a replay-only tool.

It is a stateful failure lab with an open test-pack format. Its signature loop is **define or import scenario → inject fault → assert intended and forbidden effects → explain → rerun → prevent regression**.

## The memorable product moment

The demo must show a failure ordinary API tests miss:

> The agent successfully creates the requested invoice, then retries a timeout and sends it twice. Agent Crash Test catches the duplicate side effect from the state diff.

This “did the right thing, and also something wrong” class is the product’s distinctive wedge.

## North-star outcome

Within six months of public launch, a maintainer should be able to add Agent Crash Test to a public MCP repository in less than ten minutes, receive a useful failure report without an API key, fix one issue, and commit a regression test.

## Star hypothesis

The 5k-star hypothesis is that an agent testing tool can spread faster when it has four properties simultaneously:

1. It solves a painful developer problem now.
2. Its demo is visually obvious and technically credible.
3. Its output is easy to embed in public repositories.
4. Its test fixtures create a low-friction contribution surface.

The product should therefore optimize for repeated usefulness and public proof, not for a vanity score alone.

## Constraints

- Do not require access to proprietary desktop agent apps.
- Do not require cloud credentials for the core workflow.
- Do not execute destructive real-world actions by default.
- Do not start with a large hosted control plane.
- Do not depend on an LLM judge for basic pass/fail correctness.
- Do not make generic response perturbation the primary novelty; that area is already active.
- Do not make arbitrary desktop-agent recording a v0.1 promise; it requires a protocol-aware proxy and overlaps directly with MCPReplay.
- Do not make authenticated remote HTTP a v0.1 promise; MCP authorization and credential flows deserve a separately hardened adapter.
- Do not claim a guarantee of 5,000 stars.

## Definition of launch readiness

The project is ready for a public GitHub launch when a new user can:

1. install the CLI with one documented command;
2. run the intentionally broken demo server;
3. see at least five meaningful failures in under two minutes;
4. inspect each failure and reproduce it offline;
5. create a test pack from a template and run it against the demo;
6. run the fixture in GitHub Actions;
7. understand how to contribute a new failure scenario.
