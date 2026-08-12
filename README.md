# Agent Crash Test

**Chaos and effect-contract testing for tool-using AI agents.**

Agent Crash Test injects the failures that make agents dangerous—timeouts after a write, duplicate delivery, disconnects, stale reads, malformed results, rate limits, schema drift, and partial success—and then verifies what actually happened in state.

It answers the question ordinary mocks and traces miss:

> The agent saw an error. Did the action fail, succeed once, or succeed twice?

The core is local-first, deterministic where the target permits it, model-independent, and usable without an account or API key.

## Why this exists

A normal integration test checks whether a tool returned the expected response. An agent reliability test must also check whether retries and uncertain outcomes produced the right real-world effect.

Common failures include:

- a payment succeeds, the response is lost, and the agent retries it;
- a deployment starts before approval is recorded;
- a stale read causes an agent to overwrite a newer value;
- an MCP tool returns partial success and the agent repeats completed work;
- a rate limit, progress stall, or schema change sends the workflow down an unsafe recovery path.

Agent Crash Test sits between the client and its tools, injects one reproducible failure, captures physical calls, samples explicit state observers, and evaluates effect contracts. A failure report includes the first divergence, supporting events, expected and observed state, a reproduction command, and remediation.

## See it work

From a source checkout:

```bash
npm install
npm run build
node dist/cli.js demo
```

After the package is published, the zero-setup path is:

```bash
npx agent-crash-test@latest demo
```

The bundled demo runs twelve credential-free MCP scenarios. Ten intentionally expose failures and two prove the corresponding controls. Reports are written to `.agent-crash-test/demo`.

```text
✗ BLOCKER create-invoice-once-cardinality
  Effect contract create-invoice-once expected exactly one physical call, received 2.
  First divergence: event-2
  Fix: Make the write idempotent and reconcile uncertain outcomes before retrying.
```

## Three ways to test a real agent

### 1. Wrap an MCP server for any MCP client

Create a stdio pack, then generate an MCP client entry:

```bash
agent-crash-test wrap tests/agent/invoice-retry.yaml \
  --output .agent-crash-test/mcp.json
```

Point your MCP client at the generated `agent-crash-test` server entry. The client still speaks normal MCP; Agent Crash Test transparently proxies the configured target, injects the pack mutation, and writes contract reports when the session closes.

Use `--portable` to emit an `npx agent-crash-test@latest` entry instead of a local Node path.

### 2. Launch a cooperative agent command

For an agent test harness that can read its MCP command from environment variables:

```bash
agent-crash-test test tests/agent/invoice-retry.yaml \
  --client "python tests/run_agent.py" \
  --format terminal,markdown,json,html
```

The child receives:

- `AGENT_CRASH_TEST_MCP_COMMAND`
- `AGENT_CRASH_TEST_MCP_ARGS_JSON`
- `AGENT_CRASH_TEST_PACK`
- `AGENT_CRASH_TEST_RESULT_FILE`

The command exits non-zero when the contract fails, making it suitable for CI.

### 3. Bridge any language or framework through JSONL

Adapters can emit the small normalized event protocol and use the same contract engine:

```bash
python tests/run_langgraph_agent.py > events.jsonl
agent-crash-test bridge \
  --input events.jsonl \
  --contract tests/agent/invoice-retry.yaml \
  --format terminal,json,html
```

This is the escape hatch for non-MCP tools, framework-native hooks, and legacy automation. See [adapter examples](examples/adapters/README.md), [MCP Agent](examples/frameworks/mcp-agent/README.md), and [OpenAI Agents SDK](examples/frameworks/openai-agents-sdk/README.md).

## A crash-test pack

```yaml
version: 1
id: billing/retry-is-idempotent
name: Retrying invoice creation has one effect
protocol: mcp
transport: stdio

server:
  command: node
  args: [dist/server.js]

execution:
  max_run_ms: 60000
  allow_unsafe_probes: true

# This command must print bounded JSON. It is run before and after the session.
effect_probes:
  - id: invoice_count
    source: json_command
    command: node
    args: [tests/read-invoice-state.js]
    path: invoices.length
    safety: explicit_unsafe_opt_in

# A real client drives the tool calls, so scripted steps are optional.
steps: []

mutations:
  - id: lose-first-response
    type: commit_then_response_lost
    applies_to: create_invoice
    occurrence: 1

effect_contracts:
  - id: create-invoice-once
    class: create
    description: One request creates one invoice even after an uncertain outcome.
    tool: create_invoice
    intended:
      - effect: invoice_count
        expected: 1
    cardinality: exactly_once
    recovery:
      uncertain_outcome: query_before_retry
      query_tool: get_invoice_by_request_id
    severity: blocker
    remediation: Use one idempotency key and reconcile before retrying.

assertions:
  - id: one-physical-create
    type: call_count
    tool: create_invoice
    exactly: 1
```

Command observers are intentionally double-gated: the pack must set `execution.allow_unsafe_probes: true`, and the run must include `--allow-unsafe-probes`. A missing, failed, or timed-out observer is inconclusive and can never prove that a forbidden effect did not occur.

## Failure catalog

The mutation engine currently includes:

- uncertain outcomes: `timeout`, `commit_then_response_lost`, `disconnect_after_commit`, `partial_success`;
- repeat and recovery failures: `duplicate_call`, `retryable_error`, `rate_limit`;
- bad data: `malformed_result`, `stale_result`, `schema_drift`, `truncated_response`;
- ordering and pagination: `out_of_order_response`, `corrupted_pagination_cursor`, `stale_read_then_conflicting_write`;
- authorization and streaming: `permission_denied`, `slow_stream`, `progress_stall`.

Each mutation has explicit applicability, occurrence, phase, and bounded timing semantics. A report distinguishes logical operations from physical tool calls and records whether a side effect was committed, whether a response was returned, and which mutation caused the divergence.

## Capture instead of writing YAML from scratch

Record a local MCP interaction:

```bash
agent-crash-test capture \
  --stdio "node dist/server.js" \
  --output .agent-crash-test/session.json
```

Get a deterministic, redacted proposal:

```bash
agent-crash-test capture guide .agent-crash-test/session.json
```

Writing a contract requires explicit confirmation of the side-effecting target, failure profile, observer, intended effect, and cardinality. A tool observer is accepted only when captured MCP metadata declares `readOnlyHint=true`. A local command observer additionally requires `--allow-unsafe-observer`.

See the complete [guided capture example](examples/guided/README.md).

## Reports and local UI

```bash
agent-crash-test run tests/agent \
  --format terminal,markdown,json,junit,github-summary,sarif,html \
  --output artifacts/agent-crash-test

agent-crash-test ui artifacts/agent-crash-test
```

The HTML report is self-contained, searchable, filterable, XSS-safe, and includes the timeline, findings, state changes, and reproduction details. The local UI is read-only and binds to loopback by default.

Machine-readable JSON is the stable report contract. JUnit works with common CI systems, GitHub summary renders directly in Actions, and SARIF can feed code-scanning interfaces.

## GitHub Action

```yaml
- uses: pavloparaschakis/agent-crash-test@COMMIT_SHA
  with:
    path: tests/agent
    format: terminal,markdown,json,junit,github-summary,html
    output: artifacts/agent-crash-test
    fail-on: error
```

Pin the Action to an immutable commit or release tag. The Action runs packs and uploads reports even when a contract fails. The repository includes a separate [sample consumer](examples/action-sample-repo/README.md) and a self-test workflow.

## Additional integrations

- **Streamable HTTP/SSE proxy:** `agent-crash-test http-proxy --target http://127.0.0.1:3000/mcp` provides bounded local forwarding and response/SSE mutation hooks. It is currently a transport primitive; stdio wrapping and JSONL are the complete contract-verdict paths.
- **Self-hosted run sharing:** `agent-crash-test hosted serve` starts an authenticated, redacted, retention-bounded run store. It is a single-operator collaboration foundation, not a multi-tenant SaaS.
- **Domain examples:** filesystem/code-agent, SQLite ambiguous commit, approval/send, and deploy workflows live under [examples/domains](examples/domains/README.md).
- **Public Node API:** runners, evaluators, reporters, guided capture, proxy, HTTP transport, UI, and hosted primitives are exported from the package root.

## Command map

```text
agent-crash-test demo
agent-crash-test init [directory] [--server "node server.js"] [--github-action]
agent-crash-test discover --stdio "node server.js"
agent-crash-test proxy --stdio "node server.js" [mutation options]
agent-crash-test test <pack.yaml> [--client "command"] [run options]
agent-crash-test wrap <pack.yaml> [--portable] [--output config.json]
agent-crash-test capture --stdio "node server.js" --output capture.json
agent-crash-test capture generate capture.json --output starter.yaml
agent-crash-test capture guide capture.json [explicit confirmations]
agent-crash-test bridge --input events.jsonl [--contract pack.yaml]
agent-crash-test run <pack-or-directory> [run options]
agent-crash-test mutate <pack-or-directory> --profile <resilience|safety|all>
agent-crash-test compare <before.json> <after.json>
agent-crash-test explain <report.json>
agent-crash-test export <report.json> --format <formats> --output <directory>
agent-crash-test ui [report-directory]
agent-crash-test http-proxy --target <loopback-url>
agent-crash-test hosted <serve|upload|list|delete>
agent-crash-test doctor
```

Run `agent-crash-test help` for flags and limits.

## Safety and trust boundary

Agent Crash Test minimizes inherited environment variables, redacts common secret-shaped values, bounds captures and observer output, and defaults network listeners to loopback. It refuses remote HTTP targets and binds unless explicitly allowed.

It is not a process, filesystem, or network sandbox. A local stdio child can do anything the current user can do. Run untrusted tools inside a container, VM, or sandbox with the boundary your environment requires. Tool annotations are untrusted metadata, not proof that a tool is safe.

No model judges are used for blocking correctness. Effect contracts rely on explicit calls, outcomes, and state evidence.

## Project status

The codebase is an unreleased `0.1.0` preview. The local build, tests, package smoke, examples, and Action harness are automated; public npm publication, the first GitHub-hosted matrix run, and independent external quickstart validation are release gates, not completed claims.

No project can guarantee 5,000 GitHub stars. The project is designed for that level of usefulness by owning a sharp problem, proving real agent behavior, supporting framework-neutral adapters, shipping copy-paste examples, and keeping the first success path local and credential-free.

## Development

```bash
npm ci
npm run check
npm run test:downloader
npm run acceptance
npm run package:check
```

The full suite covers unit, integration, domain-example, framework-adapter, CLI, package-consumer, Action-consumer, safety, timeout, and deterministic-output behavior. Supported platforms and the CI matrix are documented in [PLATFORM-SUPPORT.md](PLATFORM-SUPPORT.md).

Contributions should start with [CONTRIBUTING.md](https://github.com/pavloparaschakis/agent-crash-test/blob/main/CONTRIBUTING.md). Security reports follow [SECURITY.md](SECURITY.md). Community behavior follows the [Code of Conduct](https://github.com/pavloparaschakis/agent-crash-test/blob/main/CODE_OF_CONDUCT.md).

## Documentation

- [Documentation index](https://github.com/pavloparaschakis/agent-crash-test/tree/main/docs)
- [Pack and CLI specification](https://github.com/pavloparaschakis/agent-crash-test/blob/main/docs/project/09-cli-and-config-spec.md)
- [Architecture](https://github.com/pavloparaschakis/agent-crash-test/blob/main/docs/project/08-architecture.md)
- [Test model](https://github.com/pavloparaschakis/agent-crash-test/blob/main/docs/project/06-test-model.md)
- [Security and privacy](https://github.com/pavloparaschakis/agent-crash-test/blob/main/docs/project/11-security-privacy-and-trust.md)
- [Reporting and GitHub integration](https://github.com/pavloparaschakis/agent-crash-test/blob/main/docs/project/10-reporting-and-github-integration.md)
- [Implementation audit](https://github.com/pavloparaschakis/agent-crash-test/blob/main/docs/project/25-implementation-audit.md)
- [Release runbook](https://github.com/pavloparaschakis/agent-crash-test/blob/main/RELEASE-RUNBOOK.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
