# Support and maintainer response policy

Use GitHub Issues for reproducible behavior, fixture requests, documentation problems, and false positives. Include the pack, command, report format, runtime version, and a redacted report artifact.

Security-sensitive reports belong in the private channel described in `SECURITY.md`; do not publish credentials, production traces, or exploit details in an issue.

Maintainer targets are best-effort: acknowledge actionable issues within seven days, label the next step, and either ship or explain a disposition within thirty days. A false-positive report with a minimal fixture is prioritized over a broad claim without evidence.

Breaking changes require a changelog entry, a pack/report schema decision, migration notes, and a passing regression fixture. Contributors receive credit in release notes when their fixture or implementation is included.
