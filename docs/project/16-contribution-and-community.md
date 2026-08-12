# Contribution and Community Plan

## Contribution ladder

### Level 1: use and report

- Run the demo.
- Open a bug with the report artifact.
- Suggest a clearer error message.

### Level 2: documentation

- Improve quickstart wording.
- Add a platform note.
- Explain a failure class.

### Level 3: fixture author

- Add a minimal failure fixture.
- Add expected assertions.
- Add remediation guidance.

### Level 4: implementation contributor

- Add a mutation.
- Add a reporter.
- Add a protocol adapter.
- Improve cross-platform behavior.

### Level 5: maintainer

- Review fixture quality.
- Curate severity rules.
- Coordinate releases.
- Maintain compatibility.

## Fixture review standard

Every accepted fixture should have a real failure story, a minimal reproduction, a stable expected outcome, safe execution defaults, a clear severity rationale, a remediation suggestion, tests for both pass and fail behavior, and no secrets or personal data.

## Community rituals

- Weekly “failure of the week” fixture.
- Monthly public challenge against the demo server and volunteer servers.
- Quarterly compatibility report.
- Maintainer office hour or async review thread.
- Release notes that credit fixture authors.

## Governance

Start with a benevolent-maintainer model and a public decision log. Move toward lightweight maintainers with CODEOWNERS when there are recurring contributors. Protocol and severity changes should require a fixture and rationale.

## Code of conduct expectations

The project should be welcoming to newcomers and careful around security reports. Do not encourage testing systems without authorization. Do not publish sensitive traces. Do not shame maintainers for failures; the project exists because failure is normal and should be made visible.
