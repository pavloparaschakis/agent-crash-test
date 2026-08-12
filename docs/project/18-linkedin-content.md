# LinkedIn Launch Content

## Post 1: founder launch

**Hook:**

Most agent tools are tested only when everything goes right.

That is exactly when they look reliable.

I’m building Agent Crash Test, an open-source failure lab for MCP servers and agent tools.

The first version can:

- inject timeouts, malformed responses, stale data, duplicate calls, and permission denial;
- test confirmation and explicit effect invariants;
- rerun deterministic crash-test packs locally;
- run reusable regression packs and produce GitHub Action artifacts.

The goal is simple: make agent-tool failures reproducible before they become production incidents.

The first version runs locally and needs no API key.

GitHub: [LINK]

What is the most dangerous failure mode you have seen from an agent tool?

#opensource #aiagents #mcp #developertools

## Post 2: contrarian insight

An agent saying “done” is not evidence that the tool succeeded.

The tool may have timed out. The response may have been stale. The action may have happened twice. The agent may have skipped confirmation.

This is why I’m working on behavioral contracts for agent tools—not another opaque readiness score.

Agent Crash Test turns those assumptions into executable tests.

Example:

```yaml
state_contract:
  forbidden:
    - path: outbound_messages.length
      forbidden_change: increase
```

Then the test deliberately introduces failure conditions and checks whether the invariant still holds.

Open source, local-first, reproducible.

## Post 3: contributor call

I’m collecting real failure scenarios for agent tools.

Examples:

- a retry that creates a duplicate side effect;
- a timeout that looks like success;
- a stale response returned for a different request;
- an unconfirmed action that changes a forbidden fixture path.

Each scenario can become a small portable crash-test pack.

If you have seen one, add it here: [LINK]

## Post 4: build-in-public update

This week’s Agent Crash Test progress:

- [X] MCP discovery
- [X] deterministic pack rerun
- [X] timeout mutation
- [X] duplicate-call mutation
- [x] GitHub Action artifacts
- [ ] GitHub PR annotations (P1)
- [ ] public fixture challenge

The interesting part is not the CLI. It is building a shared vocabulary for how agent tools fail.

## Post 5: launch follow-up

The first release of Agent Crash Test is now public.

The demo intentionally contains broken tools. Run it, watch the failures appear, inspect the reproduction, then fix one and rerun the test.

No cloud account. No proprietary desktop app. No opaque score.

Just reproducible failure tests for agent tools.

GitHub: [LINK]

## Content rules

- Never claim that the project certifies safety.
- Show actual output instead of vague AI claims.
- Credit fixture contributors.
- Share failures respectfully.
- Use one primary CTA per post.
- Prefer a short demo over a long feature list.
