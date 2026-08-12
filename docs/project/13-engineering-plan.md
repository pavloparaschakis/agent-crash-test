# Engineering Plan

## Repository layout

```text
agent-crash-test/
  src/
    cli.ts
    runner.ts
    mutations.ts
    assertions.ts
    mcp-client.ts
    fixture-client.ts
    reporters.ts
    test/
  examples/
    packs/
    invoice-server.fixture.yaml
  scripts/
  .github/
  *.md
  .github/
```

## Work breakdown

### Track A: core runtime

- command parsing;
- config validation;
- process lifecycle;
- temp directories;
- exit codes;
- logging;
- cancellation;
- cross-platform path handling.

### Track B: protocol adapter

- MCP initialization;
- tools/list;
- tools/call;
- stdio;
- Streamable HTTP (P1);
- error normalization;
- transport tests.

### Track C: fixture engine

- YAML schema;
- versioning;
- redaction;
- event normalization;
- fixture validation;
- fixture minimization;
- seed management.

### Track D: mutation engine

- mutation interface;
- timeout;
- retryable error;
- malformed result;
- stale result;
- duplicate invocation;
- permission denial;
- schema drift/injection content (P1);
- safe probe policy.

### Track E: assertion engine

- physical call presence/absence and counts;
- result paths and annotations;
- effect equality and forbidden transitions;
- severity mapping and reproduction evidence.

### Track E2: state oracle

- fixture-backed initial/final state;
- declared read-only MCP effect probes;
- observed state reconstruction (P1);
- JSON path comparisons;
- intended delta declarations;
- forbidden transition declarations;
- volatile-field ignore rules;
- minimal diff rendering.

### Track F: reports and integrations

- terminal;
- Markdown;
- JSON;
- JUnit (P1);
- SARIF (P1);
- HTML (P1);
- GitHub Action;
- PR comments (P1);
- artifacts;
- badge generator (P1).

### Track G: adoption

- demo server;
- quickstart;
- fixture templates;
- contribution guide;
- examples;
- launch recording;
- issue templates;
- release automation.

## Suggested build order

1. Demo server and normalized event model.
2. Discovery and basic invocation.
3. Pack schema and deterministic rerun.
4. One mutation, one behavioral assertion, and one state-diff assertion.
5. Full mutation profiles.
6. Reports.
7. GitHub Action.
8. Redaction and security hardening.
9. Cross-platform validation.
10. Public documentation and launch.

## Definition of done for each feature

- Unit tests cover normal and invalid inputs.
- Integration test exercises the real protocol path.
- CLI help documents the feature.
- At least one fixture demonstrates it.
- Stateful features include both a passing and failing example.
- Report output includes the result.
- Failure mode has a stable error identifier.
- Security implications are documented.
- Cross-platform behavior is either verified or explicitly marked unsupported.
