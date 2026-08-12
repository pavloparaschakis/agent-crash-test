# Changelog

All notable changes are documented here.

## 0.1.0 — Unreleased

Initial public preview:

- deterministic fixture and MCP stdio pack runners;
- transparent real-client MCP proxy with contract verdicts;
- effect contracts for intended state, forbidden state, physical-call cardinality, authorization, ordering, and uncertain-outcome recovery;
- seventeen bounded fault mutations covering ambiguous commits, duplicate calls, errors, stale data, schema and pagination drift, ordering, and streaming stalls;
- explicit fixture, read-only MCP tool, and opt-in JSON command observers;
- guided, redacted capture-to-contract authoring;
- language-neutral JSONL contract evaluation plus Node, Python, MCP Agent, and OpenAI Agents SDK examples;
- terminal, Markdown, JSON, JUnit, GitHub summary, SARIF, and self-contained HTML reports;
- read-only loopback report UI, Streamable HTTP/SSE proxy primitive, and authenticated self-hosted run store;
- domain examples for filesystem agents, SQLite ambiguous commits, approvals, sends, and deploys;
- composite GitHub Action, release workflow, package-consumer smoke tests, and Linux/macOS/Windows × Node 20/22/24 CI configuration;
- secret redaction, bounded execution and capture, strict schemas, deterministic fingerprints, and fail-closed observer semantics.

Known release gates: npm publication, first GitHub-hosted matrix and Action runs, repository ownership metadata, and independent external quickstart validation.
