# Language-neutral adapter examples

Agent Crash Test does not require a Python or JavaScript agent to embed the
TypeScript runner. An adapter can emit the small, versioned JSONL contract and
let the core CLI validate lifecycle, physical calls, ambiguous outcomes, state
snapshots, and redaction claims.

Run both examples from the repository root after `npm run build`:

```bash
python3 examples/adapters/jsonl-python-example.py \
  | node dist/cli.js bridge --format markdown

node examples/adapters/jsonl-node-example.mjs \
  | node dist/cli.js bridge --format json
```

The examples describe the same conceptual case: a create operation committed,
its response was lost, and a state observer confirmed one created object. They
are intentionally small enough to copy into a pytest, unittest, Vitest, Jest,
or custom agent harness.

The bridge is strict by design. Every record carries a `run_id`, content
records declare `redaction_applied: true`, tool results distinguish
`commit_status` from `response_status`, and an incomplete stream is reported as
`inconclusive` rather than silently passing.

This is an adapter contract, not an MCP implementation. The adapter remains
responsible for speaking to the user's agent or framework and for redacting
before it emits content.
