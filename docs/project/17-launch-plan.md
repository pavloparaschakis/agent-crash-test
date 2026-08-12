# Public Launch Plan

## Launch objective

Create a public repository that is immediately understandable, runnable without credentials, technically credible, and easy to share.

## Pre-launch gates

- [ ] Repository name and ownership confirmed externally.
- [x] Read-only GitHub/npm name collision check completed on 2026-08-01; recheck immediately before publication.
- [x] License selected.
- [x] README quickstart works locally; clean-machine confirmation remains external.
- [x] Demo server has no external dependency.
- [x] At least five visible demo findings exist.
- [x] The demo includes one “requested action succeeded, extra action also happened” state-diff failure.
- [x] The signature finding includes a concrete remediation path.
- [ ] GitHub Action works on a separate sample repository; the copy-ready sample and in-repository self-test are configured.
- [x] Terminal, Markdown, and JSON artifacts are readable and complete locally.
- [x] Security defaults are documented.
- [x] Issue templates and contribution guide are present.
- [ ] Release tag and changelog need final ownership/date confirmation.

## Launch assets

1. Thirty- to sixty-second screen recording from the public repository.
2. One animated terminal GIF (repository-owned explainer exists; real recording remains an external gate).
3. One terminal or Markdown effect-diff screenshot.
4. One architecture diagram.
5. One “before/after” tool description example.
6. One GitHub Action workflow.
7. One fixture contribution example.
8. One expected-versus-observed state-diff screenshot.
9. One technical launch post.

## Launch sequence

### T-minus 14 days

- Recruit five private testers.
- Publish an issue asking for failure scenarios.
- Validate install matrix.
- Draft launch copy.

### T-minus 7 days

- Freeze MVP scope.
- Record demo.
- Open repository with an unreleased label or private preview if needed.
- Ask trusted maintainers for feedback.

### T-minus 2 days

- Test all links.
- Confirm release artifacts.
- Prepare GitHub Discussion prompts.
- Prepare responses to likely objections.

### Launch day

- Publish GitHub release.
- Publish personal LinkedIn post.
- Publish technical deep dive.
- Share in relevant MCP and agent communities where allowed.
- Monitor issues and installation failures.
- Respond to every substantive comment.

### First 72 hours

- Fix installation blockers first.
- Label beginner-friendly issues.
- Merge at least one external fixture if quality allows.
- Publish a follow-up with real findings, not inflated metrics.

## Launch message

"Agent tools fail in ways ordinary API tests miss. Agent Crash Test packages a fault, a recovery expectation, and an effect contract into a reusable test. It then checks whether the requested state change happened—and whether anything extra happened too."

## Distribution targets

- GitHub Trending via genuine adoption, not artificial activity.
- Hacker News technical discussion.
- MCP community forums and Discords where permitted.
- Agent framework communities.
- Developer-tool newsletters.
- LinkedIn posts from the builder and early users.
