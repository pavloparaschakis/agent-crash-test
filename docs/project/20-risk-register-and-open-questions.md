# Risk Register and Open Questions

## Risks

### R1: The category becomes crowded

**Impact:** High. MCPReplay, mcptest, AgentCheck, DynamicMCPBench, MCP Inspector, and security scanners already cover substantial parts of the workflow.

**Mitigation:** Accept that the core reproduce/intervene loop is not unique. Make the test pack—not the runner—the core asset; complement existing record/replay and agent-test tools through adapters rather than compete feature-for-feature. Avoid generic scorecard language.

### R2: The project is too close to AgentCheck

**Impact:** High. The July 2026 AgentCheck research project describes a very similar MCP reproduce/intervene/mitigate workbench.

**Mitigation:** Do not claim novelty of response perturbation or the general loop. Position the project as the buildable, open-source maintainer toolkit: local-first, deterministic, fixture-based, state-aware, GitHub-native, and extensible by community mutation packs. Cite the adjacent work honestly.

### R3: Tests are flaky or not meaningful

**Impact:** High.

**Mitigation:** Deterministic seeds, fixture transport, minimal demo server, explicit invariant semantics, and a flaky-test quarantine policy.

### R4: The tool accidentally causes real side effects

**Impact:** Critical.

**Mitigation:** Fixture-backed defaults, side-effect classification, explicit opt-in, and sandboxed examples. Only claim enforced network denial when the documented sandbox mode is actually active.

### R5: Reports overstate security findings

**Impact:** High.

**Mitigation:** Evidence-first language, severity definitions, no certification claims, and security review of rule wording.

### R6: Cross-platform support consumes the project

**Impact:** Medium.

**Mitigation:** Keep protocol core platform-neutral, use platform-specific smoke tests, and clearly document unsupported edge cases.

### R7: The project requires too much setup

**Impact:** High.

**Mitigation:** No-key demo, bundled broken server, one-command quickstart, and prebuilt release artifacts.

### R8: Star goal becomes a vanity distraction

**Impact:** Medium.

**Mitigation:** Track active repositories, repeat runs, fixture contributions, and actionable findings as primary metrics.

### R9: Maintainers resist public failure reports

**Impact:** Medium.

**Mitigation:** Make reports local-first and opt-in for publication. Frame findings as fixable tests, not reputational scores.

## Open questions

### Blocking before implementation

- Which package name and GitHub organization will own the project?
- TypeScript/Node.js is the first implementation language, using MCP 2025-06-18 and the stable v1.x SDK surface. Re-evaluate after the v2 SDK stabilizes.
- Which license best fits the intended community and commercial use?
- Will the first release use a monorepo or a single package?

### Resolve during MVP

- How should unknown side-effect classifications behave?
- Which assertions can be deterministic without an LLM?
- Which declared read-only MCP effect probe should be the first documented custom integration pattern?

### Future product questions

- Should a hosted public compatibility index exist?
- How should server maintainers opt into public results?
- Can test attestations be signed without creating certification theater?
- Which client adapters provide the most value after MCP?
- How should model-in-the-loop results be compared without misleading rankings?
- Should recording use a transparent proxy or process wrapper first?
- What is the minimum safe local Streamable HTTP support?
