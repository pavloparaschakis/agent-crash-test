# Roadmap and Issue Backlog

> **Expansion note:** The second- and third-pass review promotes a transparent local MCP proxy, capture-to-starter-pack, protocol-neutral contracts, pluggable state observers, ambiguous-outcome mutations, and language-neutral integrations into the next expansion sequence. This document remains the v0.1 backlog; the superseding expansion plan is the [final expansion scope dossier](26-final-expansion-scope/00-index-and-final-decision.md), especially the [build roadmap](26-final-expansion-scope/04-build-roadmap-and-work-breakdown.md).

## Milestone M0: prove the concept — completed in repository

- [x] Scaffold single-package structure.
- [x] Implement broken demo MCP server.
- [x] Define normalized event model.
- [x] Define state snapshot and state-delta model.
- [x] Implement one end-to-end timeout mutation.
- [x] Implement one duplicate-side-effect scenario.
- [x] Render first terminal report.
- [ ] Record a short demo asset (external launch gate).

## Milestone M1: local MVP — completed in repository

- [x] Implement `init`.
- [x] Implement `doctor`.
- [x] Implement stdio discovery.
- [x] Implement fixture schema v1.
- [x] Implement fixture-backed state oracle.
- [x] Implement declared read-only MCP effect probes.
- [x] Implement intended-versus-observed state diff.
- [x] Implement offline fixture transport.
- [x] Implement redaction.
- [x] Implement six mutation classes and extension interface.
- [x] Implement the supported assertion set.
- [x] Implement `must_not_call`, `state_path_equals`, state contracts, and `no_extra_transition`.
- [x] Implement exit-code policy.

## Milestone M2: public repository quality — repository work completed

- [x] Add terminal, Markdown, and JSON reporters.
- [x] Add GitHub Action.
- [x] Add starter/self-test workflow.
- [x] Add issue forms.
- [x] Add contributing guide.
- [x] Add security policy.
- [x] Add changelog and release policy.
- [x] Add cross-platform CI configuration.

## Milestone M3: community engine

- [x] Add fixture contribution template (`examples/packs/README.md`).
- [ ] Add 50 curated fixtures.
- [ ] Add at least 20 stateful fixtures.
- [ ] Add challenge command.
- [ ] Add static compatibility-card generator.
- [ ] Add version comparison.
- [ ] Add fixture minimization.
- [ ] Add maintainer docs for public badges.

## Milestone M3.5: adapters and richer reports

- [ ] Implement local unauthenticated Streamable HTTP discovery.
- [ ] Implement protocol-aware recording proxy.
- [ ] Evaluate fixture import adapters.
- [ ] Add JUnit, SARIF, and HTML reporters.
- [ ] Add PR comments and annotations.

## Milestone M4: ecosystem expansion

- [ ] Add A2A adapter research spike.
- [ ] Add Agent Skills adapter research spike.
- [ ] Add local model adapter.
- [ ] Add client adapter interface.
- [ ] Add optional public index design.

## High-value issue templates

### Fixture request

Ask for protocol, failure class, minimal reproduction, expected behavior, observed behavior, and whether the fixture can run offline.

### False-positive report

Ask for command, fixture, report JSON, expected semantics, and why the finding is incorrect.

### New mutation proposal

Ask what real-world failure it represents, how it is injected safely, how it is made deterministic, and what remediation it enables.

### Adapter proposal

Ask what protocol/client it supports, what normalized events it emits, and which P0 workflows it unlocks.
