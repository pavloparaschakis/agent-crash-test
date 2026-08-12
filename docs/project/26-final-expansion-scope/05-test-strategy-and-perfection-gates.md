# Test Strategy and Perfection Gates

**Purpose:** Define what must be tested, what “perfection” means for this project, and what evidence is required before each expanded release.
**Core principle:** A reliability-testing tool must itself be more deterministic, reviewable, and bounded than the failures it is designed to expose.

---

## 1. Testing philosophy

The expanded project must be tested as both:

1. **a test engine** that must faithfully inject faults and evaluate contracts; and
2. **a developer product** that must be understandable, installable, safe, and useful in CI.

The test strategy must therefore cover:

- semantic correctness;
- physical event fidelity;
- state observation correctness;
- process lifecycle;
- determinism;
- redaction and safety;
- output compatibility;
- cross-platform installation;
- adapter compatibility;
- contributor experience;
- external user success.

Passing unit tests alone is not sufficient.

---

## 2. Testing pyramid

```text
                        External usability and consumer repos
                   Cross-platform / Action / release acceptance
              Proxy and adapter end-to-end integration tests
         Mutation, state observer, report, lifecycle integration tests
      Unit tests for schemas, normalization, redaction, assertions, fingerprints
```

### Recommended distribution

- 50–60% unit tests;
- 25–30% integration tests;
- 10–15% end-to-end proxy/consumer tests;
- continuous manual/external acceptance for usability and trust boundaries.

The exact percentages are less important than ensuring that every semantic mutation has both a focused unit test and a full workflow control.

---

## 3. Test layers

### 3.1 Unit tests

Cover:

- pack schema and semantic validation;
- v1-to-v2 compatibility;
- effect contract parsing;
- mutation phase parsing;
- mutation scheduling and occurrence matching;
- seed stability;
- commit/response status normalization;
- logical/physical event correlation;
- state diff and path semantics;
- observer policy validation;
- finding fingerprint stability;
- redaction patterns;
- report renderer escaping;
- JUnit XML escaping;
- JSONL record validation;
- adapter capability validation;
- exit code policy.

### 3.2 Integration tests

Cover:

- fixture client and state oracle;
- current scripted MCP runner;
- transparent MCP proxy;
- target startup and cleanup;
- target hang and crash;
- capture and starter-pack generation;
- JSON snapshot observer;
- report generation from one normalized run;
- Action invocation from a sample repository;
- package installation in a clean consumer directory.

### 3.3 End-to-end tests

Cover:

- a real test client talks through the proxy to a test MCP server;
- a timeout after commit causes the client to retry;
- the state observer detects one versus two effects;
- a fixed client passes the same pack;
- a malformed result causes a safe stop rather than a hidden extra action;
- a permission denial does not create a compensating or unauthorized side effect;
- a stale read cannot overwrite newer state;
- a failed run still writes a redacted report;
- a released package can execute the same scenario.

### 3.4 External acceptance tests

Recruit testers who did not write the code and give them:

- the README quickstart;
- a clean repository or package;
- a deliberately broken test server/client;
- no private maintainer explanation.

Measure whether they can:

- identify what the tool does;
- run the demo;
- explain the expected and observed effect;
- create or capture a custom pack;
- fix the failing behavior;
- add it to CI;
- explain the safety boundary.

---

## 4. Mutation test matrix

Every mutation needs a semantic definition, unit test, passing control, failing control, report snapshot, and remediation text.

| Mutation | Control behavior | Broken behavior | Required evidence |
|---|---|---|---|
| Timeout | caller retries safely or queries outcome first | caller blindly repeats a write | commit status, response status, physical calls, final state |
| Retryable error | retry is idempotent | retry duplicates effect | retry chain and state cardinality |
| Malformed result | caller stops or validates | caller performs unsafe next action | malformed client-visible result and extra call |
| Stale result | caller detects version/context mismatch | caller acts on stale data | source/target context and state change |
| Duplicate call | duplicate is deduplicated | second effect occurs | parent/child physical events and delta |
| Permission denied | no effect and safe explanation | success assumed or compensating action occurs | denial and forbidden calls |
| Commit then response lost | query or idempotency prevents duplicate | blind retry creates duplicate | committed/unknown result and retry |
| Disconnect after commit | recovery confirms outcome | recovery repeats action | transport event and final state |
| Partial success | compensation or reconciliation occurs | inconsistent state remains hidden | per-effect transition set |
| Stale read/conflicting write | version check or merge protects newer state | lost update | before/read/write versions |

### Mutation-specific acceptance template

For each mutation:

- Given a known initial state;
- Given a target operation and effect contract;
- When the mutation is applied at its declared phase;
- Then the client-visible result matches the mutation contract;
- And the physical target events are recorded completely;
- And the state observer reports the true final state;
- And the expected control passes;
- And the broken control fails with the intended finding;
- And the report contains a remediation and reproduction command;
- And the same seed produces the same result.

---

## 5. Proxy test matrix

### Transport behavior

- initialization forwarding;
- tool discovery forwarding;
- normal request/response forwarding;
- multiple sequential calls;
- concurrent calls if supported;
- large but bounded messages;
- malformed client message;
- malformed target message;
- target EOF;
- proxy EOF;
- target non-zero exit;
- target never starts;
- target starts then hangs;
- target writes stderr containing secret-shaped data;
- signal interruption;
- cleanup after timeout.

### Correlation behavior

- client operation ID preserved;
- generated operation ID when absent;
- retry preserves logical ID;
- duplicate creates distinct physical IDs;
- observer events are ordered after the relevant call;
- same timestamp does not reorder events;
- parallel operations do not cross-correlate.

### Fault behavior

- mutation applies only to matching tool;
- occurrence count is correct;
- multiple mutations have documented ordering;
- unmatchable mutation is reported;
- mutation budget ends cleanly;
- mutation phase is present in report;
- target effect is not accidentally skipped when mutation says “after commit.”

---

## 6. State observer test matrix

### Fixture observer

- initial snapshot;
- after snapshot;
- nested paths;
- arrays and cardinality;
- increment/set/append;
- missing path;
- observer error;
- redacted value;
- forbidden change.

### Tool probe observer

- declared read-only annotation;
- missing annotation;
- explicit unsafe opt-in;
- unsafe flag missing;
- probe timeout;
- probe malformed result;
- probe mutates state unexpectedly;
- probe error is blocking when required;
- probe event appears in timeline.

### JSON snapshot observer

- command success;
- command failure;
- timeout;
- oversized output;
- invalid JSON;
- secret redaction;
- inherited environment blocked;
- working-directory escape blocked;
- path traversal rejected;
- observer classification rendered.

### Observer truth tests

These are critical:

- effect exists but response fails;
- response succeeds but effect does not exist;
- observer fails while effect exists;
- observer returns stale state;
- observer returns a value with a secret;
- two physical calls result in one deduplicated effect;
- one physical call results in two effects.

The assertion engine must never infer “no effect” from “no observation.”

---

## 7. Capture test matrix

- capture normal session;
- capture multiple tools;
- capture no calls;
- capture canceled by user;
- capture target crash;
- capture target timeout;
- capture malformed protocol;
- capture redacts arguments;
- capture redacts results;
- capture redacts stderr;
- capture detects nondeterministic timestamps;
- capture marks missing effect contract;
- capture generates valid starter pack;
- capture preview does not write files;
- capture output is stable under repeated runs;
- capture never uploads data by default.

### Starter-pack quality checks

Every generated starter pack must:

- validate against the schema;
- include the target adapter and version;
- include a human-readable name;
- include captured steps;
- include a mutation placeholder or selected profile;
- include an explicit effect-contract TODO if no observer exists;
- include a safe working-directory policy;
- include a redaction summary;
- include a warning that capture is not correctness proof.

---

## 8. Report and renderer tests

### Cross-renderer invariants

For one run:

- terminal, Markdown, JSON, JUnit, and GitHub summary must agree on pass/fail status;
- finding IDs and fingerprints must match;
- mutation IDs and versions must match;
- expected/observed categories must match;
- redaction status must not differ silently;
- unsupported and inconclusive status must not become failure or success accidentally.

### Security tests

Include secrets in:

- tool arguments;
- output objects;
- raw text content;
- errors;
- stderr;
- descriptions;
- annotations;
- URLs and query parameters;
- environment names;
- JUnit failure messages;
- Markdown code blocks;
- JSONL captures;
- OTel attributes.

Verify secrets do not appear in persisted artifacts, process logs, or the default terminal report.

### Fingerprint tests

- same semantic finding, different timestamp → same fingerprint;
- same finding, different absolute path → same fingerprint;
- changed mutation version → intentional fingerprint change;
- changed assertion ID → intentional fingerprint change;
- changed expected effect → intentional fingerprint change;
- different first divergent event → different fingerprint;
- collision corpus remains collision-free for canonical examples.

---

## 9. Cross-platform and release tests

### Supported matrix

Test the documented Node versions and operating systems, including:

- macOS arm64;
- macOS x64 where available;
- Linux x64;
- Linux arm64 where available;
- Windows PowerShell and command resolution.

### Required checks

- install from package;
- install from release archive/binary;
- run demo;
- run fixture pack;
- run MCP stdio pack;
- run proxy test;
- run capture;
- write artifacts;
- clean up child processes;
- handle paths with spaces;
- handle non-ASCII paths;
- handle CRLF input;
- handle permission errors;
- handle Ctrl-C/termination;
- run through GitHub Action.

### Supply-chain checks

- lockfile verification;
- dependency audit;
- package contents inspection;
- license inspection;
- SBOM generation;
- checksum verification;
- provenance/attestation verification where available;
- Action pinning check;
- no test credential in published artifact;
- no accidental source-preview secrets.

---

## 10. Performance and flake gates

### Required thresholds

- zero unexplained flakes in the core mutation/control suite across 100 repeated runs;
- proxy overhead under the documented local target when idle;
- no unbounded memory growth across a 10,000-event fixture;
- no report renderer that hangs on malformed or oversized values;
- no process leaks across 100 proxy runs;
- capture completes within the documented budget for the standard demo;
- CI starter suite completes within five minutes on a standard hosted runner.

### Flake policy

Any retry added to hide a flake must be accompanied by:

- root-cause issue;
- reason the retry is safe;
- maximum retry count;
- metric for recurrence;
- owner;
- removal plan.

Retries must never mask a semantic failure or an orphan process.

---

## 11. External usability acceptance

### Tester profile

Use at least five testers across:

- one MCP server maintainer;
- one agent application developer;
- one Python developer;
- one JavaScript/TypeScript developer;
- one open-source maintainer who did not build an agent.

### Script

Provide only:

- repository/package link;
- quickstart;
- demo target;
- starter workflow;
- issue template.

Do not explain the project orally before the first run.

### Record

- time to first successful demo;
- time to first meaningful finding;
- time to explain expected versus observed effect;
- time to create or capture a custom pack;
- time to CI integration;
- confusion points;
- trust/safety concerns;
- whether the tester would use it again;
- whether the tester would contribute a fixture.

### Pass criteria

- at least four of five testers complete the demo;
- at least four correctly explain the duplicate or forbidden effect;
- at least three create or capture a custom pack;
- at least three run it in CI or a local equivalent;
- no tester believes the tool provides a security certification;
- no critical secret-leak or unsafe-execution issue is found.

---

## 12. Perfection gates

### Gate A — Semantic perfection

- every P0 mutation has a positive and negative control;
- phase and commit/response status are accurate;
- logical and physical events are complete;
- state assertions fail closed;
- report findings are actionable;
- no known false pass remains in the control corpus.

### Gate B — Product perfection

- demo is self-explanatory;
- capture path works;
- custom pack path is under ten minutes;
- real-client proxy works;
- Python and JavaScript examples work;
- CI output is reviewable;
- docs explain limitations without maintainer narration.

### Gate C — Trust perfection

- secrets remain absent from artifacts;
- unsafe boundaries are visible before execution;
- external sandbox option is documented;
- package and Action supply chain is verifiable;
- no telemetry is enabled by default;
- security reports have a response path.

### Gate D — Community perfection

- contributors can add packs independently;
- review rules are objective;
- corpus categories are discoverable;
- fixture authors receive credit;
- maintainers can reject unsafe or ungrounded packs consistently;
- no single maintainer is the only person who can release the project.

---

## 13. Release decision matrix

| Result | Decision |
|---|---|
| Core semantics pass, proxy and capture pass, external users pass | Proceed with expanded public release |
| Core semantics pass, proxy works, capture needs simplification | Release proxy preview; label capture experimental |
| Core semantics pass, proxy blocked | Release only narrow scripted/fixture preview; do not claim real-agent support |
| State observers produce false passes | Stop expansion; fix trust model before adding integrations |
| Cross-platform install fails for a supported platform | Remove platform from support matrix or fix before claim |
| External testers cannot understand findings | Simplify reports and onboarding before adding features |
| Community cannot add fixtures | Improve contribution workflow before promoting corpus size |
| Findings are mostly generic or ungrounded | Narrow mutations and require stronger effect contracts |

---

## 14. Final perfection statement

Agent Crash Test is “perfect enough” for its intended purpose when it is easier to use than writing a one-off failure script, more trustworthy than inspecting an output string, more actionable than a raw trace, and more portable than a framework-specific test harness—while remaining honest about what it cannot prove.
