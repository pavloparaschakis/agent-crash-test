# Security, Privacy, and Trust

## Threat model

Agent Crash Test itself may process tool arguments, tool outputs, environment variables, file paths, and secrets. It may also start untrusted local processes. The tool must minimize the authority it receives and make data movement visible.

## Default protections

- Do not inherit the full parent environment by default.
- Do not print secret values.
- Redact before persisting fixtures.
- Default to fixture-backed or local-stdio execution. Enforce network denial only in a documented sandbox/container mode; otherwise warn clearly that the host runtime cannot guarantee it.
- Use temporary directories with cleanup.
- Cap process lifetime and stderr capture; target output size limits remain a future bounded-output adapter concern.
- Require explicit opt-in for effect probes that are not declared read-only.
- Never run a recorded or imported call against production automatically.
- Mark every report with the execution mode.

## Data classification

### Public

Tool names, schemas, fixture IDs, and sanitized reports that the user explicitly publishes.

### Sensitive

Arguments, outputs, file paths, email addresses, identifiers, and internal URLs.

### Secret

Tokens, cookies, private keys, passwords, credentials, and session material.

Secret values must never be written to fixtures, logs, reports, or crash telemetry.

## Network policy

Modes in the v0.1 pack schema:

- `not_enforced`: normal stdio execution; the report warns that host networking is available.
- `external_sandbox_required`: the pack declares that an external container/VM boundary must be supplied by the caller; the runner does not pretend to enforce it.

## Side-effect policy

The v0.1 runner treats tool annotations as untrusted claims and calls only fixture-state probes or tools that declare `readOnlyHint: true`, unless the pack and CLI explicitly opt into an unsafe probe. Scenario tools are authored by the pack and may be writes; users must supply an external sandbox for untrusted targets.

MCP annotations are hints, not trusted truth. The tool may report a contradiction only when a declared annotation conflicts with an explicit observed effect probe; absence of an annotation is a conservative-risk posture, not proof of a defect.

## Scope boundary for security packs

P0 security work protects the test harness itself: redaction, visible authority boundaries, safe defaults, and non-overstated reports. Tool-poisoning and exfiltration packs are P1 because a valid result requires a real agent runner, a canary, and a defined sink action. A static string resembling an instruction is evidence of untrusted content, not evidence that an agent was compromised.

## Supply-chain requirements

- Pin GitHub Actions by commit in repository workflows.
- Publish checksums for release artifacts.
- Use dependency scanning.
- Generate an SBOM for releases when practical.
- Document the release signing plan before stable 1.0.
- Minimize install-time scripts.

## Responsible disclosure

The repository should contain `SECURITY.md` with supported versions, a private reporting channel, expected response times, safe-harbor language for responsible testing, and guidance not to include secrets or production data.

## Trust language

Allowed: “This test detected…”, “The fixture reproduced…”, and “The tool did not satisfy the declared invariant…”.

Avoid: “Certified safe,” “Guaranteed secure,” “Production-proof,” and “No vulnerabilities.”
