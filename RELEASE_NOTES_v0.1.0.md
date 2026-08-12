# Agent Crash Test v0.1.0

The first public preview of local-first chaos and effect-contract testing for tool-using agents.

## Highlights

- transparent MCP stdio wrapping for real agent clients;
- deterministic fixture/scripted execution and a language-neutral JSONL bridge;
- effect contracts that verify real state, physical-call cardinality, authorization, ordering, and uncertain-outcome recovery;
- seventeen bounded mutations including lost responses after commit, duplicates, rate limits, stale data, schema drift, bad pagination, and streaming stalls;
- guided redacted capture-to-contract authoring;
- terminal, Markdown, JSON, JUnit, GitHub summary, SARIF, and interactive HTML reports;
- domain and framework examples that run without credentials;
- GitHub Action, package smoke, release checksums, and cross-platform CI configuration.

## Boundaries

The HTTP/SSE proxy is a transport primitive rather than a complete HTTP contract runner. The self-hosted store is single-operator, not multi-tenant. Local child processes are not filesystem or network sandboxes. No model judge is used for blocking correctness.

## Verification

The release gate is `npm run acceptance`, the hosted Linux/macOS/Windows × Node 20/22/24 matrix, the Action self-test, production dependency audit, clean npm install, and independent quickstart validation.
