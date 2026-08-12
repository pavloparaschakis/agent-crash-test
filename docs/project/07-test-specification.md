# Portable Crash-Test Pack Specification

## File goals

The test format must be readable by humans, easy to generate, stable enough to commit, and broad enough to support MCP first and other agent protocols later.

## Example pack

```yaml
version: 1
id: invoices/create-is-idempotent
name: Retrying invoice creation must not duplicate the invoice
description: A write that succeeds before a timeout must remain idempotent on retry.
protocol: mcp
transport: fixture
tags:
  - resilience
  - idempotency
server:
  fixture: examples/invoice-server.fixture.yaml
state:
  initial:
    invoices: []
    outbound_messages: []
  source: fixture
effect_probes:
  - id: invoice-count
    source: fixture_state
    path: invoices.length
steps:
  - id: create
    call: create_invoice
    arguments:
      customer_id: cus_1
      amount: 100
      request_id: req_1
    retry:
      max_attempts: 2
      on: [timeout]
assertions:
  - id: exactly-one-invoice
    type: effect_equals
    effect: invoice-count
    expected: 1
    severity: error
    remediation: Use a durable request or idempotency key for the write.
mutations:
  - id: timeout-after-write
    type: timeout
    applies_to: create_invoice
    occurrence: 1
artifacts:
  remediation: Make the side effect idempotent before declaring idempotentHint.
```

This example is runnable from a repository-root pack location. The bundled
[`fixture-duplicate-call.yaml`](../../examples/packs/fixture-duplicate-call.yaml)
shows the same fixture transport with a duplicate-call mutation.

## Required fields

- `version`
- `id`
- `name`
- `protocol`
- `steps`
- `assertions`

At least one of `state` or `effect_probes` is required for packs that make side-effect claims. A pack without an effect source may test protocol and response behavior but must not claim to verify real-world state.

`transport: fixture` is the simplest P0 mode. A local stdio pack instead declares `server.command` and `server.args`; it must supply declared read-only MCP effect probes for any side-effect claim.

## Step types

- `call`: invoke a tool. In v0.1 each step requires a unique `id` and may
  provide `arguments`, `retry`, and `capture`.
- `retry`: configure `max_attempts` and the retryable error kinds (`timeout`,
  `retryable_error`, or `permission_denied`).
- `capture`: name the result captured for a step; result assertions reference
  the step ID in v0.1.
- `agent_message`: insert a user or agent message into a real-agent trajectory (P1).
- `fixture_response`: provide a deterministic response.
- `wait`: simulate time passing.
- `permission`: grant or deny a declared capability.
- `checkpoint`: persist a named state for later assertion.
- `snapshot`: capture named fixture state or the result of a declared read-only MCP effect probe.

## Assertion types

- `must_not_call`
- `effect_equals`
- `effect_not_equals`
- `result_path_equals`
- `call_count`
- `annotation_matches`
- `secret_not_exposed` (P1, requires canary and sink-action oracle)
- `state_path_equals`
- `no_extra_transition`

State deltas are expressed through `state_contract.effects` and `state_contract.forbidden`; there is no separate `state_delta` assertion in v0.1.

## Mutation schema

```yaml
mutations:
  - id: timeout-after-write
    type: timeout
    applies_to: create_ticket
    duration_ms: 0
    seed: 42
```

## State-diff semantics

State assertions must declare an explicit effect probe or state-contract path.
The v0.1 runner compares the declared JSON path or before/after semantic delta;
generic snapshot `ignore` lists are deferred until a snapshot adapter exists.
A report must show both the intended delta and the observed delta.

## Effect-probe rules

P0 effect probes are either fixture state or explicitly declared read-only MCP tools. A pack author must name the probe, explain why it is safe to call, and state what the probe proves. The runner must not infer database access, execute arbitrary shell commands, or treat an arbitrary tool response as a complete state snapshot.

## Versioning rules

- Major version changes may remove or redefine semantics.
- Minor versions add optional fields only.
- Unknown fields are rejected with an actionable validation error in v0.1;
  future format-aware tools may preserve them during migration.
- Reports must state the fixture schema version.
- A migration command should be provided before the first breaking change.

## Redaction rules

Fixture generation must redact values matching authorization headers, access
token and secret key names, cookies, private keys, and common cloud credential
names. Custom regex patterns and optional email, phone, and payment redaction
are deferred until a safe configuration contract exists.

Redaction must preserve the type and shape needed to replay the fixture.
