# mcp-agent adapter

This adapter shows how an actual `mcp-agent` application can emit Agent Crash
Test JSONL around an agent function. The scenario enqueues a local job, loses the
post-commit response, and retries with the same logical request ID.

The offline mode is deterministic, dependency-free, credential-free, and used
by repository verification:

```bash
# Intentional duplicate; expected adapter exit 1.
python3 examples/frameworks/mcp-agent/adapter.py --mode offline --scenario broken \
  | node dist/cli.js bridge --format markdown

# Deduplicated retry; expected adapter exit 0.
python3 examples/frameworks/mcp-agent/adapter.py --mode offline --scenario fixed \
  | node dist/cli.js bridge --format markdown

# Always exits 0 and reports available or skipped.
python3 examples/frameworks/mcp-agent/adapter.py --mode check
```

## Optional real mode

Real mode imports `MCPApp`, `Agent`, and `OpenAIAugmentedLLM`, passes the
instrumented function to a real `Agent`, and drives it through the attached LLM.

```bash
python3 -m pip install 'mcp-agent[openai]'
export OPENAI_API_KEY=...
python3 examples/frameworks/mcp-agent/adapter.py --mode real --scenario fixed
```

Without the optional package or key, real mode emits a machine-readable skip and
exits 0. Add `--require-real` to make a missing prerequisite exit 2 in a
credentialed integration job.

The framework structure follows the official
[mcp-agent repository and minimal example](https://github.com/lastmile-ai/mcp-agent).
Real model behavior is nondeterministic, and framework/provider failures are
reported as inconclusive rather than silently passing the effect contract.
