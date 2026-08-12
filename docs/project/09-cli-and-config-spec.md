# CLI and pack configuration specification

The source of truth is `agent-crash-test help`, the strict schema in `src/pack.ts`, and the exported types in `src/types.ts`. This document explains the stable command families.

## Execution paths

| Command | Purpose | Contract verdict |
|---|---|---|
| `run <pack-or-directory>` | Scripted fixture or MCP execution | Yes |
| `test <stdio-pack>` | Behave as a transparent MCP server wrapper | Yes |
| `test <stdio-pack> --client <command>` | Launch a cooperative real-agent harness | Yes |
| `bridge --contract <pack>` | Evaluate adapter JSONL through the core engine | Yes |
| `proxy --stdio <command>` | Low-level transparent proxy/capture | No; capture only |
| `http-proxy --target <url>` | Low-level Streamable HTTP/SSE proxy | No; transport events only |

`wrap <stdio-pack>` emits an MCP client configuration for `test`. Fixture packs are rejected because they cannot be exposed as transparent MCP servers.

## Authoring and inspection

- `init` creates a starter pack and fixture.
- `discover` validates and prints an MCP tool manifest.
- `capture` records a bounded, redacted MCP session.
- `capture generate` creates a review-required scripted starter pack.
- `capture guide` proposes and, after explicit confirmations, authors an effect contract.
- `mutate` selects declared mutation profiles.
- `compare`, `explain`, and `export` operate on existing reports.
- `ui` serves a read-only local report browser.
- `hosted` serves or talks to the self-hosted run store.
- `doctor` validates the local runtime and safety-relevant configuration.

## Pack structure

A pack contains:

- identity: `version`, `id`, `name`, optional tags and description;
- target: `protocol`, `transport`, and `server`;
- policy: timeouts, run budget, environment and observer opt-ins;
- execution: optional scripted `steps`;
- faults: `mutations` with stable IDs and applicability;
- evidence: `effect_probes` and optional fixture state;
- contracts: `effect_contracts`, `state_contract`, and `assertions`.

Unknown keys fail validation. IDs are unique. Paths, probe sources, mutation parameters, retry categories, and safety declarations are checked semantically after schema validation.

## Reports

`--format` accepts `terminal`, `markdown`, `json`, `junit`, `github-summary`, `sarif`, and `html`. Multiple comma-separated values are allowed. `--fail-on` accepts `info`, `notice`, `warning`, `error`, or `blocker`.

## Exit codes

- `0`: execution completed and nothing met the blocking severity.
- `1`: a contract/assertion finding met the blocking severity.
- `2`: invalid CLI input, pack, fixture, or configuration.
- `3`: target, transport, protocol, or observer execution failure.
- `4`: safety policy refused execution.
- `10`: unexpected internal failure.

## Real-client environment contract

`test --client` starts the supplied command with a minimal environment and:

- `AGENT_CRASH_TEST_MCP_COMMAND` — executable for the wrapped MCP server;
- `AGENT_CRASH_TEST_MCP_ARGS_JSON` — JSON array of arguments;
- `AGENT_CRASH_TEST_PACK` — absolute pack path;
- `AGENT_CRASH_TEST_RESULT_FILE` — completed JSON report path.

Additional inherited names require `--client-env NAME,NAME`. Arbitrary environment inheritance is intentionally not the default.

## Observer safety

Fixture probes are internal. Tool probes require `declared_read_only` or an explicit unsafe designation. JSON command probes require `explicit_unsafe_opt_in`, `execution.allow_unsafe_probes: true`, and runtime `--allow-unsafe-probes`. Guided authoring additionally requires `--allow-unsafe-observer` before writing a command probe.
