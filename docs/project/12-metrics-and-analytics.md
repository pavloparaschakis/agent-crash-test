# Success Metrics and Measurement Plan

## Measurement principles

Stars are a distribution signal. Product health must be measured through activation, repeat use, fixture creation, CI adoption, issue quality, and maintainer outcomes. Metrics must be privacy-preserving and opt-in where telemetry is involved.

## North-star metric

**Weekly active repositories with at least one passing Agent Crash Test fixture and one executed mutation profile.**

This measures real value rather than downloads or stars.

## Launch targets

Targets are hypotheses, not guarantees. “Success” measures genuine adoption; “stretch” preserves the 5k-star ambition without letting it dictate product decisions.

### Awareness and distribution

- 100 GitHub stars by day 30; 500 is the stretch target.
- 500 GitHub stars by day 90; 1,500 is the stretch target.
- 1,500 GitHub stars by month 12; 5,000 is the stretch target.
- 25 organic repository mentions by month 3; 100 is the stretch target.
- 25 public repositories running a pack or the GitHub Action by month 3.
- 50 public repositories running a pack or the GitHub Action by month 6.
- 10 community-authored fixtures by month 1.
- 50 community-authored fixtures by month 3.
- 150 community-authored fixtures by month 9.
- 20 stateful fixtures by month 3, including at least five extra-side-effect scenarios.
- 80% of accepted packs include a fault, explicit effect contract, deterministic assertion, and remediation note.

### Activation

- 60% of users who install the CLI complete the demo.
- 40% create a custom fixture during the first session.
- 40% create or modify a custom pack during the first session.
- 30% run at least one mutation profile.
- Median time to first meaningful finding under 120 seconds.
- Median time to first custom test under 15 minutes.
- 75% of quickstart users understand the failure report without help.
- 80% of external testers can correctly identify the unintended extra transition in the signature demo.

### Retention

- 35% of activated repositories rerun the tool within 14 days.
- 20% run it in CI within 30 days.
- 15% add or modify a fixture within 60 days.
- 10% submit a contribution, issue, discussion, or documentation improvement within 90 days.

### Reliability

- 95% of demo runs complete without an internal CLI error.
- Less than 2% unexplained flaky test rate in the core suite.
- Less than 1% fixture corruption rate.
- 100% of failure reports include a reproduction command.
- 100% of secrets in the redaction test corpus remain absent from persisted artifacts.

### Developer experience

- Install success above 95% on supported runtimes.
- 90% of documented commands produce the promised exit code.
- Median CI runtime under 5 minutes for the starter suite.
- 90% of contributors can add a fixture without maintainer pairing.
- First maintainer review on fixture PRs within 72 hours.

### Quality of findings

- At least 80% of findings judged actionable by external testers.
- At least 70% of findings lead to a concrete remediation change.
- Less than 10% of findings marked “not reproducible.”
- Less than 5% of findings disputed as misleading or overstated.
- Every stable rule has positive and negative test cases.
- At least 90% of state-diff findings show a minimal, correct expected-versus-observed delta.
- Less than 10% of state-diff findings require maintainer explanation to interpret.

### Community health

- At least 3 recurring contributors by month 3.
- At least 10 distinct fixture authors by month 6.
- Median issue first response under 48 hours.
- 80% of issues labeled within 72 hours.
- At least 20 accepted pull requests from non-maintainers by month 6.
- No single contributor accounts for more than 80% of fixture additions after month 6.

## Funnel definitions

```text
Repository visit
  → install
  → demo completed
  → server discovered
  → finding observed
  → state delta understood
  → custom pack created
  → CI enabled
  → repeat run
  → public badge/report
  → contribution
```

## Instrumentation

Default telemetry is off. Measure through GitHub release downloads, visible GitHub Action usage, public badge requests only if a hosted endpoint is later introduced, opt-in anonymous command events, documentation analytics with privacy-respecting settings, GitHub stars/forks/issues/discussions/PRs, and periodic maintainer surveys.

## Kill criteria

Reconsider the direction if, after three public releases and deliberate outreach, fewer than 20 external repositories complete the quickstart, fewer than 5 external users report a reproducible value event, more than 30% of users encounter installation failure, most users describe it as a generic scanner, fixture contributions remain below 5 after 90 days, or the mutation engine cannot produce stable, understandable failures.
