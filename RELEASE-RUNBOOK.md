# Release runbook

This project uses a GitHub-first release. npm publication is a separate,
explicit maintainer operation so the GitHub workflow does not require a long-lived
npm credential. The tag-driven workflow creates a GitHub release only after the full
acceptance suite, production audit, source tarball, checksum, and release
manifest succeed.

## Before the first public release

An owner must complete the external gates in [the repository checklist](docs/project/22-repo-checklist.md):

- confirm `pavloparaschakis/agent-crash-test` and replace `COMMIT_SHA` examples
  with the first immutable public revision;
- enable private vulnerability reporting and configure the security contact;
- apply labels, branch/ruleset protection, required CI checks, and the
  merge-queue policy if used;
- run the hosted Linux/macOS/Windows × Node 20/22/24 matrix;
- run the Action sample from a separate repository, including its intentional
  failure and artifact upload;
- complete five independent quickstarts and resolve any comprehension or
  installation blocker;
- record the real public-repository demo and assign first-72-hour ownership.

GitHub’s guidance supports least-privilege workflow permissions, full-length
SHA pinning for immutable Action references, and required status checks on
protected branches. See the [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use),
[protected branch guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches),
and [merge-queue status-check guidance](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-pull-requests/about-status-checks).

## Local preflight

Run from a fresh checkout on Node 20, 22, or 24:

```bash
npm ci
npm run acceptance
npm audit --omit=dev --audit-level=high
npm run workflow:check
npm run release:check
```

Prepare and verify the source assets:

```bash
mkdir -p .release-assets
npm pack --pack-destination .release-assets
npm run release:assets
(cd .release-assets && shasum -a 256 -c SHA256SUMS)
```

Inspect the tarball contents with `npm pack --dry-run --json`. Confirm that it
contains runtime `dist/` files, `examples/`, `action.yml`, the security policy,
and the control corpus; confirm it excludes compiled tests, TypeScript source,
build scripts, credentials,
working-tree reports, or `.release-assets/` files.

## Tag and release

After the external gates are green and the public repository is confirmed:

```bash
git tag -a v0.1.0 -m "Agent Crash Test v0.1.0 source preview"
git push origin v0.1.0
```

`.github/workflows/release.yml` then:

1. checks out the exact tag;
2. installs with `npm ci`;
3. runs `npm run acceptance` and the production dependency audit;
4. creates one source tarball;
5. writes `SHA256SUMS` and `release-manifest.json` containing the commit,
   package version, size, and digest;
6. creates the GitHub release with the matching `RELEASE_NOTES_<tag>.md` file
   when present, otherwise generated notes;
7. attaches the tarball, checksum, and manifest as release assets.

The workflow uses `contents: write` only on the release job. It does not run
`npm publish`, request package credentials, or create a release from an
untagged branch. The normal CI and Action workflows use explicit timeouts and
least-privilege permissions; the composite Action installs its locked
dependencies with lifecycle scripts disabled.

## Post-release verification

Verify the hosted run and assets before announcing:

```bash
gh run list --workflow "Release source preview" --limit 5
gh release view v0.1.0
gh release download v0.1.0 --dir /tmp/agent-crash-test-release-download
(cd /tmp/agent-crash-test-release-download && shasum -a 256 -c SHA256SUMS)
```

Then publish the reviewed LinkedIn copy and technical article from
`18-linkedin-content.md` and `TECHNICAL-LAUNCH.md`, linking to the actual
repository, actual release, and real public-run demo. Never imply a guaranteed
star count, security certification, or hosted capability that is not present.

## Rollback and follow-up

If the release workflow or artifact verification fails, pause the announcement,
open a corrective issue, and publish a new patch tag after the acceptance suite
is green. Preserve the failing report as a redacted fixture when it is safe and
useful. Do not delete evidence or silently move a release tag. Record any
contributor credits in the next release notes and follow the first-72-hour
response policy in `SUPPORT.md`.

## Optional npm publication

After the GitHub release is verified, publish from a clean maintainer environment with trusted publishing or a short-lived scoped token:

```bash
npm run acceptance
npm audit --omit=dev --audit-level=high
npm pack --dry-run --json
npm publish --access public
npx agent-crash-test@latest demo
```

Verify the package metadata, provenance when configured, tarball contents, and clean-machine demo before linking `npx` in launch posts. Deprecate a bad version and publish a patch; do not overwrite a released version.
