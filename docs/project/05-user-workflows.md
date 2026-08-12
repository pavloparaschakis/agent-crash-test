# End-to-End User Workflows

## Workflow 1: first five minutes

```bash
git clone https://github.com/pavloparaschakis/agent-crash-test
cd agent-crash-test
npm ci
npm run demo
```

Expected experience:

1. CLI verifies runtime prerequisites.
2. Each local demo server starts as a bounded child process; normal stdio mode
   is not a filesystem or network sandbox.
3. Discovery lists the demo tools.
4. Baseline tests run.
5. Declared deterministic mutations execute against the same scenario.
6. The state oracle shows the intended state delta and the observed extra or duplicate transition.
7. Terminal shows a compact summary.
8. Markdown and JSON report paths are printed.
9. User sees one command to add the demo pattern to another repository.

**Target:** first meaningful failure within 120 seconds; first successful custom test within 10 minutes.

## Workflow 2: test a local MCP server

```bash
npm run build
node dist/cli.js discover --stdio "node dist/server.js"
node dist/cli.js init tests/agent --server "node dist/server.js"
node dist/cli.js run tests/agent
```

The CLI should ask no interactive questions for the default safe path. Optional prompts can help configure side-effect classifications after the first run.

## Workflow 3: author a crash-test pack

```bash
npm run build
node dist/cli.js init tests/agent --server "node dist/server.js"
node dist/cli.js run tests/agent
```

The starter pack declares the local server, an explicit scenario, a fault profile, effect probes, assertions, and remediation. The P0 workflow is deliberately authored and deterministic; it does not promise to transparently capture an arbitrary desktop-agent session.

## Workflow 4: mutate and rerun

```bash
npm run build
node dist/cli.js mutate \
  tests/agent/create-ticket.yaml \
  --profile resilience

node dist/cli.js run tests/agent/create-ticket.yaml
```

The result must show original call, mutation applied, expected invariant, observed behavior, severity, reproduction command, and remediation suggestion.

When the fixture has a state oracle, the result must additionally show:

- expected final state;
- observed final state;
- explicit effect paths and before/after values;
- missing, extra, duplicated, wrong-target, or out-of-order transitions.

## Workflow 5: CI on pull request

```yaml
name: Agent Crash Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@COMMIT
      - uses: pavloparaschakis/agent-crash-test@COMMIT
        with:
          path: tests/agent
          format: terminal,markdown,json
          output: artifacts/agent-crash-test
          fail-on: error
```

The v0.1 Action uploads Markdown and JSON artifacts and fails the workflow for
blocking findings. PR comments and line annotations are P1, so a workflow
should link to the uploaded artifact rather than promise an automatic comment.

## Workflow 6: add a crash-test pack

1. Copy an existing pack or follow the [fixture contribution template](../../examples/packs/README.md).
2. Give the scenario a stable slug.
3. Describe the real failure pattern.
4. Define a minimal server behavior.
5. Define expected invariants.
6. Run the pack locally with `npm run check` and `npm run acceptance`.
7. If adding a YAML file under `examples/packs`, add its expected outcome to
   the demo-packs regression test as described by the template.
8. Add a short explanation and remediation, then open a pull request.

## Workflow 7: import or record a real session (P1)

Recording and fixture import are planned after the pack format has proven useful. The recording adapter must be protocol-aware, redact before persistence, and make its trust boundary explicit. It must never silently intercept an arbitrary desktop agent.

## Workflow 8: compare versions (P1)

```bash
agent-crash-test compare \
  --before "git worktree ..." \
  --after "git worktree ..." \
  --tests tests/agent
```

This workflow is P1 and should report new failures, resolved failures, changed evidence, and untested behavior.

## Workflow 9: prove “nothing else happened”

The user defines a requested state transition and a forbidden-change assertion:

```yaml
state_contract:
  effects:
    - path: invoices.length
      expected_delta: 1
  forbidden:
    - path: refunds.length
      forbidden_change: any
    - path: outbound_messages.length
      forbidden_change: increase
```

The report must make a successful requested action with an unintended extra action visually obvious. This is the signature demo and should be treated as a first-class workflow, not an advanced footnote.
