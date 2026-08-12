# Credential-free domain examples

These examples make Agent Crash Test's effect-level failure model concrete in
three unrelated domains. Every script is deterministic, local-only, and has a
broken control plus a fixed control.

| Domain | Injected uncertainty | Broken effect | Fix |
|---|---|---|---|
| [Filesystem/code agent](filesystem-code-agent/) | File write commits and its acknowledgement is lost | Generated function is appended twice | Operation ledger deduplicates the retry |
| [SQLite checkout](sqlite-ambiguous-commit/) | Transaction commits and its acknowledgement is lost | One checkout creates two rows | Unique idempotency key plus conflict-safe insert |
| [Approval/send/deploy](approval-send-deploy/) | Agent acts before authorization | Send and deployment precede approval | Server-side effect ordering |

Run the broken and fixed command in each directory's README. Broken controls
exit 1 because they intentionally violate the documented contract; fixed
controls exit 0. Temporary state is removed automatically unless an explicit
workspace or database path is supplied.
