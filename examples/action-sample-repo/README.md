# Agent Crash Test Action sample

This directory is a copy-ready sample repository for validating the composite Action from a separate repository.

## Use it

1. Copy this directory into a new GitHub repository.
2. Replace `REPLACE_WITH_COMMIT` in `.github/workflows/crash-test.yml` with the immutable commit to test.
3. Push the repository and inspect both the passing (green) and intentionally
   failing (red) jobs.
4. Confirm that the failing job uploads Markdown and JSON artifacts before treating the Action as release-ready.

The sample uses only a local fixture and no secrets. The `passing` job expects the duplicate effect and is green, while the `intentional-failure` job expects one invoice and is intentionally red. The composite Action uploads artifacts from its `always()` step before returning the failure status.

The workflow uses `contents: read` and does not request a token for comments or writes.
