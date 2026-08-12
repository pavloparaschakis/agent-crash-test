# Mutation control corpus

These packs are baseline controls for the mutation engine. They are kept
outside `examples/packs` so the public demo remains focused and intentionally
fails only on the signature findings.

Each row pairs a healthy, no-mutation control with a deliberately failing
expectation. The failing side proves that the mutation and assertion can
produce visible evidence; the control proves the same scenario is
understandable and passes before the fault is introduced.

| Mutation | Passing control | Failing case |
|---|---|---|
| `timeout` | `timeout-retry-idempotent.yaml` | `../packs/timeout-retry-duplicates.yaml` |
| `retryable_error` | `retryable-error-idempotent.yaml` | `../packs/retryable-error-duplicates.yaml` |
| `malformed_result` | `malformed-result-valid.yaml` | `../packs/malformed-output.yaml` |
| `stale_result` | `stale-result-fresh.yaml` | `../packs/stale-output.yaml` |
| `duplicate_call` | `duplicate-call-single.yaml` | `../packs/duplicate-call-duplicates.yaml` |
| `permission_denied` | `permission-denied-handled.yaml` | `permission-denied-incorrect-success.yaml` |
| `commit_then_response_lost` | `commit-then-response-lost-idempotent.yaml` | `../packs/commit-then-response-lost-duplicates.yaml` |
| `disconnect_after_commit` | `disconnect-after-commit-idempotent.yaml` | `../packs/disconnect-after-commit-duplicates.yaml` |
| `partial_success` | `partial-success-reconciled.yaml` | `../packs/partial-success-duplicates.yaml` |
| `stale_read_then_conflicting_write` | `stale-read-conflict-protected.yaml` | `../packs/stale-read-conflict-lost-update.yaml` |

The proxy and contract integration tests also exercise these semantics at a
real client-visible transport boundary and with explicit effect contracts.

Run the complete pair check with:

```bash
npm run test:integration
```

The permission-denied control intentionally has two interpretations: the
expected-denial demo is a passing safety contract, while
`permission-denied-incorrect-success.yaml` is a negative control that exposes
an assertion which incorrectly requires the unauthorized write to happen.
