# Community Corpus and Adapter Program

**Purpose:** Make the reusable failure corpus and adapter ecosystem the project’s main community asset.
**Core belief:** The long-term moat is not the number of CLI commands. It is the quality, portability, and trustworthiness of the failure cases the community can reuse.

---

## 1. Community strategy

The project should create a positive loop:

```text
Failure story
  → minimal local reproduction
  → crash-test pack
  → passing control
  → clear remediation
  → community review
  → reusable corpus asset
  → new regression protection for other projects
```

The corpus must be useful even when the contributor cannot share the original production code. A good pack captures the failure semantics, not private application details.

---

## 2. Corpus goals

### First public expansion release

- 20 reviewed canonical packs;
- at least 8 effect classes or distinct side-effect patterns;
- at least 6 mutation classes represented;
- at least 5 extra/duplicate-effect scenarios;
- at least 5 stale or conflicting-state scenarios;
- at least 3 authorization/confirmation scenarios;
- at least 3 ambiguous-outcome scenarios;
- passing and failing controls for every canonical pack;
- no credentials or production endpoints;
- every pack runnable offline.

### Six months after expansion release

- 50 reviewed packs;
- at least 15 non-maintainer authors;
- at least 10 packs used by external repositories;
- at least 5 packs contributed from incidents or real maintenance stories;
- at least 3 maintained adapter examples;
- quarterly compatibility report;
- a clear deprecation and replacement process for stale packs.

### One-year stretch

- 100+ reviewed packs;
- contributors from at least three language communities;
- packs imported or referenced by external testing frameworks;
- a maintained registry/index that remains optional and static-first;
- community maintainers for major categories.

Counts are directional. A smaller corpus of genuinely reproducible and understandable cases is more valuable than a large collection of unreviewed YAML files.

---

## 3. Corpus taxonomy

### 3.1 By effect class

- `read`;
- `create`;
- `update`;
- `delete`;
- `send`;
- `approve`;
- `deploy`;
- `publish`.

### 3.2 By failure class

- timeout;
- retryable error;
- response lost after commit;
- disconnect after commit;
- malformed result;
- stale result;
- duplicate call;
- permission denied;
- partial success;
- conflicting state;
- missing confirmation;
- unsafe extra transition.

### 3.3 By state model

- scalar counter;
- collection cardinality;
- object version;
- append-only event log;
- authorization record;
- approval state;
- deployment state;
- message delivery record.

### 3.4 By integration mode

- fixture-only;
- scripted MCP stdio;
- transparent MCP proxy;
- generic JSONL;
- Python wrapper;
- JavaScript wrapper;
- custom observer.

### 3.5 By determinism

- fully deterministic;
- deterministic with seeded variation;
- partially deterministic;
- nondeterministic/diagnostic only.

Nondeterministic packs must not block a default CI check without explicit policy.

---

## 4. Canonical fixture families

### 4.1 Create-once family

Examples:

- create issue;
- create invoice;
- create calendar event;
- create deployment;
- enqueue job.

Required checks:

- exactly one object;
- stable idempotency key;
- no duplicate notification;
- query-before-retry or safe dedupe after response loss.

### 4.2 Update-with-version family

Examples:

- update customer record;
- modify task status;
- update a file manifest;
- change configuration.

Required checks:

- stale version rejected or reconciled;
- newer state preserved;
- retry does not overwrite a later update;
- report shows version/context mismatch.

### 4.3 Send-after-confirmation family

Examples:

- send email;
- publish message;
- issue notification;
- submit an external form.

Required checks:

- confirmation requirement is explicit;
- permission denial results in no send;
- malformed result does not trigger a second send;
- duplicate delivery is detected.

### 4.4 Approval and authorization family

Examples:

- refund approval;
- production deployment approval;
- deletion confirmation;
- access grant.

Required checks:

- prerequisite lookup occurred;
- correct actor/permission is present;
- denied action has no hidden side effect;
- a failure cannot be misrepresented as approval.

### 4.5 Deploy-once family

Examples:

- trigger a build;
- deploy an artifact;
- rotate a test credential;
- publish a release.

Required checks:

- ambiguous outcome is reconciled;
- no duplicate deployment;
- status query follows unknown result;
- report distinguishes “started,” “completed,” and “unknown.”

---

## 5. Pack contribution specification

Every pack contribution must include:

1. pack ID and stable name;
2. one-paragraph failure story;
3. user and effect class;
4. minimal initial state;
5. minimal steps or adapter input;
6. mutation and phase;
7. intended effect;
8. forbidden effect;
9. recovery expectation;
10. passing control;
11. intentionally broken control;
12. expected report excerpt;
13. remediation guidance;
14. reproducibility command;
15. determinism classification;
16. safety and data-boundary declaration;
17. author and source attribution;
18. tests.

### Pack review questions

- Is this a real failure mode rather than a contrived assertion?
- Does the mutation represent the semantic condition claimed?
- Is the state observer safe and sufficient?
- Could the pack pass because observation failed?
- Is the expected effect unambiguous?
- Is the forbidden effect concrete?
- Can a contributor reproduce it offline?
- Does the remediation help a maintainer fix the root cause?
- Does the pack duplicate an existing case without adding insight?
- Does it contain secrets, proprietary data, or an unauthorized target?
- Is the severity justified?

---

## 6. Contribution levels

### Level 1 — User and reporter

- run demo;
- report a bug;
- attach redacted report;
- suggest clearer terminology;
- identify a false positive or false pass.

### Level 2 — Documentation contributor

- improve quickstart;
- add a language example;
- explain a failure class;
- improve platform instructions;
- translate a core page.

### Level 3 — Fixture author

- add or improve a pack;
- add passing/failing controls;
- add remediation;
- add report snapshot;
- participate in review.

### Level 4 — Adapter contributor

- add JSONL integration;
- add Python or JavaScript wrapper;
- add state observer;
- add trace import/export;
- add compatibility example.

### Level 5 — Engine contributor

- add mutation;
- improve proxy;
- add report renderer;
- improve lifecycle or security;
- change schema with migration support.

### Level 6 — Maintainer

- review semantics;
- curate taxonomy;
- maintain release compatibility;
- respond to security reports;
- coordinate community challenges;
- steward contributor ownership.

---

## 7. Adapter program

### 7.1 Adapter contract

Every adapter must document:

- protocol or framework;
- language;
- installation;
- supported execution mode;
- correlation behavior;
- mutation capabilities;
- observer capabilities;
- determinism;
- credentials and data boundary;
- failure semantics;
- example repository;
- maintenance owner.

### 7.2 Adapter tiers

#### Tier 1 — Official core adapters

- fixture;
- MCP stdio scripted;
- MCP stdio transparent proxy;
- generic JSONL.

#### Tier 2 — Official community adapters

- Python/pytest;
- JavaScript/Node test runner;
- OpenTelemetry exporter;
- snapshot observer.

#### Tier 3 — Community-maintained adapters

- framework-specific wrappers;
- other protocol transports;
- language-specific assertion helpers;
- CI providers beyond GitHub.

Tier 3 adapters must not be implied to have the same support level as Tier 1.

### 7.3 Adapter acceptance

- passes the shared contract conformance suite;
- emits complete logical/physical events;
- declares unsupported capabilities;
- never silently drops a call or error;
- includes a clean example;
- includes lifecycle and redaction tests;
- pins or documents dependencies;
- names an owner or maintenance status.

---

## 8. Community governance

### Initial governance

- benevolent maintainer with public decisions;
- CODEOWNERS for core, adapters, corpus, and docs;
- required review for schema/mutation changes;
- security policy and private reporting path;
- no requirement for a CLA unless legal counsel later establishes a need;
- contributor attribution in pack metadata and releases.

### Growth governance

When recurring contributors appear:

- add area maintainers;
- document decision rights;
- rotate corpus review;
- establish release shepherd role;
- publish deprecation policy;
- add a lightweight RFC process for new mutations and schemas.

### RFC triggers

Require an RFC or decision record for:

- new mutation semantics;
- breaking pack schema changes;
- changes to default safety behavior;
- new external credential behavior;
- new network transport;
- any claim that could be interpreted as security certification;
- telemetry or hosted service additions.

---

## 9. Community rituals

### Weekly

- review new fixture and false-positive issues;
- publish one small “failure of the week” example;
- label new mutation or adapter proposals.

### Monthly

- community challenge;
- contributor office hour or async review thread;
- pack quality audit;
- highlight an external repository using the tool.

### Quarterly

- compatibility report;
- stale-pack review;
- maintainer health review;
- roadmap and scope review;
- release or corpus milestone.

---

## 10. Compatibility cards

Every official adapter should have a generated compatibility card:

```text
Adapter: MCP stdio proxy
Language: transport-level
Real client: yes
Physical event capture: yes
Response mutation: yes
Disconnect mutation: yes
State observer: external adapter required
Determinism: partial for external target
Sandbox: not enforced by default
CI: GitHub Action, JUnit, JSON
Support: official
```

Cards should be generated from adapter metadata and tested against actual capabilities. They must not be marketing-only claims.

---

## 11. Community safety rules

- never encourage testing a system without authorization;
- never publish private traces without permission and redaction;
- do not include production credentials;
- do not make a real destructive action a default example;
- use test doubles and sandboxed resources;
- do not shame maintainers for failures;
- describe observed behavior without overstating security conclusions;
- route vulnerabilities through the security policy rather than public fixture issues.

---

## 12. Community success gates

The community program is working when:

- a new contributor can add a fixture without maintainer pairing;
- accepted packs have a low false-positive dispute rate;
- fixture authors return to improve or add another case;
- external repositories reuse packs or patterns;
- adapters document their limitations honestly;
- the corpus is searchable by effect and failure class;
- releases credit and retain contributors;
- no single person reviews, authors, and releases every community asset.
