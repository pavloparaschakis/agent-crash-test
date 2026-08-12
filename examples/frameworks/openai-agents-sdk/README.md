# OpenAI Agents SDK adapter

This adapter demonstrates how a real OpenAI Agents SDK function tool can emit
Agent Crash Test's language-neutral JSONL evidence. It models a ticket write
whose first acknowledgement is lost after commit.

The deterministic offline mode imports no third-party package, uses no model,
performs no network access, and is the path exercised by repository tests:

```bash
# Intentional contract failure; expected exit 1.
python3 examples/frameworks/openai-agents-sdk/adapter.py --mode offline --scenario broken \
  | node dist/cli.js bridge --format markdown

# Idempotent recovery; expected exit 0.
python3 examples/frameworks/openai-agents-sdk/adapter.py --mode offline --scenario fixed \
  | node dist/cli.js bridge --format markdown

# Always exits 0 and reports available or skipped.
python3 examples/frameworks/openai-agents-sdk/adapter.py --mode check
```

## Optional real mode

Real mode imports the official `openai-agents` package, constructs an `Agent`,
wraps the side effect with `@function_tool`, and executes it through
`Runner.run`. It is intentionally opt-in because it invokes a model.

```bash
python3 -m pip install openai-agents
export OPENAI_API_KEY=...
python3 examples/frameworks/openai-agents-sdk/adapter.py --mode real --scenario fixed
```

If the dependency or key is absent, real mode prints a machine-readable skip and
exits successfully. Add `--require-real` to turn that skip into exit code 2 in a
dedicated integration environment.

The current framework surface follows the official
[tools](https://openai.github.io/openai-agents-python/tools/) and
[runner](https://openai.github.io/openai-agents-python/running_agents/)
documentation. Real model behavior is nondeterministic, so its provider errors
are reported as inconclusive rather than converted into a false pass.
