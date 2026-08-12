# Research and Positioning

## Current landscape

The current ecosystem is active enough that both a generic “agent quality scanner” and a generic “MCP fault-injection workbench” would be difficult to distinguish. A July 2026 search found a particularly close research project, [AgentCheck](https://arxiv.org/abs/2607.11098), describing an open-source MCP workbench with agent execution, response perturbation, replay, a 12-type fault injector, and mitigation confirmation. [MCPReplay](https://mcpreplay.com/) already owns a polished record/replay/diff/CI story, while [mcptest](https://pypi.org/project/mcp-agent-test/) already provides YAML mock servers, trajectory assertions, error injection, and GitHub CI. This makes a runner-only product a weak bet.

Relevant adjacent projects include:

- [MCP conformance tests](https://github.com/modelcontextprotocol/conformance), focused on implementation behavior against the MCP specification.
- [Pulrix](https://www.pulrix.dev/), positioned around quality and security scores for MCP servers.
- [Agent Ready](https://agent-ready.dev/docs/api), which exposes readiness scanning and scores.
- [mcp-scan](https://mcpscan.dev/) and [mcp-audit](https://audit.pyfio.com/), focused on MCP checks and security reports.
- [Snyk agent-scan](https://github.com/snyk/agent-scan), covering AI agents, MCP servers, and skills.
- [MCPReplay](https://mcpreplay.com/), focused on capturing and replaying MCP traffic in CI.
- [mcp-agent-test](https://pypi.org/project/mcp-agent-test/) and [mcp-jest](https://github.com/josharsh/mcp-jest), focused on framework-specific MCP testing.
- [MCPMark](https://github.com/eval-sys/mcpmark/), focused on stress-testing agent/model capability in real MCP environments.
- [Iris](https://iris-eval.com/), positioned as an MCP agent evaluation standard with LLM judging and telemetry.
- [DynamicMCPBench](https://arxiv.org/abs/2607.20531), a research benchmark that derives and scores path-agnostic effect checkpoints from live MCP-server trajectories.
- [AgentSeal](https://agentseal.org/docs/attack-categories/mcp-tools), which documents broad MCP attack probes including tool poisoning, exfiltration, shadowing, and rug pulls.
- [mcp-strike](https://pypi.org/project/mcp-strike/), which ships MCP attack probes for tool descriptions and other pipeline stages.
- [OWASP MCP Tool Poisoning](https://owasp.org/www-community/attacks/MCP_Tool_Poisoning), documenting how untrusted tool descriptions and responses can redirect agent behavior.
- [Research on MCP tool-description smells](https://arxiv.org/abs/2602.14878), reporting that description quality materially affects agent task performance.
- The [official MCP Registry](https://github.com/modelcontextprotocol/registry) and [GitHub MCP Registry announcement](https://github.blog/ai-and-ml/github-copilot/meet-the-github-mcp-registry-the-fastest-way-to-discover-mcp-servers/), which increase the importance of discoverable and trustworthy tool metadata.

## Strategic implication

The project must own a narrower category: **an open crash-test pack ecosystem for agent tools**. Fault injection, trajectory capture, and effect checks are ingredients, not claims of novelty. The durable asset is a portable pack that combines a fault profile, a small scenario, explicit effect contracts, expected recovery, and remediation notes. Packs can be run locally first and later through adapters instead of recreating every mature runner feature.

## Positioning statement

For developers who build or integrate agent tools, Agent Crash Test is the open-source crash-test pack toolkit that injects a realistic failure, verifies intended and forbidden effects, and turns the scenario into a reviewable regression test. Unlike generic scanners, replay tools, and model benchmarks, it centers reusable failure cases and explicit recovery contracts rather than a vendor-specific runner or opaque score.

## Competitive wedge

| Adjacent category | Their center of gravity | Agent Crash Test wedge |
|---|---|---|
| Protocol conformance | Spec compliance | Real-world failure and recovery behavior |
| Security scanner | Static or policy findings | Runtime mutation plus semantic safety invariants |
| Replay tool | Response drift and recorded traffic | Import/reuse recorded scenarios as packs; fault and recovery contracts |
| Agent benchmark | Model/task capability | Tool maintainer regression workflow |
| Language test library | One ecosystem | Runner-neutral crash-test pack format and community corpus |
| Hosted observability | Production traces | Local-first pre-production testing |
| Agent workbench | Interactive reproduce/intervene loop | Portable packs, deterministic effect contracts, and no mandatory model judge |

## Jobs to be done

1. “Tell me what will break before users discover it.”
2. “Show me whether a schema change will quietly break an agent.”
3. “Prove that a destructive operation requires confirmation.”
4. “Give me a reproducer that I can commit to CI.”
5. “Let me compare two versions of a tool without sending production data elsewhere.”
6. “Give me a meaningful first contribution to the agent ecosystem.”
7. “Prove the agent did not take an extra action.”
8. “Reuse a real failure scenario without rebuilding a test harness for every agent framework.”

## Star-growth loops

### Utility loop

Server author runs the CLI → finds a real issue → adds a regression test → returns to the repository for future changes.

### Badge loop

Author publishes a report/badge → users discover Agent Crash Test in a README → more server authors install it.

### Fixture loop

Contributor submits a failure fixture → fixture helps thousands of servers → contributor shares the addition → repository gains visibility.

### Demo loop

A deliberately broken server creates the requested object and an unintended second object → the state diff makes the extra side effect visually obvious → the demo is shared in posts and talks → users try the one-command installation.

### Registry loop

Opt-in compatibility cards link public servers to reproducible reports → tool consumers use the information → maintainers want better reports.

## Anti-positioning

Do not lead with “AI safety certification,” “guaranteed secure,” “production certification,” “the definitive agent score,” “the first agent fault injector,” or “record/replay for MCP.” Those claims are either risky or already occupied. Lead with reusable crash-test packs, explicit recovery contracts, state/effect assertions, and a transparent community corpus.
