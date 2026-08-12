# Versioning

Agent Crash Test follows Semantic Versioning once the pack schema reaches 1.0.

- `0.x`: the CLI and pack schema may change in minor releases; every change is recorded in the changelog.
- `1.0+`: a supported pack schema version remains readable for the stated major version. Breaking CLI or schema changes require a major release and migration notes.
- Every report contains `schemaVersion` so downstream CI tooling can reject unsupported report shapes deliberately.

The v0.1 baseline supports only pack `version: 1`, MCP stdio, and fixture transports.
