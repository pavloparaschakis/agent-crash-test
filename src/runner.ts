import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  evaluateAssertions,
  evaluateEffectContracts,
  evaluateStateContract,
} from "./assertions.js";
import { FixtureClient } from "./fixture-client.js";
import { McpStdioClient } from "./mcp-client.js";
import { classifyMcpError } from "./errors.js";
import { getPath, jsonEqual } from "./json-path.js";
import { loadFixture, resolveFromPack, stateContractEffectId } from "./pack.js";
import { MutationController } from "./mutations.js";
import { runJsonSnapshot } from "./observer.js";
import { hashJson } from "./stable.js";
import {
  MUTATION_ENGINE_VERSION,
  REPORT_SCHEMA_VERSION,
  type CallError,
  type CallEvent,
  type CallOutcome,
  type AdapterCapabilities,
  type CrashTestClient,
  type CrashTestPack,
  type EffectProbe,
  type EffectValue,
  type Finding,
  type JsonObject,
  type JsonValue,
  type Mutation,
  type RunOptions,
  type RunResult,
  type ReproductionMetadata,
  type ToolManifest,
} from "./types.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RUN_MS = 60_000;
const DEFAULT_OBSERVER_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OBSERVER_OUTPUT_BYTES = 1_048_576;
const MAX_CLOSE_WAIT_MS = 2_000;

function createClient(
  pack: CrashTestPack,
  source: string,
  workingDirectory?: string,
): Promise<CrashTestClient> | CrashTestClient {
  const directory = path.dirname(source);
  if (pack.transport === "stdio")
    return new McpStdioClient(pack.server, directory);
  return loadFixture(
    resolveFromPack(source, pack.server.fixture!, workingDirectory),
  ).then((fixture) => new FixtureClient(fixture, pack.state?.initial));
}

function selectedMutations(
  pack: CrashTestPack,
  requested?: string[],
): Mutation[] {
  if (!requested || requested.length === 0) return pack.mutations ?? [];
  return (pack.mutations ?? []).filter(
    (mutation) =>
      requested.includes(mutation.type) || requested.includes(mutation.id),
  );
}

function callErrorFromThrown(
  error: unknown,
  fallback: CallError["kind"] = "internal",
): CallError {
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const classified = classifyMcpError(cause);
  if (classified.kind === "server_error" && fallback !== "internal")
    return { ...classified, kind: fallback };
  return classified;
}

function eventId(counter: { value: number }): string {
  counter.value += 1;
  return `event-${counter.value}`;
}

function reproductionCommand(source: string, options: RunOptions): string {
  if (options.reproductionCommand) return options.reproductionCommand;
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const relative =
    path.relative(workingDirectory, source) || path.basename(source);
  const mutationTypes = options.mutationTypes?.length
    ? ` --mutation-types ${quoteArg(options.mutationTypes.join(","))}`
    : "";
  const seed = options.seed === undefined ? "" : ` --seed ${options.seed}`;
  const requestTimeout =
    options.requestTimeoutMs === undefined
      ? ""
      : ` --request-timeout-ms ${options.requestTimeoutMs}`;
  const maxRun =
    options.maxRunMs === undefined ? "" : ` --max-run-ms ${options.maxRunMs}`;
  const failOn = options.failOn ? ` --fail-on ${options.failOn}` : "";
  const unsafe = options.allowUnsafeProbes ? " --allow-unsafe-probes" : "";
  return `cd ${quoteArg(workingDirectory)} && node dist/cli.js run ${quoteArg(relative)} --format terminal,json --output artifacts/agent-crash-test${failOn}${seed}${requestTimeout}${maxRun}${mutationTypes}${unsafe}`;
}

function quoteArg(value: string): string {
  const normalized =
    process.platform === "win32" ? value.replaceAll("\\", "/") : value;
  return `"${normalized.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => Promise<void>,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    if (timedOut && onTimeout) await onTimeout();
  }
}

export async function runPack(
  pack: CrashTestPack,
  options: RunOptions,
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const startedClock = Date.now();
  const runId = randomUUID();
  const requestTimeoutMs =
    options.requestTimeoutMs ??
    pack.execution?.request_timeout_ms ??
    DEFAULT_REQUEST_TIMEOUT_MS;
  const maxRunMs =
    options.maxRunMs ?? pack.execution?.max_run_ms ?? DEFAULT_MAX_RUN_MS;
  const allowUnsafeProbes =
    options.allowUnsafeProbes === true &&
    pack.execution?.allow_unsafe_probes === true;
  const failOn = options.failOn ?? "error";
  const source = path.resolve(options.source);
  const client = await createClient(pack, source, options.workingDirectory);
  const events: CallEvent[] = [];
  const captures = new Map<string, JsonValue | undefined>();
  const warnings: string[] = [];
  const selectedMutationList = selectedMutations(pack, options.mutationTypes);
  const hasExternalObserver = pack.effect_probes?.some(
    (probe) => probe.source !== "fixture_state",
  );
  const effectiveSeed =
    options.seed ??
    selectedMutationList.find((mutation) => mutation.seed !== undefined)?.seed;
  const command = reproductionCommand(source, {
    ...options,
    seed: effectiveSeed,
  });
  const reproduction: ReproductionMetadata = {
    command,
    workingDirectory: options.workingDirectory,
    packPath: source,
    mutationIds: selectedMutationList.map((mutation) => mutation.id),
    seed: effectiveSeed,
  };
  const controller = new MutationController(
    selectedMutationList,
    effectiveSeed,
  );
  const counter = { value: 0 };
  const probeCounter = { value: 0 };
  const probeEventId = (): string => {
    probeCounter.value += 1;
    return `probe-event-${probeCounter.value}`;
  };
  let manifest: ToolManifest[] = [];
  let initialFixtureState: JsonObject | undefined;
  const beforeProbeValues = new Map<string, EffectValue>();
  let executionError: CallError | undefined;
  let processClosed = false;
  let runExpired = false;
  let interrupted = false;
  let closing: Promise<void> | undefined;

  const closeClient = async (): Promise<void> => {
    if (processClosed) return;
    if (closing) return closing;
    closing = (async () => {
      try {
        await withTimeout(client.close(), MAX_CLOSE_WAIT_MS);
        processClosed = true;
      } catch (error) {
        warnings.push(
          `Unable to confirm target process cleanup: ${String(error)}`,
        );
      }
    })();
    return closing;
  };

  const onSignal = (): void => {
    interrupted = true;
    runExpired = true;
    void closeClient();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const deadlineReached = (): boolean => Date.now() - startedClock >= maxRunMs;

  const remainingRunMs = (): number =>
    Math.max(1, maxRunMs - (Date.now() - startedClock));

  const call = async (
    tool: string,
    args: JsonObject,
  ): Promise<{ outcome: CallOutcome; durationMs: number }> => {
    const timeoutMs = Math.min(requestTimeoutMs, remainingRunMs());
    const started = performance.now();
    try {
      const outcome = await withTimeout(
        client.callTool(tool, args, { requestTimeoutMs: timeoutMs }),
        timeoutMs,
        async () => {
          if (Date.now() - startedClock >= maxRunMs) {
            runExpired = true;
            await closeClient();
          }
        },
      );
      if (deadlineReached()) {
        runExpired = true;
        await closeClient();
      }
      return { outcome, durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      const typed = callErrorFromThrown(
        error,
        runExpired ? "timeout" : "transport_error",
      );
      return {
        outcome: {
          error: {
            ...typed,
            retryable: typed.retryable ?? typed.kind === "timeout",
          },
        },
        durationMs: Math.round(performance.now() - started),
      };
    }
  };

  const listTools = async (): Promise<ToolManifest[]> => {
    const timeoutMs = Math.min(requestTimeoutMs, remainingRunMs());
    const tools = await withTimeout(
      client.listTools({ requestTimeoutMs: timeoutMs }),
      timeoutMs,
      async () => {
        if (Date.now() - startedClock >= maxRunMs) {
          runExpired = true;
          await closeClient();
        }
      },
    );
    if (deadlineReached()) runExpired = true;
    return tools.sort((left, right) => left.name.localeCompare(right.name));
  };

  const appendEvent = (event: Omit<CallEvent, "sequence">): CallEvent => {
    const complete: CallEvent = { ...event, sequence: events.length + 1 };
    events.push(complete);
    return complete;
  };

  const makeEvent = (
    input: Omit<CallEvent, "sequence" | "redactionApplied">,
  ): CallEvent => ({ ...input, redactionApplied: true, sequence: 0 });

  try {
    try {
      await withTimeout(
        client.connect({ requestTimeoutMs }),
        Math.min(requestTimeoutMs, remainingRunMs()),
        async () => {
          if (Date.now() - startedClock >= maxRunMs) {
            runExpired = true;
            await closeClient();
          }
        },
      );
      manifest = await listTools();
      initialFixtureState =
        client.getFixtureStateSnapshot?.() ?? client.getFixtureState?.();
      for (const tool of manifest) {
        if (!tool.description)
          warnings.push(
            `Notice: tool ${tool.name} does not declare a description; discovery and tool selection may be ambiguous.`,
          );
        if (!tool.annotations || Object.keys(tool.annotations).length === 0)
          warnings.push(
            `Notice: tool ${tool.name} has no annotations. Annotation absence is not proof of unsafe behavior.`,
          );
      }
      for (const assertion of pack.assertions) {
        if (
          (assertion.severity === "error" ||
            assertion.severity === "blocker" ||
            assertion.severity === undefined) &&
          !assertion.remediation &&
          !pack.artifacts?.remediation
        )
          warnings.push(
            `Notice: blocking assertion ${assertion.id} has no remediation guidance.`,
          );
      }
      if (pack.transport === "stdio")
        warnings.push(
          "Host-network denial is not enforced in normal stdio mode. Use a documented external sandbox for an enforceable boundary.",
        );
      if (pack.server.env && Object.keys(pack.server.env).length > 0)
        warnings.push(
          "Explicit server environment overrides are passed to the target; values are not printed, and reproductions require the same environment setup.",
        );
      if (
        pack.effect_probes?.some(
          (probe) => probe.source === "tool" || probe.source === "json_command",
        )
      )
        warnings.push(
          "Tool effect-probe permissions rely on untrusted server annotations; readOnlyHint is not proof of behavior.",
        );
      if (pack.execution?.network === "external_sandbox_required")
        warnings.push(
          "This pack declares that an external sandbox is required; the runner does not enforce that boundary itself.",
        );
      const probePolicyError = validateProbePolicy(
        pack.effect_probes ?? [],
        manifest,
        allowUnsafeProbes,
      );
      if (probePolicyError) {
        executionError = probePolicyError;
        warnings.push(probePolicyError.message);
      }
      if (deadlineReached()) runExpired = true;
    } catch (error) {
      executionError = callErrorFromThrown(
        error,
        runExpired ? "timeout" : "initialization",
      );
      warnings.push(
        `Target execution stopped during ${executionError.kind}: ${executionError.message}`,
      );
    }

    if (!executionError && !runExpired && pack.effect_probes) {
      for (const probe of pack.effect_probes) {
        const observation = await observeProbe(
          probe,
          client,
          manifest,
          initialFixtureState,
          allowUnsafeProbes,
          call,
          appendEvent,
          probeEventId,
          warnings,
          remainingRunMs(),
          runExpired,
          path.dirname(source),
          pack.execution?.observer_timeout_ms ?? DEFAULT_OBSERVER_TIMEOUT_MS,
          pack.execution?.max_observer_output_bytes ??
            DEFAULT_MAX_OBSERVER_OUTPUT_BYTES,
        );
        beforeProbeValues.set(probe.id, observation.value);
        if (observation.expired) runExpired = true;
        if (
          !executionError &&
          observation.value.error &&
          isCallFailure(observation.value.error)
        ) {
          executionError = observation.value.error;
          warnings.push(
            `Target execution stopped during before-state observation ${probe.id}: ${observation.value.error.message}`,
          );
        }
        if (deadlineReached()) runExpired = true;
        if (runExpired || executionError) break;
      }
    }

    if (!executionError) {
      for (const step of pack.steps) {
        let attempt = 0;
        let previousAttemptEventId: string | undefined;
        const retry = step.retry ?? { max_attempts: 1 };
        let finalOutput: JsonValue | undefined;
        let finalCallError: CallError | undefined;
        while (attempt < retry.max_attempts) {
          if (runExpired || remainingRunMs() <= 0) {
            runExpired = true;
            finalOutput = undefined;
            break;
          }
          attempt += 1;
          const mutationList = controller.matching(step.call);
          const mainEventId = eventId(counter);
          const preflight = controller.preflight(mutationList, mainEventId);
          if (preflight) {
            const event = appendEvent(
              makeEvent({
                eventId: mainEventId,
                parentEventId: previousAttemptEventId,
                kind: attempt > 1 ? "retry" : "step",
                stepId: step.id,
                tool: step.call,
                arguments: step.arguments ?? {},
                attempt,
                error: preflight.outcome.error,
                commitStatus: preflight.outcome.commitStatus,
                responseStatus: preflight.outcome.responseStatus,
                mutationPhase: preflight.outcome.mutationPhase,
                mutationIds: mutationList.map((mutation) => mutation.id),
                mutationVersions: mutationList.map(
                  (mutation) => mutation.version ?? MUTATION_ENGINE_VERSION,
                ),
                durationMs: 0,
                physicalCall: false,
              }),
            );
            previousAttemptEventId = event.eventId;
            finalOutput = undefined;
            finalCallError = preflight.outcome.error;
            if (
              !isRetryable(preflight.outcome.error, retry.on) ||
              attempt >= retry.max_attempts
            )
              break;
            continue;
          }

          const physical = await call(step.call, step.arguments ?? {});
          const event = appendEvent(
            makeEvent({
              eventId: mainEventId,
              parentEventId: previousAttemptEventId,
              kind: attempt > 1 ? "retry" : "step",
              stepId: step.id,
              tool: step.call,
              arguments: step.arguments ?? {},
              attempt,
              output: physical.outcome.output,
              error: physical.outcome.error,
              underlyingOutput: physical.outcome.output,
              underlyingError: physical.outcome.error,
              commitStatus: physical.outcome.commitStatus,
              responseStatus: physical.outcome.responseStatus,
              mutationPhase: physical.outcome.mutationPhase,
              mutationIds: mutationList.map((mutation) => mutation.id),
              mutationVersions: mutationList.map(
                (mutation) => mutation.version ?? MUTATION_ENGINE_VERSION,
              ),
              durationMs: physical.durationMs,
              physicalCall: true,
            }),
          );

          let outcome: CallOutcome;
          if (
            physical.outcome.error &&
            isImmediateCallFailure(physical.outcome.error)
          ) {
            outcome = physical.outcome;
          } else if (runExpired || deadlineReached()) {
            runExpired = true;
            controller.markFailed(mutationList, mainEventId);
            outcome = {
              error: {
                kind: "timeout",
                message: `Run exceeded the configured maximum duration of ${maxRunMs}ms.`,
                retryable: false,
                source: "run-lifecycle",
              },
            };
          } else {
            try {
              outcome = await withTimeout(
                controller.after(
                  physical.outcome,
                  step.call,
                  mutationList,
                  mainEventId,
                  async (mutation: Mutation) => {
                    const duplicateEventId = eventId(counter);
                    const duplicate = await call(
                      step.call,
                      step.arguments ?? {},
                    );
                    appendEvent(
                      makeEvent({
                        eventId: duplicateEventId,
                        parentEventId: mainEventId,
                        kind: "duplicate",
                        stepId: step.id,
                        tool: step.call,
                        arguments: step.arguments ?? {},
                        attempt,
                        output: duplicate.outcome.output,
                        error: duplicate.outcome.error,
                        underlyingOutput: duplicate.outcome.output,
                        underlyingError: duplicate.outcome.error,
                        commitStatus: duplicate.outcome.commitStatus,
                        responseStatus: duplicate.outcome.responseStatus,
                        mutationPhase: duplicate.outcome.mutationPhase,
                        mutationIds: [mutation.id],
                        mutationVersions: [
                          mutation.version ?? MUTATION_ENGINE_VERSION,
                        ],
                        durationMs: duplicate.durationMs,
                        physicalCall: true,
                      }),
                    );
                    return duplicate.outcome;
                  },
                  step.arguments ?? {},
                  remainingRunMs(),
                ),
                remainingRunMs(),
                async () => {
                  runExpired = true;
                  await closeClient();
                },
              );
            } catch (error) {
              runExpired = true;
              controller.markFailed(mutationList, mainEventId);
              outcome = {
                error: callErrorFromThrown(error, "timeout"),
              };
            }
          }

          event.output = outcome.output;
          event.error = outcome.error;
          event.commitStatus = outcome.commitStatus;
          event.responseStatus = outcome.responseStatus;
          event.mutationPhase = outcome.mutationPhase;
          finalOutput = outcome.output;
          finalCallError = outcome.error;
          previousAttemptEventId = event.eventId;
          if (!outcome.error) break;
          if (
            !isRetryable(outcome.error, retry.on) ||
            attempt >= retry.max_attempts
          )
            break;
        }
        captures.set(step.id, finalOutput);
        if (step.capture) captures.set(step.capture, finalOutput);
        if (
          !executionError &&
          finalCallError &&
          isCallFailure(finalCallError)
        ) {
          executionError = finalCallError;
          warnings.push(
            `Target execution stopped during ${finalCallError.kind}: ${finalCallError.message}`,
          );
        }
        if (deadlineReached()) runExpired = true;
        if (runExpired || executionError) break;
      }
    }

    if (interrupted && !executionError) {
      executionError = {
        kind: "transport_error",
        message: "Run interrupted by the caller.",
        retryable: false,
        source: "signal",
      };
      warnings.push(executionError.message);
    }

    const effects: EffectValue[] = [];
    if (!executionError && !runExpired && pack.effect_probes) {
      for (const probe of pack.effect_probes) {
        const effect = await observeProbe(
          probe,
          client,
          manifest,
          initialFixtureState,
          allowUnsafeProbes,
          call,
          appendEvent,
          probeEventId,
          warnings,
          remainingRunMs(),
          runExpired,
          path.dirname(source),
          pack.execution?.observer_timeout_ms ?? DEFAULT_OBSERVER_TIMEOUT_MS,
          pack.execution?.max_observer_output_bytes ??
            DEFAULT_MAX_OBSERVER_OUTPUT_BYTES,
        );
        if (effect.expired) runExpired = true;
        const before = beforeProbeValues.get(probe.id);
        if (before) {
          effect.value.before = before.value;
          effect.value.after = effect.value.value;
          if (before.error && !effect.value.error) {
            effect.value.error = before.error;
            effect.value.observerStatus = "inconclusive";
          }
        }
        effects.push(effect.value);
        if (
          !executionError &&
          effect.value.error &&
          isCallFailure(effect.value.error)
        ) {
          executionError = effect.value.error;
          warnings.push(
            `Target execution stopped during ${effect.value.error.kind}: ${effect.value.error.message}`,
          );
        }
        if (deadlineReached()) runExpired = true;
        if (runExpired || executionError) break;
      }
    }

    if (!executionError && !runExpired && pack.state_contract) {
      const finalFixtureState =
        client.getFixtureStateSnapshot?.() ?? client.getFixtureState?.();
      if (initialFixtureState && finalFixtureState) {
        for (const { entry, forbidden, index } of [
          ...(pack.state_contract.effects ?? []).map((entry, index) => ({
            entry,
            forbidden: false,
            index,
          })),
          ...(pack.state_contract.forbidden ?? []).map((entry, index) => ({
            entry,
            forbidden: true,
            index,
          })),
        ]) {
          const id = stateContractEffectId(entry, forbidden, index);
          if (!effects.some((effect) => effect.id === id))
            effects.push({
              id,
              source: "fixture_state",
              path: entry.path,
              value: getPath(finalFixtureState, entry.path),
              before: getPath(initialFixtureState, entry.path),
              after: getPath(finalFixtureState, entry.path),
              expected: entry.expected,
              expectedDelta: entry.expected_delta,
              forbiddenChange: entry.forbidden_change,
              observed: getPath(finalFixtureState, entry.path),
              safety: "fixture",
            });
        }
      }
    }

    for (const [probeId, before] of beforeProbeValues) {
      if (!effects.some((effect) => effect.id === probeId))
        effects.push({ ...before });
    }

    if (deadlineReached()) runExpired = true;

    for (const effect of effects) finalizeObserverStatus(effect);

    if (!executionError && runExpired) {
      executionError = {
        kind: "timeout",
        message: `Run exceeded the configured maximum duration of ${maxRunMs}ms.`,
        retryable: false,
        source: "run-lifecycle",
      };
      warnings.push(executionError.message);
    }

    for (const assertion of pack.assertions) {
      const effect = assertion.effect
        ? effects.find((item) => item.id === assertion.effect)
        : undefined;
      if (!effect) continue;
      if (assertion.expected !== undefined)
        effect.expected = assertion.expected;
      if (assertion.forbidden_change !== undefined)
        effect.forbiddenChange = assertion.forbidden_change;
    }
    for (const contractEffect of [
      ...(pack.state_contract?.effects ?? []),
      ...(pack.state_contract?.forbidden ?? []),
    ]) {
      const effect =
        effects.find((item) => item.id === contractEffect.effect) ??
        effects.find(
          (item) =>
            !contractEffect.effect &&
            item.source === "fixture_state" &&
            item.path === contractEffect.path,
        );
      if (!effect) continue;
      if (contractEffect.expected !== undefined)
        effect.expected = contractEffect.expected;
      if (contractEffect.expected_delta !== undefined)
        effect.expectedDelta = contractEffect.expected_delta;
      if (contractEffect.forbidden_change !== undefined)
        effect.forbiddenChange = contractEffect.forbidden_change;
    }

    const assertions = executionError
      ? []
      : [
          ...evaluateAssertions(
            pack.assertions,
            events,
            effects,
            captures,
            manifest,
            {
              command: reproduction.command,
              source: reproduction.packPath,
              workingDirectory: reproduction.workingDirectory,
              mutationIds: reproduction.mutationIds,
              seed: reproduction.seed,
            },
          ),
          ...(pack.state_contract
            ? evaluateStateContract(pack.state_contract, effects, events, {
                command: reproduction.command,
                source: reproduction.packPath,
                workingDirectory: reproduction.workingDirectory,
                mutationIds: reproduction.mutationIds,
                seed: reproduction.seed,
              })
            : []),
          ...(pack.effect_contracts
            ? evaluateEffectContracts(pack.effect_contracts, effects, events, {
                command: reproduction.command,
                source: reproduction.packPath,
                workingDirectory: reproduction.workingDirectory,
                mutationIds: reproduction.mutationIds,
                seed: reproduction.seed,
              })
            : []),
        ];
    const findings = assertions.flatMap((result) =>
      result.finding ? [result.finding] : [],
    );
    for (const finding of findings) {
      if (finding.category === "extra_transition" && finding.effectId) {
        const effect = effects.find((item) => item.id === finding.effectId);
        if (effect) effect.observerStatus = "forbidden";
      }
    }
    attachFindingFingerprints(findings, pack, selectedMutationList);
    const mutationRecords = controller.recordsForReport();
    for (const mutation of mutationRecords) {
      if (
        mutation.result === "failed" &&
        mutation.type === "stale_result" &&
        mutation.parameters.reason ===
          "not_applicable_no_prior_success_for_context"
      )
        warnings.push(
          `Mutation ${mutation.id} was not applicable: no prior successful response existed for the same tool/request context; the current response was retained.`,
        );
    }
    const serverManifestSha256 = manifest.length
      ? hashJson(manifest as unknown as JsonValue)
      : undefined;
    const completedAt = new Date().toISOString();
    await closeClient();
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      identity: {
        runId,
        startedAt,
        completedAt,
        runnerVersion: "0.1.0",
        reportSchemaVersion: REPORT_SCHEMA_VERSION,
        packSchemaVersion: pack.version,
        packId: pack.id,
        packSource: source,
        packSha256: hashJson(pack as unknown as JsonValue),
        serverManifestSha256,
        mutationSeed: effectiveSeed,
        platform: {
          os: process.platform,
          arch: process.arch,
          node: process.version,
        },
        determinism:
          pack.transport === "fixture" && !hasExternalObserver
            ? "deterministic"
            : "partial",
      },
      pack: { id: pack.id, name: pack.name, source },
      transport: pack.transport,
      adapter: adapterCapabilities(
        pack.transport,
        hasExternalObserver === true,
      ),
      server: {
        command: pack.server.command,
        args: pack.server.args,
        cwd: pack.server.cwd,
        fixture: pack.server.fixture,
        toolCount: manifest.length,
      },
      manifest,
      mutations: mutationRecords,
      events,
      effects,
      assertions,
      findings,
      reproduction,
      executionWarnings: warnings,
      executionError,
      policy: {
        failOn,
        networkBoundary: pack.execution?.network ?? "not_enforced",
        credentialPolicy: "minimal_environment",
        processClosed,
      },
    };
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await closeClient();
  }
}

function adapterCapabilities(
  transport: CrashTestPack["transport"],
  hasExternalObserver = false,
): AdapterCapabilities {
  if (transport === "fixture")
    return {
      id: "fixture",
      version: "1",
      protocol: "mcp-compatible",
      transport: "fixture",
      realClient: false,
      physicalInterception: false,
      responseMutation: true,
      transportDisconnect: false,
      stateObservation: true,
      determinism: hasExternalObserver ? "partial" : "deterministic",
      sandboxRequired: false,
      limitations: [
        "Fixture mode does not exercise an external client or real process lifecycle.",
        ...(hasExternalObserver
          ? [
              "External effect probes can introduce nondeterminism and are not part of fixture-state determinism.",
            ]
          : []),
      ],
    };
  return {
    id: "mcp-stdio-scripted",
    version: "1",
    protocol: "mcp",
    transport: "stdio",
    realClient: false,
    physicalInterception: false,
    responseMutation: true,
    transportDisconnect: true,
    stateObservation: true,
    determinism: "partial",
    sandboxRequired: false,
    limitations: [
      "Scripted stdio mode invokes declared steps; it does not exercise an arbitrary client policy.",
      "Host-network denial requires an external sandbox.",
    ],
  };
}

function isRetryable(
  error: CallError | undefined,
  configured?: readonly string[],
): boolean {
  if (!error) return false;
  const retryOn = configured ?? ["timeout", "retryable_error", "rate_limit"];
  return retryOn.includes(error.kind);
}

function finalizeObserverStatus(effect: EffectValue): void {
  if (effect.error) {
    effect.observerStatus = "inconclusive";
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(effect, "before")) return;
  if (!Object.prototype.hasOwnProperty.call(effect, "after")) {
    effect.observerStatus = "inconclusive";
    return;
  }
  if (effect.before === undefined && effect.after === undefined) {
    effect.observerStatus = "absent";
    return;
  }
  effect.observerStatus = jsonEqual(effect.before, effect.after)
    ? "present"
    : "changed";
}

function attachFindingFingerprints(
  findings: Finding[],
  pack: CrashTestPack,
  mutations: Mutation[],
): void {
  const mutationInputs = mutations
    .map(
      (mutation) =>
        `${mutation.id}@${mutation.version ?? MUTATION_ENGINE_VERSION}:${mutation.type}`,
    )
    .sort();
  for (const finding of findings) {
    const inputs = [
      `pack:${pack.id}`,
      `assertion:${finding.id}`,
      `category:${finding.category ?? "assertion_failure"}`,
      `effect:${finding.effectId ?? ""}`,
      `divergence:${finding.firstDivergentEventId ?? ""}`,
      `expected:${JSON.stringify(finding.expected ?? null)}`,
      `observed:${JSON.stringify(finding.observed ?? null)}`,
      ...mutationInputs,
    ];
    finding.fingerprint = {
      algorithm: "sha256",
      value: hashJson({
        packId: pack.id,
        assertionId: finding.id,
        category: finding.category ?? "assertion_failure",
        effectId: finding.effectId ?? null,
        firstDivergentEventId: finding.firstDivergentEventId ?? null,
        expected: finding.expected ?? null,
        observed: finding.observed ?? null,
        mutations: mutationInputs,
      }),
      inputs,
    };
  }
}

function isImmediateCallFailure(error: CallError): boolean {
  return [
    "configuration",
    "spawn",
    "initialization",
    "protocol",
    "transport_error",
    "internal",
  ].includes(error.kind);
}

function isCallFailure(error: CallError): boolean {
  return isImmediateCallFailure(error) || error.kind === "timeout";
}

function validateProbePolicy(
  probes: EffectProbe[],
  manifest: ToolManifest[],
  allowUnsafe: boolean,
): CallError | undefined {
  for (const probe of probes) {
    if (probe.source === "fixture_state") continue;
    if (probe.source === "json_command") {
      if (probe.safety !== "explicit_unsafe_opt_in" || !allowUnsafe)
        return {
          kind: "configuration",
          message: `JSON snapshot effect probe ${probe.id} requires explicit unsafe opt-in.`,
          source: "probe-policy",
          retryable: false,
        };
      continue;
    }
    const tool = manifest.find((item) => item.name === probe.tool);
    if (!tool)
      return {
        kind: "configuration",
        message: `Effect probe ${probe.id} references unavailable tool ${probe.tool}.`,
        source: "probe-policy",
        retryable: false,
      };
    const declaredReadOnly = tool.annotations?.readOnlyHint === true;
    const unsafeAllowed =
      probe.safety === "explicit_unsafe_opt_in" && allowUnsafe;
    if (!declaredReadOnly && !unsafeAllowed)
      return {
        kind: "configuration",
        message: `Effect probe ${probe.id} requires readOnlyHint: true or explicit unsafe opt-in.`,
        source: "probe-policy",
        retryable: false,
      };
  }
  return undefined;
}

interface ProbeObservation {
  value: EffectValue;
  expired: boolean;
}

async function observeProbe(
  probe: EffectProbe,
  client: CrashTestClient,
  manifest: ToolManifest[],
  initialFixtureState: JsonObject | undefined,
  allowUnsafe: boolean,
  call: (
    tool: string,
    args: JsonObject,
  ) => Promise<{ outcome: CallOutcome; durationMs: number }>,
  appendEvent: (event: Omit<CallEvent, "sequence">) => CallEvent,
  allocateEventId: () => string,
  warnings: string[],
  remainingMs: number,
  runExpired: boolean,
  packDirectory: string,
  observerTimeoutMs: number,
  maxObserverOutputBytes: number,
): Promise<ProbeObservation> {
  const safety =
    probe.source === "fixture_state"
      ? "fixture"
      : (probe.safety ?? "declared_read_only");
  if (probe.source === "fixture_state") {
    const state =
      client.getFixtureStateSnapshot?.() ?? client.getFixtureState?.();
    const observed = getPath(state, probe.path);
    const probeEventId = allocateEventId();
    appendEvent({
      eventId: probeEventId,
      kind: "effect_probe",
      tool: "<fixture_state>",
      arguments: { path: probe.path },
      attempt: 1,
      output: observed,
      underlyingOutput: observed,
      mutationIds: [],
      durationMs: 0,
      physicalCall: false,
      redactionApplied: true,
    });
    return {
      value: {
        id: probe.id,
        source: probe.source,
        path: probe.path,
        value: observed,
        observed,
        before: getPath(initialFixtureState, probe.path),
        after: observed,
        observerStatus: observed === undefined ? "absent" : "present",
        probeEventId,
        safety,
      },
      expired: runExpired,
    };
  }

  if (probe.source === "json_command") {
    if (safety !== "explicit_unsafe_opt_in" || !allowUnsafe) {
      const eventId = allocateEventId();
      const error: CallError = {
        kind: "configuration",
        message: `JSON snapshot effect probe ${probe.id} requires explicit unsafe opt-in.`,
        source: "probe-policy",
      };
      appendEvent({
        eventId,
        kind: "effect_probe",
        tool: "<json_command>",
        arguments: { command: probe.command ?? "<missing>" },
        attempt: 1,
        error,
        mutationIds: [],
        durationMs: 0,
        physicalCall: false,
        redactionApplied: true,
      });
      warnings.push(error.message);
      return {
        value: {
          id: probe.id,
          source: probe.source,
          path: probe.path,
          value: undefined,
          observed: undefined,
          error,
          observerStatus: "inconclusive",
          safety,
        },
        expired: false,
      };
    }
    warnings.push(
      `Effect probe ${probe.id} executes an explicitly unsafe local snapshot command.`,
    );
    const eventId = allocateEventId();
    const result = await runJsonSnapshot(probe, {
      packDirectory,
      timeoutMs: Math.min(observerTimeoutMs, Math.max(1, remainingMs)),
      maxOutputBytes: maxObserverOutputBytes,
    });
    const observed =
      result.value === undefined
        ? undefined
        : getPath(result.value, probe.path);
    appendEvent({
      eventId,
      kind: "effect_probe",
      tool: "<json_command>",
      arguments: { command: probe.command ?? "<missing>", path: probe.path },
      attempt: 1,
      output: result.value,
      error: result.error,
      underlyingOutput: result.value,
      underlyingError: result.error,
      mutationIds: [],
      durationMs: result.durationMs,
      physicalCall: false,
      redactionApplied: true,
    });
    if (result.error)
      warnings.push(`Effect probe ${probe.id}: ${result.error.message}`);
    else if (observed === undefined)
      warnings.push(
        `Notice: effect probe ${probe.id} path ${probe.path} resolved to undefined.`,
      );
    return {
      value: {
        id: probe.id,
        source: probe.source,
        path: probe.path,
        value: observed,
        observed,
        error: result.error,
        observerStatus: result.error
          ? "inconclusive"
          : observed === undefined
            ? "absent"
            : "present",
        probeEventId: eventId,
        safety,
      },
      expired: result.timedOut || remainingMs <= 0,
    };
  }

  const tool = manifest.find((item) => item.name === probe.tool);
  const declaredReadOnly = tool?.annotations?.readOnlyHint === true;
  const unsafeAllowed = safety === "explicit_unsafe_opt_in" && allowUnsafe;
  if (!tool || (!declaredReadOnly && !unsafeAllowed)) {
    const eventId = allocateEventId();
    const error: CallError = {
      kind: "configuration",
      message: !tool
        ? `Effect probe ${probe.id} references unavailable tool ${probe.tool}.`
        : `Effect probe ${probe.id} requires readOnlyHint: true or explicit unsafe opt-in.`,
      source: "probe-policy",
    };
    appendEvent({
      eventId,
      kind: "effect_probe",
      tool: probe.tool ?? "<missing>",
      arguments: probe.arguments ?? {},
      attempt: 1,
      error,
      mutationIds: [],
      durationMs: 0,
      physicalCall: false,
      redactionApplied: true,
    });
    warnings.push(error.message);
    return {
      value: {
        id: probe.id,
        source: probe.source,
        tool: probe.tool,
        path: probe.path,
        value: undefined,
        observed: undefined,
        error,
        observerStatus: "inconclusive",
        safety,
      },
      expired: false,
    };
  }
  if (unsafeAllowed)
    warnings.push(
      `Effect probe ${probe.id} is explicitly unsafe and may mutate the target.`,
    );
  const eventId = allocateEventId();
  const result = await call(probe.tool!, probe.arguments ?? {});
  appendEvent({
    eventId,
    kind: "effect_probe",
    tool: probe.tool!,
    arguments: probe.arguments ?? {},
    attempt: 1,
    output: result.outcome.output,
    error: result.outcome.error,
    underlyingOutput: result.outcome.output,
    underlyingError: result.outcome.error,
    commitStatus: result.outcome.commitStatus,
    responseStatus: result.outcome.responseStatus,
    mutationPhase: result.outcome.mutationPhase,
    mutationIds: [],
    durationMs: result.durationMs,
    physicalCall: true,
    redactionApplied: true,
  });
  const observed = getPath(result.outcome.output, probe.path);
  if (observed === undefined)
    warnings.push(
      `Notice: effect probe ${probe.id} path ${probe.path} resolved to undefined.`,
    );
  return {
    value: {
      id: probe.id,
      source: probe.source,
      tool: probe.tool,
      path: probe.path,
      value: observed,
      observed,
      error: result.outcome.error,
      observerStatus: result.outcome.error
        ? "inconclusive"
        : observed === undefined
          ? "absent"
          : "present",
      probeEventId: eventId,
      safety,
    },
    expired: result.outcome.error?.kind === "timeout" && remainingMs <= 0,
  };
}
