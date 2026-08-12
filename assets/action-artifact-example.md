# Example Action artifact

This is the compact shape a failing Markdown artifact exposes to a reviewer:

```text
ERROR exactly-one-invoice
Category: duplicate_transition
Effect: invoice_count
Expected: 1
Observed: 2
Evidence events: event-1, event-2, event-3
First divergence: event-2
Reproduce: node dist/cli.js run examples/packs/timeout-retry-duplicates.yaml --format terminal,json
Fix: Use a request ID or idempotency key to make the write idempotent.
```

The real Action writes the versioned JSON report alongside the Markdown artifact and uploads both after a failing run. This checked-in example contains no run ID, path, or secret.
