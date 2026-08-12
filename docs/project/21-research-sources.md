# Research Sources

This document records the external sources used to shape the product direction. Links should be rechecked before publication because the ecosystem changes quickly.

## Protocols and registries

- [MCP conformance tests](https://github.com/modelcontextprotocol/conformance)
- [MCP Registry](https://github.com/modelcontextprotocol/registry)
- [GitHub MCP Registry announcement](https://github.blog/ai-and-ml/github-copilot/meet-the-github-mcp-registry-the-fastest-way-to-discover-mcp-servers/)
- [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [MCP tool annotations guidance](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)

## Adjacent testing, scoring, and security tools

- [Pulrix](https://www.pulrix.dev/)
- [Agent Ready API](https://agent-ready.dev/docs/api)
- [AgentReady standard](https://www.agentready.org/)
- [mcp-scan](https://mcpscan.dev/)
- [mcp-audit](https://audit.pyfio.com/)
- [Snyk agent-scan](https://github.com/snyk/agent-scan)
- [MCPReplay](https://mcpreplay.com/)
- [mcp-agent-test](https://pypi.org/project/mcp-agent-test/)
- [mcp-jest](https://github.com/josharsh/mcp-jest)
- [MCPMark](https://github.com/eval-sys/mcpmark/)
- [Iris MCP evaluation](https://iris-eval.com/)
- [AgentCheck: Reproduce-Intervene-Mitigate Workbench for LLM Agents over MCP](https://arxiv.org/abs/2607.11098)
- [AgentSeal MCP attack categories](https://agentseal.org/docs/attack-categories/mcp-tools)
- [mcp-strike](https://pypi.org/project/mcp-strike/)
- [OWASP MCP Tool Poisoning](https://owasp.org/www-community/attacks/MCP_Tool_Poisoning)
- [MCP tool-description smells research](https://arxiv.org/abs/2602.14878)
- [DynamicMCPBench](https://arxiv.org/abs/2607.20531)
- [MCP Pitfall Lab](https://arxiv.org/abs/2604.21477)

## Research and ecosystem signals

- [MCP-AgentBench](https://ojs.aaai.org/index.php/AAAI/article/download/40347/44308)
- [Agent harness engineering survey](https://openreview.net/pdf/f358711a95aaaf61fdeffd4ef3fc60fba9b8da57.pdf)
- [GitHub star and open-source adoption analysis](https://arxiv.org/abs/2607.02453)
- [StarScout research on anomalous GitHub stars](https://arxiv.org/abs/2412.13459)

## Research interpretation

The sources support three conclusions:

1. Agent-tool infrastructure is active and expanding, so protocol timing matters.
2. Testing, scoring, replay, security, and evaluation are already separate categories; a generic scanner would be poorly differentiated.
3. A developer-oriented tool can stand out by combining deterministic reproduction, failure injection, behavioral assertions, and public contribution artifacts.
4. The project should not claim to have invented the general reproduce/intervene/mitigate workflow. Its honest opportunity is to make that workflow easy to adopt, state-aware, CI-native, and community-extensible.
5. The first release should be pack-first and stdio-first: record/replay, remote HTTP/OAuth, broad security claims, and real-agent evaluation each carry material overlap or trust-boundary complexity.
