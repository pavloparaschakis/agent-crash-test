# Framework adapters

The adapters translate real framework tool activity into Agent Crash Test's
language-neutral JSONL schema.

| Adapter | Real framework surface | Credential-free verification |
|---|---|---|
| [mcp-agent](mcp-agent/) | `MCPApp`, `Agent`, attached `OpenAIAugmentedLLM`, instrumented agent function | Deterministic `--mode offline`; graceful `--mode check` and real-mode skip |
| [OpenAI Agents SDK](openai-agents-sdk/) | `Agent`, `Runner.run`, and `@function_tool` | Deterministic `--mode offline`; graceful `--mode check` and real-mode skip |

Offline mode is not presented as a model run. It is a stable replay of the same
adapter boundary used by real mode, allowing repository CI to validate event
shape, mutation evidence, state snapshots, and broken/fixed outcomes without a
package download, API key, or network call.

Each adapter README documents how to opt into a credentialed real-framework run.
