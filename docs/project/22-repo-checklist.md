# Public GitHub Repository Checklist

This checklist distinguishes repository work that is complete in the shared workspace from GitHub settings and human validation that cannot be completed without repository ownership or external testers.

## Repository fundamentals

- [ ] Final name and ownership confirmed externally.
- [x] README opens with the problem, demo, install command, output, and safety boundary.
- [x] License, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and versioning policy exist.
- [x] Support matrix and maintainer response policy exist.

## Developer experience

- [x] GitHub-first source quickstart is documented; npm publication and `npx` are intentionally deferred.
- [x] `npm ci`, build, tests, demo, `doctor`, and `discover` work locally.
- [x] Demo works without credentials and produces visible intentional findings.
- [x] Custom server starter pack works and refuses overwrite without `--force`.
- [x] Failure reports include reproduction commands, mutation IDs, evidence events, and expected/observed values.
- [x] Linux, macOS, and Windows support policy is documented; external matrix execution remains a release gate.

## Engineering hygiene

- [x] Typecheck, Prettier formatting, unit/integration tests, and audit run in the configured CI workflow.
- [x] Cross-platform Node 20/22/24 matrix is configured.
- [x] `npm run acceptance` exercises the local release path and verifies passing/failing artifacts.
- [x] `npm run action:check` verifies the separate sample repository's passing/failing pack behavior locally; hosted GitHub execution remains external.
- [x] `npm run package:check` verifies the private source tarball in a clean consumer.
- [x] Dependabot monitors npm and GitHub Action dependencies.
- [x] Third-party workflow Action references are pinned by commit.
- [x] No secrets appear in bundled fixtures or generated test artifacts.
- [x] Temporary stdio child processes are closed by the runner.
- [x] Source-preview release workflow generates a SHA-256 checksum and machine-readable release manifest.
- [ ] Cryptographic signing/provenance remains a release-process task for a stable release.

## Community

- [x] Fixture, false-positive, and feature-request issue forms exist.
- [x] Contribution and support/response policy are documented.
- [ ] GitHub labels, Discussions, branch protection, and ownership must be configured in repository settings.
- [x] Declarative first-label set is prepared in `.github/labels.yml`.
- [x] `CODEOWNERS` is prepared for the currently authenticated maintainer; transfer review remains external.
- [ ] Contributor credits must be populated in release notes as contributions arrive.

## Launch

- [x] GitHub Action example and local Action self-test workflow exist.
- [x] Before/after failure example and one-page architecture diagram exist.
- [x] LinkedIn copy and technical launch article are drafted and constrained to implemented behavior.
- [x] Repository-owned animated demo explainer and state-diff assets exist.
- [ ] Real demo screen recording/video must be recorded from the public repository and Action run.
- [ ] Five external testers must complete the manual acceptance script.
- [x] Source-preview release notes and launch copy are prepared.
- [ ] First-72-hour owner and final release tag must be assigned under the confirmed repository owner.

## Post-launch review

Use [RELEASE-RUNBOOK.md](../../RELEASE-RUNBOOK.md) for the ordered preflight, tag,
asset-verification, and rollback procedure.

At 24 hours, 72 hours, 7 days, 30 days, and 90 days review stars and star velocity, unique visitors, release downloads, demo completion, install failures, external repositories using the Action, fixture contributions, repeat users, false positives, maintainer sentiment, unanswered questions, and whether the project is still perceived as a failure lab rather than a generic scanner.
