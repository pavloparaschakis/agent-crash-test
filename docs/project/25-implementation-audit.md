# Implementation audit

This file distinguishes implemented behavior from public-release gates. Counts are intentionally updated only after a completed verification run.

## Implemented product paths

| Capability | Status | Primary evidence |
|---|---|---|
| Fixture and scripted MCP execution | Implemented | `src/fixture-client.ts`, `src/runner.ts`, control/demo tests |
| Real-client MCP stdio crash testing | Implemented | `src/proxy.ts`, `src/proxy-runner.ts`, real-client integration tests |
| MCP client configuration generation | Implemented for stdio packs | `wrap` command and CLI expansion test |
| Effect/state contracts | Implemented | intended, forbidden, cardinality, authorization, ordering, recovery; contract tests |
| Explicit state observers | Implemented | fixture, declared read-only tool, and double-gated JSON command probes |
| Guided capture authoring | Implemented | deterministic proposal, redaction, explicit confirmations, safe observer policy |
| Mutation engine | 17 types implemented | unit, integration, proxy, and control tests |
| Protocol-neutral JSONL contracts | Implemented | strict parser, core evaluator, CLI contract test, framework examples |
| Reports | Implemented | terminal, Markdown, JSON, JUnit, GitHub summary, SARIF, HTML |
| Read-only report UI | Implemented | loopback server and traversal/XSS tests |
| Streamable HTTP/SSE transport | Implemented as a low-level proxy primitive | bounded POST/GET/DELETE forwarding, sessions, mutation hooks, loopback policy |
| Self-hosted collaboration store | Implemented as a single-operator foundation | bearer auth, redacted reports, atomic storage, retention, limits, CORS allowlist |
| Public Node API | Implemented | package-root exports and consumer smoke |
| Domain/framework examples | Implemented | filesystem, SQLite, approval/send/deploy, MCP Agent, OpenAI Agents SDK |
| GitHub Action and CI | Implemented in repository configuration | Action consumer harness and 9-cell hosted matrix configuration |
| Package/release checks | Implemented locally | package consumer, checksums, manifest, release workflow |

## Deliberate boundaries

- The HTTP/SSE component is a transport and mutation primitive; stdio wrapping and JSONL are the complete end-to-end contract-verdict paths in `0.1.0`.
- The hosted service is local/self-hosted and single-token. It is not a multi-tenant SaaS, identity provider, or public trace platform.
- Normal child processes are not filesystem or network sandboxes.
- MCP annotations are untrusted claims. Only explicit observer policy determines whether they may be used.
- No model judge is used for blocking correctness.
- Capture preserves observed calls; it does not claim to reproduce a model’s internal decision policy.

## Automated verification

The required local release sequence is:

```bash
npm ci
npm run check
npm run action:check
npm run package:check
npm run acceptance
npm audit --omit=dev
```

`npm run check` covers type checking, formatting, Markdown links, workflow policy, release assets, adapter consumers, unit tests, integration tests, real-client tests, and domain/framework examples. Socket-dependent HTTP, UI, and hosted tests run in normal CI; they skip only when the execution environment explicitly refuses loopback sockets.

Final local pass on 2026-08-03:

- `npm run check`: passed; 147 tests discovered, 128 passed, 19 loopback-socket tests skipped because this sandbox returned `EPERM`, zero failures;
- `npm run acceptance`: passed, including Action consumer, package smoke, twelve-pack demo, passing/failing artifacts, and doctor;
- `npm run action:check`: passed for both green and intentionally failing consumer paths;
- `npm run package:check`: passed against a 169-file, approximately 206 KB tarball; compiled tests and TypeScript source were absent;
- `npm run test:downloader`: 10/10 end-to-end downloader journeys passed from unrelated temporary directories, covering first launch, demo, self-contained init, pass/fail reports, real-agent mode, MCP wrapping, guided capture, JSONL adapters, the Action consumer, and the packed artifact;
- clean registry installation fell back to offline tarball extraction because registry DNS is blocked in this environment;
- `npm audit --omit=dev` could not reach the npm audit endpoint and remains a required hosted release check.

## External gates before announcement

- Create the public Git repository and confirm the final owner/repository URL.
- Add `repository`, `homepage`, and `bugs` package metadata using that URL.
- Replace `COMMIT_SHA`/`REPLACE_WITH_COMMIT` examples with the first immutable public revision after the repository is pushed.
- Run the configured GitHub matrix and Action self-test on the public repository.
- Publish the npm package and verify `npx agent-crash-test@latest demo` from a clean machine.
- Complete independent README quickstarts on macOS, Linux, and Windows.
- Capture a real public-repository demo and verify release checksums.
- Enable private vulnerability reporting and choose the maintainer response route.

These are external-state requirements. They must not be represented as completed by local code.

The downloader pass found and fixed two portability defects before publication: default `init` now creates a runnable local fixture instead of referring to repository build output, and bundled `demo` resolves its fixture corpus from the installed package boundary rather than the caller's current directory. A dedicated Ubuntu/Node 22 CI job protects these ten journeys.
