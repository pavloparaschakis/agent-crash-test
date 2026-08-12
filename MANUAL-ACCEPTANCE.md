# Manual Acceptance Script

This is the short, no-walkthrough evaluation for an independent tester. It is
intentionally separate from `npm run acceptance`: the automated command proves
the repository path, while this script measures whether a new user can
understand and extend it.

## Tester instructions

Use a clean clone and only the README, the repository files it links to, and
the commands below. Do not ask the maintainer for an explanation during the
first pass. Record the command, elapsed time, result, and any confusion before
continuing.

1. Record the Node.js version and operating system.
2. Run `npm ci`.
3. Run `npm run demo`.
4. Open the Markdown report for the timeout/retry duplicate-effect pack.
5. In one sentence, explain what happened, which physical calls were made,
   and what the remediation should be.
6. Run the passing fixture:

   ```bash
   npm run build
   node dist/cli.js run examples/packs/fixture-duplicate-call.yaml \
     --format terminal,markdown,json --output artifacts/manual-acceptance
   ```

7. Run the intentionally failing pack and confirm that the command exits
   non-zero while still writing Markdown and JSON artifacts:

   ```bash
   node dist/cli.js run examples/packs/timeout-retry-duplicates.yaml \
     --format terminal,markdown,json --output artifacts/manual-acceptance
   ```

8. Copy `examples/packs/fixture-duplicate-call.yaml` to a temporary pack,
   change one assertion, and run it. Note how long the edit took and whether
   the failure points to the changed contract.
9. Run `node dist/cli.js doctor` and inspect the local Action example under
   `examples/action-sample-repo/`.
10. Answer the evaluation questions below without looking for an intended
    answer.

## Record for each tester

| Field | Result |
|---|---|
| Tester / date | |
| OS / architecture | |
| Node version | |
| Time to first visible failure | |
| Demo completed without help? | |
| Passing pack completed? | |
| Failing pack produced artifacts? | |
| Fixture edit completed in under 30 minutes? | |
| Orphaned child process observed? | |
| Unredacted secret observed? | |
| First confusing command or phrase | |
| Suggested README change | |

## Evaluation questions

1. What was the requested action?
2. What fault was injected?
3. How many physical calls happened, including retries or duplicates?
4. What expected effect was violated?
5. Which event was the first divergence?
6. What would you fix in the server or workflow?
7. Would you use this against a local MCP server? Why or why not?
8. Which capability would you need before using it regularly?

## Launch thresholds

The public announcement gate is met only when five independent testers are
recorded, all five complete the demo, at least four understand the
extra-effect finding without explanation, at least four can add a fixture in
30 minutes, no tester sees a test secret, and no tester leaves an orphaned
child process. Any installation or comprehension blocker must be fixed and the
automated acceptance command rerun before launch.
