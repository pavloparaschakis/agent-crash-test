# Expansion implementation note

The previously planned expansion is now part of the unreleased `0.1.0` preview. Current release notes live in [RELEASE_NOTES_v0.1.0.md](RELEASE_NOTES_v0.1.0.md), and the verified implementation boundary lives in [the implementation audit](docs/project/25-implementation-audit.md).

The key architectural outcome is one contract engine shared by scripted packs, real-client MCP captures, and framework-neutral JSONL adapters. HTTP/SSE remains a lower-level transport primitive, and the hosted component remains an optional single-operator run store.
