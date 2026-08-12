import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { splitCommandLine } from "./command-line.js";
import type {
  CrashTestPack,
  FixtureDefinition,
  JsonObject,
  StateContractEffect,
} from "./types.js";

const jsonValue: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
const jsonObject = z.record(z.string(), jsonValue) as z.ZodType<JsonObject>;

const mutationSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "timeout",
      "retryable_error",
      "malformed_result",
      "stale_result",
      "duplicate_call",
      "permission_denied",
      "commit_then_response_lost",
      "disconnect_after_commit",
      "partial_success",
      "stale_read_then_conflicting_write",
      "rate_limit",
      "schema_drift",
      "truncated_response",
      "out_of_order_response",
      "corrupted_pagination_cursor",
      "slow_stream",
      "progress_stall",
    ]),
    version: z.string().min(1).optional(),
    phase: z
      .enum([
        "before_underlying_call",
        "during_underlying_call",
        "after_commit_before_response",
        "after_response_before_client",
        "client_visible_transport_failure",
        "observer_only",
      ])
      .optional(),
    applies_to: z.string().min(1).optional(),
    occurrence: z.number().int().positive().optional(),
    duration_ms: z.number().int().nonnegative().optional(),
    seed: z.number().int().optional(),
    commit_status: z
      .enum(["not_attempted", "not_committed", "committed", "unknown"])
      .optional(),
    response_status: z
      .enum(["not_returned", "returned", "corrupted", "lost"])
      .optional(),
    retry_after_ms: z.number().int().nonnegative().optional(),
    remove_path: z.string().min(1).optional(),
    truncate_after_bytes: z.number().int().nonnegative().optional(),
    cursor_path: z.string().min(1).optional(),
    replacement: jsonValue.optional(),
  })
  .strict();

const assertionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "effect_equals",
      "effect_not_equals",
      "must_not_call",
      "call_count",
      "result_path_equals",
      "annotation_matches",
      "state_path_equals",
      "no_extra_transition",
    ]),
    effect: z.string().optional(),
    path: z.string().optional(),
    expected: jsonValue.optional(),
    tool: z.string().optional(),
    max: z.number().int().nonnegative().optional(),
    exactly: z.number().int().nonnegative().optional(),
    at_most: z.number().int().nonnegative().optional(),
    step: z.string().optional(),
    annotation: z.string().optional(),
    forbidden_change: z.enum(["any", "increase", "decrease"]).optional(),
    remediation: z.string().optional(),
    why_it_matters: z.string().optional(),
    severity: z
      .enum(["blocker", "error", "warning", "notice", "info"])
      .optional(),
  })
  .strict();

const effectExpectationSchema = z
  .object({
    effect: z.string().min(1),
    path: z.string().min(1).optional(),
    expected: jsonValue.optional(),
    forbidden_change: z.enum(["any", "increase", "decrease"]).optional(),
    description: z.string().optional(),
  })
  .strict();

const effectContractSchema = z
  .object({
    id: z.string().min(1),
    class: z.enum([
      "read",
      "create",
      "update",
      "delete",
      "send",
      "approve",
      "deploy",
      "publish",
    ]),
    description: z.string().min(1),
    tool: z.string().min(1).optional(),
    preconditions: z.array(effectExpectationSchema).optional(),
    intended: z.array(effectExpectationSchema).min(1),
    forbidden: z.array(effectExpectationSchema).optional(),
    cardinality: z
      .enum(["zero_or_one", "at_most_once", "exactly_once", "at_least_once"])
      .optional(),
    ordering: z
      .array(
        z
          .object({
            before: z.string().min(1),
            after: z.string().min(1),
            description: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    authorization: z
      .object({
        argument: z.string().min(1).optional(),
        expected: jsonValue.optional(),
      })
      .strict()
      .optional(),
    recovery: z
      .object({
        uncertain_outcome: z
          .enum([
            "query_before_retry",
            "do_not_retry",
            "retry_with_same_key",
            "compensate",
          ])
          .optional(),
        query_tool: z.string().min(1).optional(),
        max_attempts: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    severity: z
      .enum(["blocker", "error", "warning", "notice", "info"])
      .optional(),
    remediation: z.string().optional(),
  })
  .strict();

const packSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9/_-]*$/),
    name: z.string().min(1),
    description: z.string().optional(),
    protocol: z.literal("mcp"),
    transport: z.enum(["stdio", "fixture"]),
    server: z
      .object({
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        cwd: z.string().optional(),
        env: z.record(z.string(), z.string()).optional(),
        fixture: z.string().optional(),
      })
      .strict(),
    execution: z
      .object({
        request_timeout_ms: z.number().int().positive().optional(),
        max_run_ms: z.number().int().positive().optional(),
        observer_timeout_ms: z.number().int().positive().optional(),
        max_observer_output_bytes: z.number().int().positive().optional(),
        network: z
          .enum(["not_enforced", "external_sandbox_required"])
          .optional(),
        inherit_env: z.literal(false).optional(),
        allow_unsafe_probes: z.boolean().optional(),
      })
      .strict()
      .optional(),
    tags: z.array(z.string()).optional(),
    state: z
      .object({
        initial: jsonObject.optional(),
        source: z.literal("fixture").optional(),
      })
      .strict()
      .optional(),
    state_contract: z
      .object({
        effects: z
          .array(
            z
              .object({
                path: z.string().min(1),
                effect: z.string().optional(),
                expected: jsonValue.optional(),
                expected_delta: z.number().optional(),
                forbidden_change: z
                  .enum(["any", "increase", "decrease"])
                  .optional(),
                description: z.string().optional(),
              })
              .strict(),
          )
          .optional(),
        forbidden: z
          .array(
            z
              .object({
                path: z.string().min(1),
                effect: z.string().optional(),
                expected: jsonValue.optional(),
                expected_delta: z.number().optional(),
                forbidden_change: z
                  .enum(["any", "increase", "decrease"])
                  .optional(),
                description: z.string().optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    effect_contracts: z.array(effectContractSchema).optional(),
    effect_probes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            source: z.enum(["fixture_state", "tool", "json_command"]),
            path: z.string().min(1),
            tool: z.string().optional(),
            command: z.string().optional(),
            args: z.array(z.string()).optional(),
            cwd: z.string().optional(),
            env: z.record(z.string(), z.string()).optional(),
            arguments: jsonObject.optional(),
            description: z.string().optional(),
            safety: z
              .enum(["fixture", "declared_read_only", "explicit_unsafe_opt_in"])
              .optional(),
          })
          .strict(),
      )
      .optional(),
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1),
            call: z.string().min(1),
            arguments: jsonObject.optional(),
            retry: z
              .object({
                max_attempts: z.number().int().min(1),
                on: z
                  .array(
                    z.enum([
                      "timeout",
                      "retryable_error",
                      "rate_limit",
                      "permission_denied",
                      "transport_error",
                    ]),
                  )
                  .optional(),
              })
              .strict()
              .optional(),
            capture: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(0),
    mutations: z.array(mutationSchema).optional(),
    assertions: z.array(assertionSchema).min(1),
    artifacts: z
      .object({ remediation: z.string().optional() })
      .strict()
      .optional(),
  })
  .strict();

const fixtureSchema = z
  .object({
    initial_state: jsonObject.optional(),
    tools: z.record(
      z.string(),
      z
        .object({
          description: z.string().optional(),
          input_schema: jsonObject.optional(),
          output_schema: jsonObject.optional(),
          annotations: z
            .record(z.string(), z.union([z.boolean(), z.string()]))
            .optional(),
          result: z.union([jsonValue, z.literal("$state")]).optional(),
          effects: z
            .array(
              z
                .object({
                  op: z.enum(["append", "set", "increment"]),
                  path: z.string().min(1),
                  value: jsonValue.optional(),
                })
                .strict(),
            )
            .optional(),
          error: z
            .object({
              kind: z.enum(["retryable_error", "permission_denied"]),
              message: z.string().min(1),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();

export async function loadPack(
  filePath: string,
): Promise<{ pack: CrashTestPack; source: string }> {
  const parsed = await readYaml(filePath, "pack");
  if (looksLikeFixtureDefinition(parsed))
    throw new Error(
      `Invalid pack ${filePath}: fixture-only YAML was supplied where a pack was expected; reference it from server.fixture or run a pack file instead`,
    );
  const result = packSchema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      `Invalid pack ${filePath}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  const pack = result.data as unknown as CrashTestPack;
  validatePackSemantics(pack, filePath);
  return { pack, source: filePath };
}

export async function loadFixture(
  filePath: string,
): Promise<FixtureDefinition> {
  const result = fixtureSchema.safeParse(await readYaml(filePath, "fixture"));
  if (!result.success)
    throw new Error(
      `Invalid fixture ${filePath}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  return result.data as unknown as FixtureDefinition;
}

export function validatePackSemantics(
  pack: CrashTestPack,
  source = "pack",
): void {
  assertUniqueIds(
    pack.steps.map((step) => step.id),
    "step",
    source,
  );
  assertUniqueIds(
    (pack.mutations ?? []).map((mutation) => mutation.id),
    "mutation",
    source,
  );
  assertUniqueIds(
    pack.assertions.map((assertion) => assertion.id),
    "assertion",
    source,
  );
  assertUniqueIds(
    (pack.effect_probes ?? []).map((probe) => probe.id),
    "effect probe",
    source,
  );
  assertUniqueIds(
    (pack.effect_contracts ?? []).map((contract) => contract.id),
    "effect contract",
    source,
  );
  const contractEntries = [
    ...(pack.state_contract?.effects ?? []).map((entry, index) => ({
      entry,
      forbidden: false,
      index,
    })),
    ...(pack.state_contract?.forbidden ?? []).map((entry, index) => ({
      entry,
      forbidden: true,
      index,
    })),
  ];
  const contractIds = contractEntries.map(({ entry, forbidden, index }) =>
    stateContractEffectId(entry, forbidden, index),
  );
  assertUniqueIds(contractIds, "state contract effect", source);
  assertUniqueIds(
    contractEntries.map(({ entry }) => `path:${entry.path}`),
    "state contract path",
    source,
  );
  assertUniqueIds(
    [...(pack.effect_probes ?? []).map((probe) => probe.id), ...contractIds],
    "effect",
    source,
  );
  const availableEffectIds = new Set([
    ...(pack.effect_probes ?? []).map((probe) => probe.id),
    ...contractIds,
  ]);
  for (const contract of pack.effect_contracts ?? []) {
    const generatedAssertionIds = [
      ...(contract.preconditions ?? []).map(
        (_, index) => `${contract.id}-precondition-${index + 1}`,
      ),
      ...contract.intended.map(
        (_, index) => `${contract.id}-intended-${index + 1}`,
      ),
      ...(contract.forbidden ?? []).map(
        (_, index) => `${contract.id}-forbidden-${index + 1}`,
      ),
      ...(contract.cardinality ? [`${contract.id}-cardinality`] : []),
      ...(contract.ordering ?? []).map(
        (_, index) => `${contract.id}-ordering-${index + 1}`,
      ),
      ...(contract.authorization?.argument
        ? [`${contract.id}-authorization`]
        : []),
      ...(contract.recovery ? [`${contract.id}-recovery`] : []),
    ];
    for (const generatedId of generatedAssertionIds)
      if (pack.assertions.some((assertion) => assertion.id === generatedId))
        throw new Error(
          `${source}: generated effect contract assertion id ${generatedId} collides with an explicit assertion`,
        );
    if (contract.cardinality && !contract.tool)
      throw new Error(
        `${source}: effect contract ${contract.id} cardinality requires tool`,
      );
    if (
      contract.recovery?.uncertain_outcome === "query_before_retry" &&
      !contract.recovery.query_tool
    )
      throw new Error(
        `${source}: effect contract ${contract.id} query_before_retry recovery requires query_tool`,
      );
    if (contract.authorization && !contract.tool)
      throw new Error(
        `${source}: effect contract ${contract.id} authorization requires tool`,
      );
    if (contract.recovery && !contract.tool)
      throw new Error(
        `${source}: effect contract ${contract.id} recovery requires tool`,
      );
    const expectations = [
      ...(contract.preconditions ?? []),
      ...contract.intended,
      ...(contract.forbidden ?? []),
    ];
    for (const expectation of expectations) {
      if (!availableEffectIds.has(expectation.effect))
        throw new Error(
          `${source}: effect contract ${contract.id} references unknown effect ${expectation.effect}`,
        );
      if (
        expectation.expected === undefined &&
        expectation.forbidden_change === undefined
      )
        throw new Error(
          `${source}: effect contract ${contract.id} expectation ${expectation.effect} requires expected or forbidden_change`,
        );
    }
  }
  if (pack.transport === "stdio" && !pack.server.command)
    throw new Error(`${source}: stdio packs require server.command`);
  if (pack.transport === "fixture" && !pack.server.fixture)
    throw new Error(`${source}: fixture packs require server.fixture`);
  if (
    pack.transport === "fixture" &&
    pack.server.fixture &&
    isAbsolutePath(pack.server.fixture)
  )
    throw new Error(
      `${source}: absolute fixture paths are not allowed by default`,
    );
  if (pack.state_contract && pack.transport !== "fixture")
    throw new Error(
      `${source}: state_contract requires transport: fixture so before/after state is observable`,
    );
  if (
    pack.effect_probes?.some((probe) => probe.source === "tool" && !probe.tool)
  )
    throw new Error(`${source}: tool effect probes require tool`);
  if (
    pack.effect_probes?.some(
      (probe) => probe.source === "json_command" && !probe.command,
    )
  )
    throw new Error(`${source}: json_command effect probes require command`);
  if (
    pack.effect_probes?.some(
      (probe) =>
        probe.source !== "json_command" &&
        (probe.command !== undefined ||
          probe.args !== undefined ||
          probe.cwd !== undefined ||
          probe.env !== undefined),
    )
  )
    throw new Error(
      `${source}: command, args, cwd, and env are only valid for json_command effect probes`,
    );
  if (
    pack.effect_probes?.some(
      (probe) =>
        probe.source === "fixture_state" && pack.transport !== "fixture",
    )
  )
    throw new Error(
      `${source}: fixture_state effect probes require transport: fixture`,
    );
  if (
    pack.effect_probes?.some(
      (probe) =>
        (probe.source === "fixture_state" &&
          probe.safety !== undefined &&
          probe.safety !== "fixture") ||
        (probe.source === "tool" && probe.safety === "fixture") ||
        (probe.source === "json_command" &&
          probe.safety !== "explicit_unsafe_opt_in"),
    )
  )
    throw new Error(
      `${source}: effect probe safety must match its source (fixture for fixture_state; declared_read_only or explicit_unsafe_opt_in for tool; explicit_unsafe_opt_in for json_command)`,
    );
  if (
    pack.assertions.some(
      (assertion) =>
        [
          "effect_equals",
          "effect_not_equals",
          "state_path_equals",
          "no_extra_transition",
        ].includes(assertion.type) && !assertion.effect,
    )
  )
    throw new Error(`${source}: effect/state assertions require effect`);
  if (
    pack.assertions.some((assertion) =>
      [
        "effect_equals",
        "effect_not_equals",
        "state_path_equals",
        "no_extra_transition",
      ].includes(assertion.type),
    ) &&
    !pack.effect_probes?.length &&
    !pack.state_contract
  )
    throw new Error(
      `${source}: effect/state assertions require an effect_probes or state_contract source`,
    );
  if (
    pack.assertions.some(
      (assertion) =>
        assertion.type === "result_path_equals" &&
        (!assertion.step || !assertion.path),
    )
  )
    throw new Error(`${source}: result_path_equals requires step and path`);
  if (
    pack.assertions.some(
      (assertion) =>
        [
          "effect_equals",
          "effect_not_equals",
          "state_path_equals",
          "result_path_equals",
          "annotation_matches",
        ].includes(assertion.type) && assertion.expected === undefined,
    )
  )
    throw new Error(
      `${source}: effect, result, and annotation equality assertions require expected`,
    );
  if (
    pack.assertions.some(
      (assertion) =>
        assertion.type === "annotation_matches" &&
        (!assertion.tool || !assertion.annotation),
    )
  )
    throw new Error(
      `${source}: annotation_matches requires tool and annotation`,
    );
  if (
    pack.assertions.some(
      (assertion) => assertion.type === "must_not_call" && !assertion.tool,
    )
  )
    throw new Error(`${source}: must_not_call requires tool`);
  if (
    pack.assertions.some(
      (assertion) => assertion.type === "call_count" && !assertion.tool,
    )
  )
    throw new Error(`${source}: call_count requires tool`);
  if (
    pack.assertions.some(
      (assertion) =>
        assertion.type === "call_count" &&
        assertion.exactly === undefined &&
        assertion.max === undefined &&
        assertion.at_most === undefined,
    )
  )
    throw new Error(`${source}: call_count requires exactly, max, or at_most`);
  if (
    pack.assertions.some(
      (assertion) =>
        assertion.type === "no_extra_transition" &&
        assertion.forbidden_change !== undefined &&
        pack.effect_probes?.some(
          (probe) => probe.id === assertion.effect && probe.source === "tool",
        ),
    )
  )
    throw new Error(
      `${source}: no_extra_transition with forbidden_change requires a fixture_state probe or state_contract with before/after values`,
    );
  if (
    pack.effect_probes?.some(
      (probe) =>
        probe.source === "tool" &&
        probe.safety === "explicit_unsafe_opt_in" &&
        pack.execution?.allow_unsafe_probes !== true,
    )
  )
    throw new Error(
      `${source}: unsafe effect probes require execution.allow_unsafe_probes: true`,
    );
  if (
    pack.effect_probes?.some(
      (probe) =>
        probe.source === "json_command" &&
        pack.execution?.allow_unsafe_probes !== true,
    )
  )
    throw new Error(
      `${source}: json_command effect probes require execution.allow_unsafe_probes: true`,
    );
  if (
    pack.transport === "stdio" &&
    pack.effect_probes?.some(
      (probe) =>
        (probe.source === "tool" || probe.source === "json_command") &&
        !probe.safety,
    )
  )
    throw new Error(
      `${source}: stdio external effect probes require explicit safety`,
    );
  if (
    pack.state_contract &&
    !(
      pack.state_contract.effects?.length ||
      pack.state_contract.forbidden?.length
    )
  )
    throw new Error(
      `${source}: state_contract must contain effects or forbidden entries`,
    );
  if (
    pack.state_contract?.effects?.some(
      (entry) =>
        entry.expected === undefined && entry.expected_delta === undefined,
    )
  )
    throw new Error(
      `${source}: state_contract effects require expected or expected_delta`,
    );
  if (
    pack.assertions.some(
      (assertion) =>
        assertion.type !== "no_extra_transition" &&
        assertion.forbidden_change !== undefined,
    )
  )
    throw new Error(
      `${source}: forbidden_change is only valid for no_extra_transition assertions`,
    );
}

export function stateContractEffectId(
  entry: StateContractEffect,
  forbidden: boolean,
  index: number,
): string {
  return (
    entry.effect ??
    `${forbidden ? "forbidden" : "state"}-${index}-${entry.path.replaceAll(".", "-")}`
  );
}

export function resolveFromPack(
  packPath: string,
  relativePath: string,
  allowedRoot?: string,
): string {
  if (isAbsolutePath(relativePath))
    throw new Error(
      `Absolute fixture paths are not allowed by default: ${relativePath}`,
    );
  const resolved = path.resolve(path.dirname(packPath), relativePath);
  if (allowedRoot) {
    const packDirectory = path.dirname(path.resolve(packPath));
    const configuredRoot = path.resolve(allowedRoot);
    const effectiveRoot = isWithin(packDirectory, configuredRoot)
      ? configuredRoot
      : packDirectory;
    if (!isWithin(resolved, effectiveRoot))
      throw new Error(
        `Fixture path escapes the allowed working directory: ${relativePath}`,
      );
  }
  return resolved;
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function assertUniqueIds(ids: string[], kind: string, source: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`${source}: duplicate ${kind} id ${id}`);
    seen.add(id);
  }
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function readYaml(
  filePath: string,
  kind: "pack" | "fixture",
): Promise<unknown> {
  let source: string;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `Invalid ${kind} ${filePath}: unable to read file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  try {
    return parse(source);
  } catch (error) {
    throw new Error(
      `Invalid ${kind} ${filePath}: YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function writeStarterPack(
  targetDir: string,
  command?: string,
  force = false,
): Promise<string> {
  await fs.mkdir(targetDir, { recursive: true });
  const packPath = path.join(targetDir, "starter.yaml");
  if (!force) {
    try {
      await fs.access(packPath);
      throw new Error(
        `Refusing to overwrite existing pack ${packPath}. Re-run with --force to replace it.`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Refusing to overwrite")
      )
        throw error;
    }
  }
  const commandWords = command ? splitCommandLine(command) : [];
  const usesExternalServer = commandWords.length > 0;
  const pack = {
    version: 1,
    id: "starter/duplicate-call",
    name: "Duplicate calls do not create duplicate effects",
    protocol: "mcp",
    transport: usesExternalServer ? "stdio" : "fixture",
    server: usesExternalServer
      ? {
          command: commandWords[0],
          args: commandWords.slice(1),
        }
      : { fixture: "fixture.example.yaml" },
    effect_probes: [
      usesExternalServer
        ? {
            id: "state",
            source: "tool",
            tool: "get_state",
            path: "invoices.length",
            safety: "declared_read_only",
            description: "The read-only get_state tool exposes invoice count.",
          }
        : {
            id: "state",
            source: "fixture_state",
            path: "invoices.length",
            description: "The local fixture exposes invoice count.",
          },
    ],
    steps: [
      {
        id: "create",
        call: "create_invoice",
        arguments: { customer_id: "cus_demo", amount: 100 },
        retry: { max_attempts: 1 },
      },
    ],
    mutations: [
      {
        id: "duplicate-create",
        type: "duplicate_call",
        applies_to: "create_invoice",
        occurrence: 1,
        seed: 1,
      },
    ],
    assertions: [
      {
        id: "exactly-one-invoice",
        type: "effect_equals",
        effect: "state",
        expected: 1,
        remediation: "Make the write operation idempotent using a request key.",
      },
    ],
    artifacts: {
      remediation:
        "Make write operations idempotent and declare idempotentHint only when that behavior is observed.",
    },
  };
  await fs.writeFile(packPath, stringify(pack), "utf8");
  const readmePath = path.join(targetDir, "README.md");
  try {
    await fs.access(readmePath);
  } catch {
    await fs.writeFile(
      readmePath,
      usesExternalServer
        ? "# Agent Crash Test pack\n\nReview `starter.yaml` against your MCP tool names and state observer, then run `agent-crash-test run starter.yaml --format terminal,markdown,json`. Keep effect probes read-only. The generated `fixture.example.yaml` remains a credential-free reference.\n"
        : "# Agent Crash Test pack\n\nRun `agent-crash-test run starter.yaml --format terminal,markdown,json`. The self-contained sample intentionally fails by duplicating an invoice; edit the mutation or fixture to model your own workflow.\n",
      "utf8",
    );
  }
  const fixtureExamplePath = path.join(targetDir, "fixture.example.yaml");
  try {
    await fs.access(fixtureExamplePath);
  } catch {
    await fs.writeFile(
      fixtureExamplePath,
      'initial_state:\n  invoices: []\ntools:\n  create_invoice:\n    description: Create one local demonstration invoice.\n    annotations:\n      destructiveHint: true\n      idempotentHint: false\n    result: { created: true }\n    effects:\n      - op: append\n        path: invoices\n        value: { id: inv_demo }\n  read_state:\n    description: Read the fixture state.\n    annotations:\n      readOnlyHint: true\n    result: "$state"\n',
      "utf8",
    );
  }
  return packPath;
}

function looksLikeFixtureDefinition(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    "tools" in record &&
    !("version" in record) &&
    !("protocol" in record) &&
    !("steps" in record)
  );
}
