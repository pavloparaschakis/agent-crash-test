# Launch Assets and Copy Bank

## Taglines

- Playwright and Chaos Monkey for agent tools.
- Define it. Break it. Prove the effect.
- Make agent-tool failures reproducible.
- The crash-test dummy for MCP servers.
- Behavioral contracts for agent tools.
- Prove the agent did what you asked—and nothing else.

## GitHub repository description

Open-source crash-test packs and behavioral contracts for MCP servers and agent-tool workflows. Inject faults, prove effects, and prevent regressions in CI.

## Short elevator pitch

Agent Crash Test lets you define a realistic agent-tool failure, inject it deterministically, verify recovery and effect invariants, and commit the result as a reusable CI pack.

## Demo script

1. Start with a healthy-looking invoice server.
2. Run the quickstart.
3. Show that all happy-path calls pass.
4. Enable timeout mutation.
5. Inject a timeout and show a duplicate invoice creation.
6. Show that the requested invoice exists but an extra invoice or outbound message also exists.
7. Open the generated crash card with expected/observed values and the physical call timeline.
8. Apply the suggested idempotency/confirmation fix.
9. Rerun and show the regression passing.

## Screenshot checklist

- Terminal summary with pass/fail counts.
- Timeline showing the duplicate call.
- Side-by-side expected/observed output.
- GitHub Action artifact.
- Markdown/JSON report artifact.
- Fixture YAML.
- Generated [before/after state-diff illustration](../../assets/state-diff.png).
- [Action artifact example](../../assets/action-artifact-example.md).

## Repository-owned explainer

The generated [terminal demo GIF](../../assets/demo-terminal.gif) shows the verified timeout → retry → duplicate-effect narrative. It is suitable for README/social preview work, but it is not a substitute for the final real screen recording from the public repository and GitHub Action run.

## FAQ copy

### Is this an MCP security scanner?

It can detect some security-relevant behaviors, but it is primarily a testing and reproducibility tool. It does not certify a server as secure.

### Does it require an LLM?

No. The core workflow uses deterministic fixtures and assertions. Optional model-in-the-loop evaluation can be added later.

### Does it need production credentials?

No. The default fixture workflow is local and credential-free. A local stdio target may use host networking, so run untrusted servers in an external sandbox and do not treat the demo as offline isolation.

### Is it another MCP conformance test suite?

No. Protocol conformance is important, but this project focuses on realistic failure injection, behavioral invariants, and regression tests for maintainers.

### What does the score mean?

There should not be a single score in the initial release. Reports should expose individual tests, severity, evidence, and reproduction steps.

### How is this different from the nearby research and evaluation tools?

The project intentionally follows the same valuable reproduce/intervene/confirm direction, but its open-source implementation should emphasize a portable crash-test pack format, GitHub-native regression testing, deterministic state-diff assertions, community-contributed failure cases, and a local-first workflow that does not require a hosted workbench or mandatory model judge.
