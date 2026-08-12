# Public Release and Operations Scope

**Purpose:** Define everything required to release, operate, explain, support, and maintain the expanded product as a credible open-source project.
**Release principle:** Public availability is easy; public trust requires reproducibility, boundaries, ownership, and maintenance.

---

## 1. Release shapes

### 1.1 Stable v0.1 baseline

The current local MCP stdio and fixture runner may be released as a narrow experimental baseline. Its documentation must say that it is scripted/fixture-first and does not yet exercise arbitrary real agents.

### 1.2 Expanded preview

The first release containing proxy, capture, effect/state contracts, and broader adapters should be labeled an experimental expanded preview until external validation completes.

### 1.3 Expanded public release

The expanded release may be announced as the project’s main public product only when all P0 functionality, trust gates, consumer repositories, external testers, and support processes pass.

Do not collapse these releases into one narrative. Users should know exactly what they are installing.

---

## 2. Repository readiness

### Required repository files

- README with one-sentence category and five-minute quickstart;
- LICENSE;
- CONTRIBUTING.md;
- CODE_OF_CONDUCT.md;
- SECURITY.md;
- SUPPORT.md;
- CHANGELOG.md;
- VERSIONING.md;
- release notes;
- platform support matrix;
- architecture and contract documentation;
- fixture contribution template;
- adapter contribution template;
- issue forms;
- pull request template;
- code ownership configuration;
- example consumer repositories;
- reproducible acceptance script;
- release runbook;
- explicit research and positioning page.

### README requirements

The top of the README must answer:

1. What does this catch?
2. Who should use it?
3. What does the first run look like?
4. Does it require production credentials?
5. Does it test a real agent or a scripted workflow?
6. What are the sandbox limitations?
7. How is it different from replay, evaluation, and security tools?

The README should show a concrete duplicate-side-effect report before listing architecture details.

---

## 3. Packaging and installation

### 3.1 npm package

At the approved public release point:

- remove the private package barrier;
- use a stable package name;
- publish only intended files;
- include executable entrypoint;
- include license and security metadata;
- verify package contents before publish;
- test install from an empty directory;
- test `npx` invocation;
- document Node engine requirement;
- document support policy and deprecation behavior.

### 3.2 Release archives or binaries

To reduce language/runtime friction, evaluate release artifacts for:

- macOS arm64;
- macOS x64 where feasible;
- Linux x64;
- Linux arm64 where feasible;
- Windows x64.

Each artifact must include:

- version;
- platform and architecture;
- checksum;
- license;
- SBOM or dependency manifest;
- installation instructions;
- verification instructions;
- source commit reference.

Do not add a binary distribution until startup, child-process, path, and signal behavior are tested in that distribution form.

### 3.3 Docker/Podman

Provide a documented image or recipe only if it improves safety or CI adoption. It must:

- pin the image or base version;
- run non-root;
- expose a clear workspace mount;
- state network behavior;
- preserve artifact output;
- avoid embedding secrets;
- have a small, repeatable smoke test.

### 3.4 GitHub Action

The Action must:

- use minimal permissions;
- pin third-party actions by commit or approved release policy;
- install/build deterministically;
- run the calling repository’s packs;
- upload reports on failure;
- write a concise summary;
- expose inputs that map directly to CLI behavior;
- document target trust and network limitations;
- have a separate consumer-repository test;
- be released with a tag and immutable commit reference.

---

## 4. Supply-chain trust

Because the tool launches local processes and is likely to run in CI, users must be able to verify what they are executing.

### Required controls

- locked dependencies;
- dependency audit;
- package content inspection;
- release checksums;
- provenance/attestation where supported;
- SBOM;
- pinned Action dependencies;
- minimal Action permissions;
- no hidden telemetry;
- no secrets in examples or artifacts;
- release process reviewed by a second maintainer when possible.

### Release verification

The release runbook must verify:

1. clean checkout;
2. clean dependency installation;
3. build;
4. unit/integration tests;
5. proxy acceptance;
6. capture acceptance;
7. package contents;
8. checksums and SBOM;
9. Action consumer run;
10. documentation links;
11. release notes;
12. rollback or yanking plan.

---

## 5. Documentation and onboarding

### Documentation paths

#### Path A — “I want to see it work”

- one-minute demo;
- duplicate-after-timeout explanation;
- passing versus failing report;
- no credentials;
- one next action.

#### Path B — “I maintain an MCP server”

- discovery;
- scripted pack;
- fixture state;
- proxy mode;
- idempotency and ambiguous outcome examples;
- GitHub Action.

#### Path C — “I maintain an agent application”

- configure real client through proxy;
- capture workflow;
- add effect contract;
- test retry and recovery behavior;
- run through local test suite.

#### Path D — “I use Python or another language”

- generic JSONL contract;
- Python wrapper;
- JUnit;
- adapter example;
- no TypeScript internals required.

#### Path E — “I want to contribute”

- fixture template;
- adapter template;
- review rubric;
- local validation command;
- redaction and safety rules;
- issue and discussion path.

### Documentation quality requirements

- every command is tested in CI or acceptance;
- every limitation is stated at the point of use;
- every code example has a corresponding fixture or consumer test;
- no page promises a deferred feature;
- every failure class has a short explanation and remediation;
- docs use the same terminology as schemas and reports;
- links are checked automatically.

---

## 6. Launch assets

### Required assets

- README hero GIF or short video;
- static before/after report image;
- architecture diagram;
- sample YAML pack;
- sample GitHub Action;
- “why ordinary tests miss this” explainer;
- comparison with replay and model evaluation;
- FAQ on credentials, safety, network, and determinism;
- technical launch article;
- short social post;
- maintainer-focused launch post;
- contributor-focused launch post;
- release notes;
- issue templates;
- demo repository.

### Demo requirements

The demo must show:

1. a successful requested action;
2. an injected response loss or timeout;
3. an unsafe retry;
4. the extra physical call;
5. the final state with duplicate effect;
6. the first divergent event;
7. a repaired or idempotent control passing the same test.

The demo should not depend on a paid model, external API, secret, or unreliable hosted service.

---

## 7. Support operations

### Issue categories

- installation;
- platform;
- pack/schema;
- mutation semantics;
- proxy/process lifecycle;
- observer/safety;
- report/CI;
- adapter;
- documentation;
- false positive;
- security report;
- feature proposal.

### Maintainer response targets

- acknowledge security reports promptly through the security policy;
- label normal issues within 72 hours where possible;
- first response within 48 hours as a target;
- triage false positives quickly because trust depends on them;
- publish known limitations rather than arguing with reproducible evidence;
- close stale issues only with a documented reason.

### Support templates

Every bug report should request:

- exact version;
- operating system and runtime;
- command;
- pack or minimal reproduction;
- report JSON if safe;
- whether the issue reproduces with fixture mode;
- whether the target is trusted;
- expected and observed behavior;
- redaction confirmation.

---

## 8. Security operations

### Security boundaries to document

- local target code execution;
- no default host-network denial;
- observer command execution only when explicitly enabled;
- secrets may appear in target output unless redaction works;
- packs may reference commands and paths;
- production testing is not implied or authorized;
- external sandbox is required for untrusted targets.

### Security review checklist

- pack path traversal;
- command injection through pack fields;
- environment inheritance;
- stdout/stderr leakage;
- report redaction;
- capture persistence;
- observer escalation;
- child process cleanup;
- archive extraction;
- Action permissions;
- dependency vulnerabilities;
- package provenance;
- malicious community fixture.

### Incident response

Define procedures for:

- secret leaked in a fixture;
- unsafe pack merged;
- release artifact compromised;
- Action dependency compromised;
- process leak or host impact;
- false safety claim in documentation;
- materially incorrect mutation semantics.

Each procedure must include containment, communication, fix, release, and post-incident documentation.

---

## 9. Release checklist

### Product

- [ ] Product category and promise are accurate.
- [ ] P0 capabilities are implemented.
- [ ] Proxy and capture status is not overstated.
- [ ] Non-goals are visible.

### Engineering

- [ ] Unit, integration, end-to-end, and cross-platform checks pass.
- [ ] No orphan processes.
- [ ] Reports agree across renderers.
- [ ] Findings have stable fingerprints.
- [ ] Mutation versions are recorded.

### Security

- [ ] Redaction corpus passes.
- [ ] No secrets in repository or artifacts.
- [ ] Network boundary is documented.
- [ ] Unsafe operations are opt-in.
- [ ] Dependency and supply-chain checks pass.

### Distribution

- [ ] Public package or release artifact verified.
- [ ] Checksums/SBOM/provenance available.
- [ ] GitHub Action consumer test passes.
- [ ] Platform matrix is honest.
- [ ] Version and changelog are consistent.

### Community

- [ ] Contribution path is tested.
- [ ] Canonical corpus is reviewed.
- [ ] Maintainers and CODEOWNERS are named.
- [ ] Security and support paths work.
- [ ] Release notes credit contributors.

### Launch

- [ ] Demo is recorded.
- [ ] README quickstart verified by an external tester.
- [ ] Technical article is accurate.
- [ ] Social posts avoid inflated claims.
- [ ] Announcement links to an immediately usable artifact.

---

## 10. Rollback and deprecation

### Rollback triggers

- security issue in release artifact;
- report corruption or redaction regression;
- proxy creates unsafe hidden calls;
- major false-pass bug;
- Action compromise;
- release cannot reproduce documented demo.

### Rollback plan

- stop promoting affected release;
- mark version as withdrawn;
- publish known-impact notice;
- provide last known good version;
- fix and test;
- publish replacement release;
- document the incident and migration.

### Deprecation policy

- announce schema or command deprecation;
- provide replacement;
- retain compatibility for at least one documented release cycle where practical;
- show a clear warning;
- update examples and consumer tests;
- do not silently reinterpret a mutation.

---

## 11. Operations definition of done

The expanded project is operationally ready when a maintainer other than the original author can:

1. reproduce a release from a clean checkout;
2. publish or verify artifacts;
3. run the consumer Action test;
4. triage an installation or false-positive issue;
5. review a fixture contribution;
6. handle a security report;
7. roll back a bad release;
8. update the compatibility matrix;
9. explain the current product boundary;
10. run the acceptance suite without private context.
