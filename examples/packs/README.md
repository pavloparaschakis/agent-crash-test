# Fixture contribution template

Use this guide to add one small, reviewable crash-test pack. The goal is a
reproducible failure contract—not a production integration, a generic
benchmark, or a claim that a tool is secure.

## What a good contribution contains

Every pack should answer these questions in the YAML and its pull request:

1. What tool workflow is being tested?
2. Which realistic fault is injected?
3. What state/effect was intended?
4. What extra, missing, duplicated, stale, or forbidden effect must be caught?
5. What should a maintainer change to remediate it?

Prefer a deterministic `transport: fixture` pack when the failure can be
represented without a real server. Use `transport: stdio` only when exercising
the MCP boundary is important and the server is bundled, local, credential
free, and safe to start in a test process.

## Fastest path

1. Copy the smallest relevant example:
   - [`fixture-duplicate-call.yaml`](fixture-duplicate-call.yaml) for a
     deterministic state/effect regression.
   - [`timeout-retry-duplicates.yaml`](timeout-retry-duplicates.yaml) for a
     real MCP timeout/retry failure.
2. Change the `id`, `name`, scenario inputs, mutation, assertion, and
   remediation. Keep the example minimal.
3. Add or update the fixture under `examples/` if the existing fixture cannot
   express the failure. Do not place credentials, production URLs, personal
   data, or destructive commands in the repository.
4. Run the validation commands below and include the resulting report summary
   in the pull request.

`examples/packs` is the bundled demo corpus, so every YAML file there is
executed by `npm run demo`. If a pull request adds a pack to that directory,
also add its filename and expected first finding to the
[`demo-packs` regression test](../../src/test/integration/demo-packs.test.ts).
Use `undefined` for a pack that should pass. This keeps the corpus executable,
documents the intended outcome, and prevents a new pack from being silently
untested.

## Copyable pack skeleton

This skeleton is intentionally kept in Markdown so the repository's pack
runner does not execute it as an example. Replace every `change-me` value and
choose a mutation that represents a real failure.

```yaml
version: 1
id: contribution/change-me
name: Short sentence describing the contract
description: Explain the failure and why it matters.
protocol: mcp
transport: fixture
server:
  fixture: ../your-fixture.yaml
effect_probes:
  - id: observed_effect
    source: fixture_state
    path: records.length
steps:
  - id: requested_action
    call: tool_name
    arguments:
      request_id: contribution-1
mutations:
  - id: injected-fault
    type: duplicate_call
    applies_to: tool_name
    occurrence: 1
assertions:
  - id: contract-holds
    type: effect_equals
    effect: observed_effect
    expected: 1
    severity: error
    remediation: Describe the concrete server or workflow fix.
    why_it_matters: Explain the user-visible or operational consequence.
artifacts:
  remediation: Repeat the remediation in the report summary.
```

The supported mutation types are `timeout`, `retryable_error`,
`malformed_result`, `stale_result`, `duplicate_call`, `permission_denied`,
`commit_then_response_lost`, `disconnect_after_commit`, `partial_success`,
and `stale_read_then_conflicting_write`. The supported assertion types are
documented in the [CLI and configuration specification](../../docs/project/09-cli-and-config-spec.md).

## Fixture authoring rules

- Give each step, mutation, probe, and assertion a unique ID.
- Use a stable `request_id` or equivalent input where idempotency matters.
- Declare an effect probe or `state_contract`; a call-count assertion alone
  does not prove that the requested state transition happened safely.
- Add a negative assertion for an effect that must not occur when the scenario
  is about safety or permission.
- Include a useful `remediation` on every blocking/error assertion.
- Make the expected result clear from the pack name and description.
- Keep the state small enough that a reviewer can understand the before/after
  values from one report.
- Use `seed` only when the selected mutation needs deterministic variation.
- Use tool probes only when they are safe to call. A tool probe declared
  `explicit_unsafe_opt_in` requires both the pack's
  `execution.allow_unsafe_probes: true` and the runtime
  `--allow-unsafe-probes` flag.
- A fixture must not depend on network access, ambient credentials, wall-clock
  timing, random IDs, or an unavailable local application.

## Pull request checklist

- [ ] The failure story is real, specific, and scoped to one contract.
- [ ] The pack runs offline or documents the bundled local server it needs.
- [ ] The pack has a deterministic expected result and a meaningful
      remediation.
- [ ] The report shows the physical call sequence and the relevant effect.
- [ ] The pack passes when the expected behavior is simulated and fails for
      the intended bad behavior, where both controls are available.
- [ ] If the pack was added to `examples/packs`, its expected outcome is
      covered in the demo-packs regression test.
- [ ] No credentials, production endpoints, personal data, or destructive
      commands are included.
- [ ] The pack ID and filenames do not collide with existing examples.
- [ ] `npm run check` passes.
- [ ] `npm run acceptance` passes.
- [ ] The pull request explains what a maintainer should learn from the
      finding and credits any adapted reproduction.

## Local verification

From the repository root:

```bash
npm ci
npm run check
npm run acceptance
node dist/cli.js run examples/packs/your-pack.yaml \
  --format terminal,markdown,json \
  --output artifacts/fixture-contribution
```

If the pack is intentionally expected to find a failure, say so in the pull
request and attach the redacted Markdown or JSON summary. Do not paste raw
production traces into an issue or pull request.

## Review standard

Maintainers should be able to run the pack from a clean clone, understand the
failure without oral explanation, reproduce the result, and identify the
remediation from the report. Packs that are merely stylistic, nondeterministic,
unsafe by default, or too broad for one focused assertion should be narrowed
before merge.
