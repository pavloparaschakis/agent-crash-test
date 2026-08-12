# SQLite ambiguous commit and idempotency

This example commits an order to a real local SQLite database, drops the
acknowledgement, and retries the operation. The broken schema accepts the same
logical checkout twice. The fixed schema gives `request_id` a unique constraint
and uses `INSERT OR IGNORE` with the same key on retry.

Only Python's standard-library `sqlite3` module is required. The default run uses
a temporary database and never contacts a network service.

```bash
# Expected exit 1: one checkout leaves two committed rows.
python3 examples/domains/sqlite-ambiguous-commit/run_example.py --scenario broken

# Expected exit 0: the same idempotency key leaves one row.
python3 examples/domains/sqlite-ambiguous-commit/run_example.py --scenario fixed
```

Use `--database ./scratch/orders.db` to retain the database. The example removes
an existing file at that exact path before initializing it, so use a disposable
path.

This demonstrates why a retryable transport error is not evidence that a write
failed: the transaction is durable before the client learns the outcome.
