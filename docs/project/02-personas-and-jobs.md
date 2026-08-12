# Personas, Jobs, and Use Cases

## Persona A: MCP server maintainer

**Profile:** Maintains an open-source server that exposes APIs, files, databases, browser actions, or internal workflows to agents.

**Pain:** The tool works during manual testing but fails under timeouts, schema changes, ambiguous prompts, and unexpected response shapes.

**Primary job:** Ship a trustworthy server without writing a custom test harness from scratch.

**Success:** Adds a GitHub Action, receives a useful report, and commits fixtures for regressions.

## Persona B: Agent application developer

**Profile:** Builds an agent that depends on several tools and needs confidence across upgrades.

**Pain:** Tool behavior changes under them; failures appear as model hallucinations even when the real issue is a tool contract.

**Primary job:** Test tool-call trajectories and invariants in a sandbox.

**Success:** Can reproduce an incident with a fixture and verify a new tool version before deployment.

## Persona C: Security-minded integrator

**Profile:** Reviews external MCP servers, agent skills, or plugins before allowing them into a development environment.

**Pain:** Static reports are difficult to connect to actual behavior and often lack a clear reproduction.

**Primary job:** Exercise risky behavior safely and document what happened.

**Success:** Receives explainable findings with severity, evidence, and remediation guidance.

## Persona D: Framework author

**Profile:** Maintains an agent SDK, client, or orchestration framework.

**Pain:** Protocol support appears compatible until edge cases emerge across transports, errors, and side effects.

**Primary job:** Run a shared conformance-plus-chaos fixture suite against client implementations.

**Success:** Uses the portable format as an interoperability test suite.

## Persona E: OSS contributor

**Profile:** Wants a concrete contribution path into agent infrastructure.

**Pain:** Large agent repositories are intimidating; documentation-only contributions feel low impact.

**Primary job:** Add a failure fixture, reproduction, or remediation rule.

**Success:** Can contribute a fixture in under 30 minutes with a clear template and passing local checks.

## Priority use cases

### P0: Test a local MCP server

Given a local command that starts an MCP server, the user can discover tools, generate baseline checks, run mutations, and receive a report without network credentials.

### P0: Author and rerun a crash-test pack

Given a local server command and a pack template, the user can declare a scenario, fault, effect probe, assertion, and expected recovery, then rerun it deterministically.

### P0: Protect a repository in CI

Given a test directory, the user can add a GitHub Action that fails when a P0 invariant regresses.

### P0: Contribute a failure scenario

Given a failure pattern, the contributor can add a YAML fixture and expected outcome with documentation.

### P1: Compare two server versions

Given two local server commands, the user can run the same fixture suite against both and inspect behavioral differences.

### P1: Record and import a tool interaction

Given a protocol-aware proxy or a supported external fixture format, the user can sanitize, import, and convert a real session into a crash-test pack.

### P1: Generate a remediation patch

Given a schema or description failure, the user can review a proposed patch and apply it manually.

### P2: Evaluate an entire agent task

Given an agent runner and a sandbox, the user can measure end-to-end task success across models and tool sets.

## Edge cases to design for

- Server process exits during initialization.
- Tool listing succeeds but invocation fails.
- Tool returns valid JSON with the wrong semantic shape.
- Tool hangs beyond the configured timeout.
- Server emits logs on stdout and corrupts stdio transport.
- Tool requires credentials that are unavailable.
- A mutation would trigger a real external side effect.
- Fixture contains secrets or personal data.
- Server behavior is nondeterministic.
- Test is flaky because the external dependency changes.
- A user runs the CLI on Windows, macOS, or Linux.
- A test suite contains a mix of safe and explicitly destructive cases.
