# Test Model

## Test layers

### Layer 0: process and transport

Checks that the server starts, initializes, communicates on the chosen transport, and shuts down cleanly.

### Layer 1: protocol contract

Checks tool listing, method names, request/response envelopes, schema validity, and error shape.

### Layer 2: tool contract

Checks descriptions, examples, annotations, side-effect declaration, parameter constraints, output schemas, and idempotency metadata.

### Layer 3: resilience

Injects latency, timeouts, retries, duplicate calls, partial responses, stale data, and dependency failures.

### Layer 4: safety behavior

Checks confirmation requirements, permission boundaries, and declared irreversible actions. Sensitive-data handling, unsafe tool descriptions, and prompt injection in returned content require a real agent runner and are P1.

### Layer 5: state and task trajectory

Checks whether a deterministic scripted sequence meets explicit invariants and whether the final state contains only the intended changes. Examples include exactly-one entity created, no message sent before confirmation, no duplicate charge, and no unrelated record modified. P0 supports fixture-backed state and explicitly declared read-only MCP effect probes. Evaluation of a real model's trajectory is P1.

### Layer 5a: state oracle modes

- **Fixture state:** deterministic JSON state used by the demo and offline tests.
- **Observed state:** state reconstructed from tool responses and recorded events.
- **Future command snapshot:** user-provided command that emits a sanitized JSON snapshot.
- **Future adapter:** database or API-specific state provider, explicitly configured by the user.

The MVP supports fixture state and declared read-only MCP effect probes. Observed-state reconstruction and command snapshots are P1. Generic production state introspection is out of scope.

### Layer 6: model-in-the-loop (P1)

Optional future layer for running an agent runner or local model against the same tool fixture. Results are probabilistic and must be labeled separately from deterministic checks.

## Severity model

- **Blocker:** protocol cannot be used or a test demonstrates a clearly dangerous default.
- **Error:** expected behavior is violated and likely causes incorrect or unsafe operation.
- **Warning:** risk or ambiguity is detected but impact depends on client behavior.
- **Notice:** maintainability, discoverability, or documentation issue.
- **Info:** measured behavior or an advisory recommendation.

## State-diff taxonomy

- **Missing transition:** the requested state change did not happen.
- **Extra transition:** an unrequested entity or side effect appeared.
- **Duplicate transition:** the same effect happened more than once.
- **Wrong-target transition:** the effect happened to the wrong entity.
- **Out-of-order transition:** a dependent effect happened before its prerequisite.
- **Unexpected mutation:** an unrelated field or entity changed.

## Mutation profiles

### `contract` (P1)

- Rename a parameter.
- Remove a required field.
- Add an unexpected required field.
- Change enum values.
- Change output shape.
- Remove a description.

### `resilience` (P0)

- Inject a deterministic timeout.
- Return a typed retryable error.
- Return a deterministic malformed result.
- Return a stale result for an eligible tool/request context.
- Physically duplicate a call.
- Block a call with permission denied.

### `safety` (mixed)

- Deny permission (P0).
- Ask for confirmation at the wrong point.
- Simulate duplicate invocation.
- Simulate an irreversible action.

Prompt injection, secret-canary, and other content-poisoning probes require a real agent runner plus a defined sink-action oracle. They are P1; a static text match is never a proof of exploitability.

### `adversarial` (P1)

- Malformed payload.
- Oversized payload.
- Unexpected Unicode.
- Conflicting instructions in content.
- Cross-tool data contamination.

Adversarial profiles require explicit opt-in in CI and never run against real external systems by default.

## Determinism policy

Every mutation must record mutation identifier, version, random seed, input fixture hash, server manifest hash, environment metadata, and expected invariant version.

The same fixture, seed, and server manifest should produce the same result unless the test explicitly declares nondeterminism.
