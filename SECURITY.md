# Security policy

Agent Crash Test runs local MCP commands and may process tool arguments,
tool outputs, proxy traffic, capture files, and observer snapshots. Do not run
packs or proxies against production systems or include real credentials in
pack files, captures, JSONL streams, or snapshots.

## Supported source-preview releases

- `0.1.x`: best-effort security triage for the source-preview branch.
- Older or modified local copies: upgrade to the latest source preview before
  reporting unless the issue prevents upgrading.

This policy describes the project’s response process; it is not a guarantee
that the runner is a security boundary or that every report is exploitable.

## Private reporting

Report vulnerabilities privately through GitHub private vulnerability
reporting after it is enabled on the public repository. If that channel is not
available, contact the repository owner through the maintainer profile rather
than opening a public issue. The public repository settings must replace this
fallback with a named maintainer route before launch.

Do not include credentials, production traces, or exploit details in a public
issue, pull request, or discussion. Send a minimal, secret-free reproduction,
the affected version/commit, operating system and Node.js version, impact,
and a redacted report artifact. If a secret was exposed, revoke or rotate it
before investigating the report.

## Response targets

Maintainers aim to acknowledge an actionable security report within seven
calendar days and provide an initial disposition or mitigation plan within
thirty days. These are best-effort targets for an experimental project, not a
service-level agreement. Coordinated disclosure timing will be agreed with
the reporter when a fix is needed.

## Safe-harbor boundary

Testing is welcome against the bundled fixtures, the local demo server, and
systems for which the tester has explicit authorization. Stop testing and
report privately if an experiment accesses data, credentials, or a system
outside that authorization. Do not attempt denial of service, persistence,
data destruction, credential harvesting, or production execution.

## Execution limitations

The default execution mode does not inherit arbitrary environment variables,
but it still runs a local child process with host filesystem and networking
access. The runner can record that an external sandbox is required, but it
does not enforce that boundary; a normal host process cannot guarantee network
denial. `json_command` observers are explicitly unsafe opt-in commands, not a
sandbox. Proxy `disconnect_after_commit` models the client-visible failure
without destroying the proxy process, so it must not be mistaken for a network
or process-isolation guarantee. Treat reports as observed test evidence, not
security certification.
