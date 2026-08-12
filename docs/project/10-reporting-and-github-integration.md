# Reporting and GitHub integration

Every renderer consumes the same redacted `RunResult`; renderers do not recompute findings.

## Formats

| Format | Intended consumer |
|---|---|
| Terminal | local diagnosis and CI logs |
| Markdown | issues, pull requests, and artifacts |
| JSON | normative machine-readable report |
| JUnit | CI test dashboards |
| GitHub summary | `GITHUB_STEP_SUMMARY` |
| SARIF | code-scanning-compatible ingestion |
| HTML | self-contained, interactive local report |

Reports include pack/run identity, hashes, adapter capabilities, determinism, process policy, mutation outcomes, physical-call timeline, observer evidence, first divergence, findings, stable fingerprints, reproduction, and remediation.

The HTML renderer escapes all untrusted content, applies defensive redaction, has no external runtime dependency, and includes filtering, timeline, findings, and state changes. `agent-crash-test ui <directory>` serves HTML/JSON reports from a read-only loopback server with traversal and symlink-escape protection.

## Finding stability

Finding IDs are contract-owned. Fingerprints derive from normalized semantic inputs so identical failures can be compared across runs. `compare` reports new, unchanged, and resolved fingerprints. SARIF uses those fingerprints as partial fingerprints and labels results as testing observations, not automatic vulnerability certification.

## GitHub Action

The composite Action:

- installs locked dependencies without package lifecycle scripts;
- builds and executes repository packs;
- maps `path`, `format`, `output`, and `fail-on` inputs to the CLI;
- appends GitHub summary output when selected;
- uploads report artifacts even when findings fail the job.

Consumer repositories should pin the Action to an immutable commit or trusted release tag. Automatic PR comments are intentionally absent from `0.1.0` because they require write permissions and duplicate information already available in checks, summaries, and artifacts.

## Privacy

Secret-shaped keys and values are redacted before any renderer receives a report. Reports are still potentially sensitive because tool names, workflow shape, and non-secret state may reveal application behavior. Treat artifacts according to the repository’s data classification and retention policy.
