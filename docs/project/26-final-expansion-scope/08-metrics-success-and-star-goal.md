# Metrics, Success Definition, and the 5,000-Star Goal

**Purpose:** Define exactly how product usefulness, technical quality, community health, distribution, and the aspirational GitHub-star goal will be measured.
**Measurement principle:** Stars are a distribution signal; repeatable user value is the product outcome.

---

## 1. North-star metric

### Weekly active repositories with a passing effect contract and an executed mutation

This is the primary metric because it proves the project is being used as a reliability check rather than merely bookmarked, installed once, or starred.

Count a repository once per week when it:

1. executes at least one Agent Crash Test pack;
2. executes at least one mutation profile or explicit fault case;
3. has at least one passing effect/state contract;
4. does not rely only on the bundled demo.

Default measurement should be privacy-preserving and based on public CI signals, opt-in reports, release surveys, or manually validated external repositories. Telemetry must remain off by default.

---

## 2. Product objectives and key results

### Objective A — Make first value immediate

| Key result | Commit target | Stretch target | Measurement |
|---|---:|---:|---|
| Demo completion rate | 70% | 85% | Quickstart test cohort |
| Median time to first meaningful finding | 10 minutes | 5 minutes | External tester timing |
| Median time to first custom/captured pack | 15 minutes | 10 minutes | Cohort timing |
| Users who understand expected vs observed effect | 75% | 90% | Comprehension question |
| Users who can explain safety boundary | 80% | 95% | Post-task survey |

### Objective B — Make findings trustworthy

| Key result | Commit target | Stretch target | Measurement |
|---|---:|---:|---|
| Blocking findings with reproduction command | 100% | 100% | Report validation |
| Blocking findings with expected/observed evidence | 95% | 100% | Report corpus audit |
| Findings judged actionable by external testers | 80% | 90% | Tester rubric |
| Findings disputed as misleading | <10% | <5% | Issue/discussion labels |
| Findings not reproducible | <10% | <5% | Re-run records |
| Core mutation false-pass rate | 0% known | 0% | Control corpus and adversarial tests |

### Objective C — Become easy to integrate

| Key result | Commit target | Stretch target | Measurement |
|---|---:|---:|---|
| Clean install success on supported platforms | 95% | 99% | Release matrix |
| CI starter suite runtime | <5 minutes | <2 minutes | Consumer repos |
| External repos running a pack or Action by month 3 | 25 | 50 | Public evidence/opt-in reporting |
| External repos running a pack or Action by month 6 | 50 | 100 | Public evidence/opt-in reporting |
| Python and JavaScript examples | 1 each | 3 each | Maintained examples |
| External client tested through proxy | 5 repos | 15 repos | Consumer validation |

### Objective D — Build a community-owned corpus

| Key result | Commit target | Stretch target | Measurement |
|---|---:|---:|---|
| Reviewed canonical packs at expanded release | 20 | 30 |
| Community-authored packs by month 3 | 10 | 25 |
| Community-authored packs by month 9 | 50 | 100 |
| Distinct pack authors by month 6 | 10 | 20 |
| Non-maintainer fixture PRs by month 6 | 20 | 50 |
| Accepted packs with complete effect/remediation metadata | 80% | 95% |

### Objective E — Earn attention honestly

| Key result | Commit target | Stretch target | Measurement |
|---|---:|---:|---|
| GitHub stars by day 30 | 100 | 500 |
| GitHub stars by day 90 | 500 | 1,500 |
| GitHub stars by month 12 | 1,500 | 5,000 |
| Organic repository mentions by month 3 | 25 | 100 |
| Public technical writeups or demos by month 6 | 10 | 30 |
| Repeat weekly active repositories by month 6 | 25 | 75 |

The 5,000-star number is a stretch distribution goal, not a guarantee or a reason to sacrifice product quality.

---

## 3. Activation funnel

```text
Repository visit
  → understands the promise
  → installs or invokes the Action
  → runs safe demo
  → sees a concrete failure
  → understands state delta
  → captures or authors a custom pack
  → runs a mutation in CI
  → fixes a finding
  → reruns successfully
  → contributes or reuses a fixture
```

Track conversion and drop-off at each stage. The most important activation events are:

- demo completed;
- first failure understood;
- first custom/captured pack created;
- first CI run;
- first fixed regression;
- first repeat run;
- first community contribution.

---

## 4. Quality scorecard

### Correctness

- all unit/integration/acceptance tests pass;
- no known semantic false passes;
- every mutation has controls;
- event timelines are complete;
- state observations fail closed;
- fingerprints are stable.

### Reliability

- less than 2% unexplained flake rate in the core suite;
- zero orphan-process incidents in 100 proxy runs;
- 95% of demo runs succeed without internal CLI errors;
- no unbounded artifact growth;
- clean termination on interrupt and timeout.

### Safety

- 100% of redaction corpus secrets absent from persisted artifacts;
- no default telemetry;
- unsafe boundaries shown before execution;
- no production endpoint or credential in bundled fixtures;
- release artifacts contain no secrets;
- supply-chain checks pass.

### Developer experience

- 90% of documented commands work exactly as documented;
- first meaningful finding under ten minutes;
- first custom pack under fifteen minutes;
- 90% of fixture contributors succeed without pairing;
- first maintainer response within 48 hours;
- fixture review within 72 hours where capacity allows.

---

## 5. Measurement methods

### Public repository evidence

- GitHub Action workflow references;
- public pack directories;
- pull requests and discussions;
- public case studies;
- package/release download counts;
- issue labels;
- stars, forks, watchers, and mentions.

### Opt-in evidence

- anonymous activation survey;
- opt-in report metadata;
- consumer repository feedback;
- external maintainer interviews;
- fixture contribution form;
- periodic user interviews.

### No-default-telemetry rule

Do not collect tool arguments, prompts, results, traces, repository contents, environment values, or user identity by default. If telemetry is ever introduced:

- make it opt-in;
- document every field;
- provide a disable flag;
- redact before transmission;
- avoid content capture by default;
- publish retention and deletion behavior;
- keep local-only operation fully supported.

---

## 6. Metrics review cadence

### Weekly review

- north-star repositories;
- new installs and demo completions where measurable;
- failures and false-positive reports;
- proxy and capture issues;
- new community contributions;
- support response time;
- release health.

### Monthly review

- activation funnel;
- repeat usage;
- CI adoption;
- corpus growth and quality;
- language/adapter mix;
- competitive changes;
- roadmap changes based on evidence.

### Quarterly review

- objective/key-result grading;
- external repository retention;
- community ownership;
- mutation usefulness;
- 5k-star trajectory as a distribution signal;
- whether the product category remains differentiated;
- whether any P2 feature should be promoted.

---

## 7. Success versus vanity

### Strong evidence of success

- an external repository adds a regression pack after a real bug;
- a maintainer reruns the same pack across releases;
- a contributor adds a high-quality fixture;
- a user fixes a duplicate or forbidden effect because of a report;
- a framework or adapter maintainer integrates the contract;
- the corpus is reused by projects the original author does not control.

### Weak evidence by itself

- stars;
- one-time downloads;
- social impressions;
- demo GIF views;
- total issue count;
- total packs without quality review;
- a large number of “supported” integrations with no consumer evidence.

---

## 8. 5,000-star growth plan

### Stage 1 — Proof of pain

Publish:

- the duplicate-after-timeout demo;
- a short technical explanation;
- a one-command local run;
- a before/after report;
- a clear statement of what is and is not tested.

### Stage 2 — Proof of usefulness

Publish:

- real external examples;
- a corpus of common failure packs;
- CI integration examples;
- Python and JavaScript integrations;
- a case study where the tool caught a concrete regression.

### Stage 3 — Proof of community ownership

Publish:

- contributor-authored fixture stories;
- monthly challenges;
- compatibility cards;
- adapter contributions;
- release notes with community authors.

### Stage 4 — Distribution

Use:

- GitHub Action marketplace/search discovery;
- npm and release binaries;
- relevant framework documentation examples;
- technical blog posts;
- conference or meetup demos;
- open-source maintainer outreach;
- direct links from adjacent tools where integration is mutually useful.

Do not use artificial star campaigns, misleading “guaranteed 5k” language, or mass unsolicited promotion.

---

## 9. Kill criteria and pivot triggers

Reconsider the strategy after three public releases and deliberate outreach if:

- fewer than 20 external repositories complete the quickstart;
- fewer than 5 external users report a reproducible value event;
- more than 30% of testers fail installation;
- most users describe it as a generic scanner or replay viewer;
- capture does not reduce setup time;
- proxy support cannot produce trustworthy physical event evidence;
- fixture contributions remain below 5 after 90 days;
- more than 20% of findings are disputed as misleading;
- state observers frequently produce inconclusive or unsafe results;
- the project attracts stars but no repeat repository usage.

Possible pivots include:

- specialize in MCP server reliability;
- specialize in exactly-once side-effect testing;
- become a contract/fixture library consumed by other runners;
- focus on the proxy and failure-injection engine;
- collaborate with an existing replay or agent-evaluation project rather than competing with it.

---

## 10. Final success definition

The project is successful when developers reach for it before releasing a tool-using workflow because it is the fastest way to turn an uncertain side-effect failure into a deterministic regression test.

The project is exceptionally successful when the community’s shared fixture corpus, adapter contract, and failure vocabulary become reusable infrastructure across agent frameworks and tool ecosystems.

The 5,000-star goal is a possible result of that usefulness. It is not the definition of it.
