# Consumer examples

These examples show the two intended adoption paths:

1. JavaScript/TypeScript projects can import the stable public Node API.
2. Python and other language projects can use the dependency-free wrapper,
   emit JSONL, and invoke the CLI as a normal test-process boundary.

From the repository root:

```bash
npm run build
node examples/consumers/node-api-example.mjs
python3 -c 'from examples.consumers.agent_crash_test import run_pack; print(run_pack("examples/packs/fixture-duplicate-call.yaml", cli=["node", "dist/cli.js"])["pack"])'
python3 examples/adapters/jsonl-python-example.py \
  | node dist/cli.js bridge --format markdown
```

The Node example runs an existing fixture pack and inspects the normalized
result. The JSONL example intentionally does not depend on an internal
TypeScript module; it demonstrates the contract a third-party adapter can
implement in a different language.

Consumer integrations should treat `RunResult`, `NormalizedEvent`, and the
JSONL record types as versioned contracts. They should not parse terminal text
as a machine interface.
