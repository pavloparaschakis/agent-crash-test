# Agent Crash Test: agents need effect contracts, not only traces

Agent-tool failures are often successful API calls followed by the wrong recovery. A timeout can happen after a write, a retry can create a duplicate, or an approval flag can be ignored while the final response still appears plausible.

Agent Crash Test makes that failure reproducible. It sits between a client and its tools, injects one bounded fault, records physical calls, samples an explicit state observer, and checks the real effect. The same contract engine works with scripted MCP packs, transparent real-client MCP traffic, and framework-neutral JSONL adapters.

The signature scenario is simple: invoice creation commits, the response is lost, and the agent retries. A trace says “timeout, then success.” The effect contract says `invoices.length` changed from `0` to `2` when it was allowed to become `1`. The fix is idempotency and outcome reconciliation, not a prettier retry log.

The project ships seventeen fault types, guided capture, domain and framework examples, CI-native reports, an interactive HTML artifact, and a composite GitHub Action. It remains local-first and credential-free for the first success path.

The trust boundary is explicit. Child processes are not sandboxed. Command observers require double opt-in. Missing state evidence is inconclusive, never a pass. No model judge decides blocking correctness.

The useful community asset is the crash-test pack: a small, reviewable record of a failure, its observable effect, safe recovery, passing control, and remediation. A growing corpus of those packs is more valuable than another generic agent dashboard.
