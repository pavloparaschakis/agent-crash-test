# Quality Strategy and Acceptance Matrix

## Test pyramid

### Unit tests

Cover schema validation, redaction, mutation determinism, assertion semantics, severity mapping, and report rendering.

### Contract tests

Cover adapter behavior against known MCP request/response examples and malformed protocol messages.

### Integration tests

Run the CLI against the demo server over stdio. Streamable HTTP integration tests are P1.

### End-to-end tests

Install the package in a clean environment, run the quickstart, execute the GitHub Action container, and inspect generated artifacts.

### Compatibility tests

Run the starter suite on supported Node.js versions and operating systems.

## Acceptance matrix

| Area | Minimum acceptance |
|---|---|
| Install | Clean install succeeds on supported platforms |
| Discover | Healthy local stdio server produces a manifest |
| Pack | Template validates and runs against fixture state or a local server |
| Rerun | Same pack and seed produce the same result |
| Mutate | Six MVP mutation classes are deterministic; extension interface is tested |
| Assert | Positive and negative assertions are supported |
| State | Intended, extra, and duplicate transitions are distinguishable |
| Report | Terminal, Markdown, and JSON work |
| CI | Action uploads an artifact and applies the configured exit code |
| Security | Default mode does not inherit secrets and warns when sandboxed network denial is unavailable |
| Docs | First-time user completes demo without help |
| Contribution | New fixture can be added from template |

## Reliability gates

- No known data-loss bug in fixture writing.
- No secret value appears in snapshot artifacts.
- No hanging child process survives test completion.
- No mutation silently changes source fixtures.
- No state diff hides an extra transition behind ignored-field configuration.
- No report claims a security guarantee.
- No release is published without a clean demo run.

## Manual evaluation script

Use the repository-owned [manual acceptance script](../../MANUAL-ACCEPTANCE.md) with
five external testers. Record time, confusion points, failed commands, and the
language testers use to describe the product.
