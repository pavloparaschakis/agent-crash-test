# Contributing

The most valuable contribution is a small, reproducible agent-tool failure with a deterministic fault, observable effect, failing case, passing control, and useful remediation.

## Good contributions

- a crash-test pack based on a failure you encountered;
- a control that demonstrates the safe recovery pattern;
- a framework adapter that emits the normalized JSONL protocol;
- a state observer with a clear trust boundary;
- a mutation with precise phase, applicability, and timing semantics;
- a report or onboarding improvement backed by a concrete user problem.

Start with the [pack contribution guide](examples/packs/README.md). For adapter work, see [examples/adapters](examples/adapters/README.md).

## Development setup

```bash
npm ci
npm run check
```

Before opening a pull request, also run the checks relevant to your change:

```bash
npm run test:unit
npm run test:integration
npm run test:examples
npm run test:downloader
npm run action:check
npm run package:check
npm run acceptance
```

The complete acceptance path should remain credential-free. HTTP, UI, and hosted socket tests may skip only when the execution environment explicitly refuses loopback sockets; they must run in normal GitHub CI.

## Pull-request expectations

- Describe the user-visible failure or job to be done.
- Include a failing regression and a passing control.
- Keep time, output, capture, and process lifecycles bounded.
- Preserve deterministic output where the target permits it.
- Add redaction evidence for new captured or rendered data.
- Document whether the change affects pack schema, report schema, exit codes, or safety policy.
- Update README/CLI help only for behavior that is implemented and tested.

Large new protocols, hosted behavior, or security boundaries should start with an issue so maintainers can agree on ownership and scope.

## Safety

Do not include production data, credentials, access tokens, private traces, or destructive targets. Use bundled fixtures or systems you are explicitly authorized to test. JSON command observers require explicit unsafe opt-in and must be narrowly scoped, read-only in practice, and bounded.

Security-sensitive findings follow [SECURITY.md](SECURITY.md), not a public issue.

## Compatibility

The supported matrix is documented in [PLATFORM-SUPPORT.md](PLATFORM-SUPPORT.md). Avoid shell-only test orchestration in cross-platform paths. Breaking pack/report changes require a changelog entry, migration guidance, and regression coverage.
