# Research Validation and Scope Decisions

## Purpose

This is the final research-backed review of the scope. It records what was uncertain, what current evidence says, and the resulting product decision. It is intended to prevent the implementation from drifting back toward a generic MCP testing framework, replay tool, security scanner, or model benchmark.

## Decision summary

| Question | Evidence | Decision |
|---|---|---|
| Is fault injection a sufficiently unique category? | AgentCheck already has a 12-type MCP fault injector and reproduce/intervene/confirm workbench. | Keep fault injection, but do not claim novelty; make reusable packs the asset. |
| Should v0.1 build recording/replay? | MCPReplay already records, replays, diffs, scaffolds CI, and supports stdio/HTTP. | Defer proxy recording/import to P1; support pack authoring and deterministic rerun first. |
| Should v0.1 build mock servers and trajectory testing? | mcptest already provides YAML mocks, trajectories, error injection, regression diffs, and CI. | Do not compete as a general agent test framework; make adapter support P1. |
| Is effect/state checking useful? | DynamicMCPBench uses path-agnostic effect checkpoints; MCP Pitfall Lab stresses trace/objective validation. | Keep explicit effect contracts, but present them as a maintainer regression tool, not a novel benchmark. |
| Should HTTP be P0? | MCP HTTP authorization uses OAuth; the official SDK’s v2 is pre-alpha while v1 remains the production recommendation. | P0 is local stdio and a frozen protocol baseline. Local unauthenticated Streamable HTTP is P1; OAuth/remote targets are P2. |
| Can tool annotations be trusted as facts? | The MCP spec says annotations are untrusted; official guidance treats omitted annotations conservatively. | Report annotation gaps as risk posture. Fail only when a declared annotation contradicts an observed effect. |
| Can v0.1 claim tool-poisoning protection? | AgentSeal and other tools already run broad probe suites; a valid claim needs an agent runner, canary, and sink-action oracle. | P0 protects the harness and handles safe content fixtures. Real injection-resistance packs are P1. |
| Is generic state inspection feasible? | State varies by server and target system. | P0 supports fixture state and explicitly declared read-only MCP effect probes only. No generic database/API inspection. |

## Final v0.1 shape

The first public release is an **MCP stdio crash-test pack runner**.

Each pack has four non-optional ideas:

1. **Scenario:** a small, deterministic sequence or fixture-backed task.
2. **Mutation:** one of six controlled failure modes.
3. **Effect contract:** the allowed and forbidden effects, observed through fixture state or declared read-only probes.
4. **Recovery expectation:** the exact behavior that counts as pass, fail, warning, or unsupported.

The demo must make the effect contract unmistakable: a requested invoice is created, a timeout triggers a retry, and a duplicate invoice or outbound message appears. The result is a clear failure even if a final text response looks successful.

## P0 mutation set

- latency/timeout;
- retryable error;
- malformed structured result;
- stale result;
- duplicate call;
- permission denied.

Each mutation needs a stable identifier, seed, passing fixture, failing fixture, explanation, and remediation note.

## Explicit P1/P2 boundaries

### P1

- local unauthenticated Streamable HTTP;
- protocol-aware recording proxy;
- recorded-fixture import adapters;
- generic agent-command and local-model adapters;
- canary-based untrusted-content/tool-poisoning packs;
- schema-drift mutation;
- JUnit, SARIF, HTML, badges, and richer PR comments.

### P2

- remote OAuth and production credentials;
- A2A and Agent Skills adapters;
- hosted dashboard/index;
- broad multi-agent scenarios;
- security certification/attestation workflows.

## Validation experiments before committing to full implementation

1. Build only the invoice demo and three packs: timeout/retry, duplicate call, confirmation denied.
2. Give it to five MCP maintainers without a walkthrough.
3. Ask each person to explain the expected and observed effect delta.
4. Ask each person to add one pack from a template.
5. If fewer than four succeed, simplify the pack format before adding transports, agents, or reporting formats.
6. Ask whether they would use the tool alongside MCPReplay or mcptest. If not, capture why; the product should complement those tools rather than ask users to replace them.

## Sources

- [AgentCheck](https://arxiv.org/abs/2607.11098)
- [MCPReplay](https://mcpreplay.com/)
- [mcptest](https://pypi.org/project/mcp-agent-test/)
- [DynamicMCPBench](https://arxiv.org/abs/2607.20531)
- [MCP Pitfall Lab](https://arxiv.org/abs/2604.21477)
- [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP annotation guidance](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)
