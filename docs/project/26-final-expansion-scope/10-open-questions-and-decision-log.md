# Open Questions, Decision Log, Risks, and Experiments

**Purpose:** Keep the expansion disciplined. Good ideas belong in the project only when their value, safety, and maintenance cost are understood.
**Status:** Living document; update whenever a decision changes scope, architecture, or public claims.

---

## 1. Decisions already made

### D-001 — Preserve the current v0.1 foundation

**Decision:** Keep fixture mode, scripted MCP mode, six existing mutations, effect probes, state contracts, reports, Action, and current controls.
**Reason:** The existing foundation is the deterministic laboratory needed to validate expanded proxy and adapter behavior.
**Consequence:** New modes must reuse the normalized event, assertion, redaction, and report layers.

### D-002 — Reframe the product category

**Decision:** Describe the product as failure-injection and side-effect contract testing for tool-using agents, with MCP as the first adapter.
**Reason:** The underlying problem is broader than MCP, and current adjacent tools already occupy several MCP-specific categories.
**Consequence:** Public messaging, internal contracts, and adapter boundaries must not imply permanent MCP-only scope.

### D-003 — Make a transparent local proxy the central expansion

**Decision:** Prioritize a local MCP stdio proxy that exercises real clients without source changes.
**Reason:** Real-client behavior is the largest gap between the current scripted runner and broad usefulness.
**Consequence:** Proxy lifecycle, event fidelity, and mutation-phase correctness become release-critical.

### D-004 — Add capture, but not a full replay platform

**Decision:** Capture should generate starter packs and effect-contract TODOs. Full replay/browser sharing is not the core product.
**Reason:** Capture lowers activation friction; full replay overlaps adjacent tools and dilutes focus.
**Consequence:** Generated packs must make unknown or unreviewed semantics visible.

### D-005 — Use protocol-neutral normalized concepts

**Decision:** Separate logical calls, physical calls, outcomes, effects, state snapshots, mutations, and findings from MCP wire details.
**Reason:** Other languages and protocols need the same reliability semantics.
**Consequence:** MCP adapters translate into the shared contract rather than defining new assertion behavior.

### D-006 — Treat state observation as explicit evidence

**Decision:** No report may infer “no effect” from a missing or failed observation.
**Reason:** The tool’s core claim depends on observing state correctly.
**Consequence:** Required observer failure is blocking or inconclusive, never an accidental pass.

### D-007 — Do not claim security certification

**Decision:** The project reports behavioral evidence and safety boundaries, not a certification.
**Reason:** Deterministic packs cannot prove all security properties.
**Consequence:** Security language, badges, SARIF, and launch posts require careful qualification.

### D-008 — Keep telemetry off by default

**Decision:** Local-first operation must remain complete without telemetry or a hosted service.
**Reason:** Captured traces and tool arguments may contain sensitive information.
**Consequence:** Adoption metrics rely on public evidence and opt-in research.

### D-009 — Stars are a stretch outcome, not a product definition

**Decision:** Track 5,000 stars as an aspirational distribution target while prioritizing repeat use and contributor value.
**Reason:** Star chasing can produce a popular but unused project.
**Consequence:** The north-star metric is active repositories with passing effect contracts and executed mutations.

---

## 2. Blocking questions before proxy implementation

### Q-001 — What MCP client-facing transport shape is the first supported path?

**Options:**

- proxy exposes stdio to the client and starts a target process;
- proxy exposes a local socket/HTTP endpoint;
- proxy wraps a command with environment/configuration.

**Recommendation:** Start with client-facing stdio because it preserves the local-first and no-server setup story. Document any client configuration limitations.

### Q-002 — How is “commit after underlying call” known?

**Options:**

- adapter-level semantic hook;
- pack-declared commit marker;
- state observer evidence;
- generic “may have committed” status.

**Recommendation:** Support a conservative “unknown/may have committed” status when the proxy cannot prove commit. Do not pretend the transport alone knows application state.

### Q-003 — Can the proxy safely duplicate a physical call?

**Question:** Does duplicate injection execute the target a second time or replay the first response?
**Recommendation:** Execute a second physical call when the test explicitly requests duplicate side effects, record it as a child event, and require a test target designed for safe local experimentation.

### Q-004 — Can a captured session be safely converted into a test?

**Recommendation:** Only as a starter pack. Require explicit user review of effects, observers, secrets, and nondeterministic values.

### Q-005 — What is the minimum generic JSONL contract?

**Recommendation:** Keep it to run lifecycle, tool call, outcome, snapshot, and end records. Resist adding prompt, model, token, or reasoning fields to the core.

---

## 3. Important but non-blocking questions

### Q-006 — Should the package name change?

**Recommendation:** Keep “Agent Crash Test” if the name has existing assets, but change the category line to “effect-level chaos testing for tool-using agents.” Revisit naming only if search/discovery testing shows severe ambiguity.

### Q-007 — Should SARIF be a first-class output?

**Recommendation:** Make it opt-in after JUnit and GitHub summary. Behavioral findings do not automatically map to source-code locations or security alerts.

### Q-008 — Should OpenTelemetry be the canonical trace format?

**Recommendation:** No. Export to OpenTelemetry optionally; keep the crash-test report authoritative because it contains contract and mutation semantics not guaranteed by telemetry.

### Q-009 — Should the project publish prebuilt binaries?

**Recommendation:** Evaluate after npm and Action distribution. Add binaries when they materially reduce installation friction and platform tests can support them.

### Q-010 — Should the project add HTTP immediately?

**Recommendation:** No. Prove local stdio proxy and generic JSONL first. Add unauthenticated local Streamable HTTP only when external users demonstrate demand.

### Q-011 — Should the project add model execution?

**Recommendation:** Not to the core. Provide a bridge so users can run their own agent, but do not make model calls, provider keys, or model judging required for deterministic reliability tests.

### Q-012 — Should the community corpus be a separate repository?

**Recommendation:** Start in the main repository for discoverability and CI. Split into a separate repository only when corpus size or independent release cadence creates real maintenance pressure.

---

## 4. Risk register

| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---:|---:|---|---|
| Proxy does not faithfully model real client behavior | Medium | High | External users see different retries | Test real clients, record both directions, document limits |
| Mutation semantics create false confidence | Medium | High | Controls pass while state is wrong | Phase model, commit/response status, observer truth tests |
| Capture generates misleading tests | High | High | Users trust generated packs without review | Make effect contracts incomplete until reviewed |
| State observers leak or mutate data | Medium | High | Unsafe output or unexpected state changes | Explicit policy, redaction, sandbox, fail-closed behavior |
| MCP-only positioning limits adoption | High | High | Non-MCP users ignore project | Protocol-neutral contract and JSONL bridge |
| Framework adapters become maintenance burden | High | Medium | Broken examples and stale dependencies | Thin wrappers, capability cards, community tiers |
| Generic scope becomes too broad | High | High | Many adapters, no core quality | P0 gates and cut lines |
| Existing tools absorb the category | Medium | High | Users say replay/eval already solves it | Interoperate and own effect-level uncertain outcomes |
| CI reports create noisy or misleading alerts | Medium | Medium | False-positive issue growth | JUnit/summary first, stable fingerprints, opt-in SARIF |
| Public package trust is insufficient | Medium | High | Users avoid running it in CI | Provenance, SBOM, checksums, permissions, audit |
| Community contributes low-quality packs | Medium | Medium | Corpus grows but findings are disputed | Review rubric, controls, remediation, maintainers |
| Star goal drives bad decisions | Medium | Medium | Social activity rises but repeat use does not | North-star metric and kill criteria |
| Maintainer capacity becomes a bottleneck | High | High | PR/issue response slows | Ownership areas, contribution ladder, release runbook |

---

## 5. Time-boxed research experiments

### Experiment X1 — Proxy feasibility

**Time box:** Three to five focused engineering days.
**Question:** Can a local MCP stdio proxy forward a real client session and inject response loss with complete event capture?
**Success:** One client, one server, one duplicate-after-commit scenario, deterministic report, clean teardown.
**Failure response:** Narrow supported client assumptions or reconsider proxy architecture before building more mutations.

### Experiment X2 — Capture usefulness

**Time box:** Two to three focused engineering days.
**Question:** Can a successful session become a valid starter pack without misleading users?
**Success:** Pack validates, secrets are redacted, nondeterminism is marked, and a human can add an effect contract quickly.
**Failure response:** Keep the init wizard and improve pack templates before attempting broad auto-generation.

### Experiment X3 — Generic JSONL adoption

**Time box:** Two days plus one external example.
**Question:** Can a Python or JavaScript developer implement the adapter without reading internal source?
**Success:** Consumer emits events, runs a mutation, receives JUnit/JSON, and understands errors.
**Failure response:** Simplify the bridge rather than adding more fields.

### Experiment X4 — State observer trust

**Time box:** Two to four days.
**Question:** Can a local JSON snapshot observer safely detect a duplicate or missing effect?
**Success:** Observer is bounded, redacted, fail-closed, and works in a clean sample repository.
**Failure response:** Keep observer API but delay arbitrary command execution.

### Experiment X5 — Message positioning

**Time box:** One week of lightweight interviews or async tests.
**Question:** Does the duplicate-after-timeout story outperform generic “agent testing” language?
**Success:** Concrete side-effect message produces higher comprehension and demo activation.
**Failure response:** Adjust headline/examples, not core product semantics.

---

## 6. Scope change protocol

Any proposed addition must answer:

1. Which user problem does it solve?
2. Which P0/P1 metric does it improve?
3. Does it strengthen the effect-level failure-testing category?
4. Does it require a new protocol, credential, hosted service, or security boundary?
5. Can it reuse the normalized contract?
6. What tests and documentation does it require?
7. What existing work is delayed or removed?
8. Is it a core capability, an adapter, a community pack, or a launch asset?
9. What is the smallest experiment before implementation?
10. What evidence would cause us to stop?

No feature should enter P0 solely because it is technically interesting or likely to produce social attention.

---

## 7. Final decision table

| Proposal | Decision | Reason |
|---|---|---|
| Transparent local MCP proxy | Build now | Largest usefulness/adoption gap |
| Capture to starter pack | Build now | Removes hand-authoring barrier |
| Protocol-neutral event/effect contract | Build now | Enables wider community |
| JSON snapshot observer | Build now with strict safety | Makes state evidence portable |
| Commit-then-response-lost mutation | Build now | Highest-value failure semantics |
| JUnit output | Build now | Fits existing CI ecosystems |
| GitHub summary | Build now | Makes findings visible in review |
| Python wrapper | Build next | Broadens language access |
| JavaScript test helper | Build next | Reduces Node integration friction |
| OpenTelemetry export | Build next | Interoperates with observability |
| SARIF | Build later/opt-in | Useful but easy to misrepresent |
| HTTP transport | Monitor/next | Demand-driven, not critical to core |
| Hosted dashboard | Defer | Adds cost and privacy burden |
| Model judge | Defer | Conflicts with deterministic evidence |
| Security certification | Reject as product claim | Cannot be supported by scope |
| Large web UI | Defer | CLI/proxy path must prove value first |

---

## 8. Final unresolved questions before public expanded release

The following must have explicit answers in release notes or docs:

- Which local clients are verified through the proxy?
- Which target process models are supported?
- Which mutation phases are physically faithful versus simulated?
- What does “commit status unknown” mean in a report?
- Which observers are safe by default?
- What happens when an observer fails?
- How are captured secrets handled?
- Which languages have official examples?
- Which output formats are stable?
- What does the Action guarantee and not guarantee?
- What does the project do when a pack is nondeterministic?
- Who owns security response and release publishing?
- What is the minimum evidence for adding a new mutation?

These answers are part of the product, not merely implementation details.
