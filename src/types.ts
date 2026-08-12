export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type Severity = "blocker" | "error" | "warning" | "notice" | "info";

export type BasicMutationType =
  | "timeout"
  | "retryable_error"
  | "malformed_result"
  | "stale_result"
  | "duplicate_call"
  | "permission_denied"
  | "commit_then_response_lost"
  | "disconnect_after_commit"
  | "partial_success"
  | "stale_read_then_conflicting_write";

/**
 * Deterministic response-layer mutations implemented by MutationController.
 *
 * These are intentionally separate from MutationType until the pack parser and
 * stdio proxy expose them. Keeping the distinction prevents callers from
 * assuming transport-level support that does not exist yet while still making
 * the pure mutation engine available to adapters and tests.
 */
export type AdvancedMutationType =
  | "rate_limit"
  | "schema_drift"
  | "truncated_response"
  | "out_of_order_response"
  | "corrupted_pagination_cursor"
  | "slow_stream"
  | "progress_stall";

export type MutationType = BasicMutationType | AdvancedMutationType;
export type MutationKind = MutationType;

export type MutationPhase =
  | "before_underlying_call"
  | "during_underlying_call"
  | "after_commit_before_response"
  | "after_response_before_client"
  | "client_visible_transport_failure"
  | "observer_only";

export type CommitStatus =
  | "not_attempted"
  | "not_committed"
  | "committed"
  | "unknown";

export type ResponseStatus = "not_returned" | "returned" | "corrupted" | "lost";

export const REPORT_SCHEMA_VERSION = 1;
export const MUTATION_ENGINE_VERSION = "1";

export interface PackServer {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  fixture?: string;
}

export interface ExecutionPolicy {
  request_timeout_ms?: number;
  max_run_ms?: number;
  observer_timeout_ms?: number;
  max_observer_output_bytes?: number;
  network?: "not_enforced" | "external_sandbox_required";
  inherit_env?: false;
  allow_unsafe_probes?: boolean;
}

export interface RetryPolicy {
  max_attempts: number;
  on?: Array<
    | "timeout"
    | "retryable_error"
    | "rate_limit"
    | "permission_denied"
    | "transport_error"
  >;
}

export interface PackStep {
  id: string;
  call: string;
  arguments?: JsonObject;
  retry?: RetryPolicy;
  capture?: string;
}

export interface MutationBase {
  id: string;
  version?: string;
  phase?: MutationPhase;
  applies_to?: string;
  occurrence?: number;
  duration_ms?: number;
  seed?: number;
  commit_status?: CommitStatus;
  response_status?: ResponseStatus;
}

export interface Mutation extends MutationBase {
  type: MutationType;
  retry_after_ms?: number;
  remove_path?: string;
  truncate_after_bytes?: number;
  cursor_path?: string;
  replacement?: JsonValue;
}

export interface AdvancedMutation extends Mutation {
  type: AdvancedMutationType;
  /** Delay advertised by a rate-limit response. Defaults to 1000ms. */
  retry_after_ms?: number;
  /** JSON path of the field removed by schema_drift. */
  remove_path?: string;
  /** UTF-8 byte boundary used by truncated_response. Defaults to 64. */
  truncate_after_bytes?: number;
  /** JSON path of a cursor; otherwise well-known cursor names are discovered. */
  cursor_path?: string;
  /** Replacement cursor. Defaults to an unmistakably invalid sentinel. */
  replacement?: JsonValue;
}

export type MutationConfig = Mutation;

export type ProbeSafety =
  | "fixture"
  | "declared_read_only"
  | "explicit_unsafe_opt_in";

export interface EffectProbe {
  id: string;
  source: "fixture_state" | "tool" | "json_command";
  path: string;
  tool?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  arguments?: JsonObject;
  description?: string;
  safety?: ProbeSafety;
}

export interface StateContractEffect {
  path: string;
  effect?: string;
  expected?: JsonValue;
  expected_delta?: number;
  forbidden_change?: "any" | "increase" | "decrease";
  description?: string;
}

export interface StateContract {
  effects?: StateContractEffect[];
  forbidden?: StateContractEffect[];
}

export type EffectClass =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "send"
  | "approve"
  | "deploy"
  | "publish";

export interface EffectExpectation {
  effect: string;
  path?: string;
  expected?: JsonValue;
  forbidden_change?: "any" | "increase" | "decrease";
  description?: string;
}

export interface OrderingConstraint {
  before: string;
  after: string;
  description?: string;
}

export interface AuthorizationExpectation {
  argument?: string;
  expected?: JsonValue;
}

export interface RecoveryExpectation {
  uncertain_outcome?:
    | "query_before_retry"
    | "do_not_retry"
    | "retry_with_same_key"
    | "compensate";
  query_tool?: string;
  max_attempts?: number;
}

export interface EffectContract {
  id: string;
  class: EffectClass;
  description: string;
  tool?: string;
  preconditions?: EffectExpectation[];
  intended: EffectExpectation[];
  forbidden?: EffectExpectation[];
  cardinality?:
    | "zero_or_one"
    | "at_most_once"
    | "exactly_once"
    | "at_least_once";
  ordering?: OrderingConstraint[];
  authorization?: AuthorizationExpectation;
  recovery?: RecoveryExpectation;
  severity?: Severity;
  remediation?: string;
}

export type AssertionType =
  | "effect_equals"
  | "effect_not_equals"
  | "must_not_call"
  | "call_count"
  | "result_path_equals"
  | "annotation_matches"
  | "state_path_equals"
  | "no_extra_transition";

export interface Assertion {
  id: string;
  type: AssertionType;
  effect?: string;
  path?: string;
  expected?: JsonValue;
  tool?: string;
  max?: number;
  exactly?: number;
  at_most?: number;
  step?: string;
  annotation?: string;
  forbidden_change?: "any" | "increase" | "decrease";
  remediation?: string;
  why_it_matters?: string;
  severity?: Severity;
}

export interface FixtureEffect {
  op: "append" | "set" | "increment";
  path: string;
  value?: JsonValue;
}

export interface FixtureTool {
  description?: string;
  input_schema?: JsonObject;
  output_schema?: JsonObject;
  annotations?: Record<string, boolean | string>;
  result?: JsonValue | "$state";
  effects?: FixtureEffect[];
  error?: { kind: "retryable_error" | "permission_denied"; message: string };
}

export interface FixtureDefinition {
  initial_state?: JsonObject;
  tools: Record<string, FixtureTool>;
}

export interface CrashTestPack {
  version: number;
  id: string;
  name: string;
  description?: string;
  protocol: "mcp";
  transport: "stdio" | "fixture";
  server: PackServer;
  execution?: ExecutionPolicy;
  tags?: string[];
  state?: { initial?: JsonObject; source?: "fixture" };
  state_contract?: StateContract;
  effect_contracts?: EffectContract[];
  effect_probes?: EffectProbe[];
  steps: PackStep[];
  mutations?: MutationConfig[];
  assertions: Assertion[];
  artifacts?: { remediation?: string };
}

export interface ToolManifest {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  annotations?: Record<string, JsonValue>;
}

export type CallErrorKind =
  | "configuration"
  | "spawn"
  | "initialization"
  | "protocol"
  | "timeout"
  | "transport_error"
  | "retryable_error"
  | "rate_limit"
  | "permission_denied"
  | "server_error"
  | "internal";

export interface CallError {
  kind: CallErrorKind;
  message: string;
  code?: number | string;
  retryable?: boolean;
  source?: string;
  /** Structured, machine-readable recovery information. */
  details?: JsonObject;
}

export type NormalizedOutcomeStatus =
  | "success"
  | "error"
  | "timeout"
  | "disconnected"
  | "malformed"
  | "unknown";

export interface NormalizedOutcome {
  status: NormalizedOutcomeStatus;
  output?: JsonValue;
  error?: CallError;
  commitStatus: CommitStatus;
  responseStatus: ResponseStatus;
}

export type NormalizedEventKind =
  | "run_start"
  | "discovery"
  | "logical_call"
  | "physical_call"
  | "response"
  | "retry"
  | "duplicate"
  | "transport_error"
  | "effect_probe"
  | "state_snapshot"
  | "mutation"
  | "run_end";

export interface NormalizedEvent {
  schemaVersion: number;
  runId: string;
  eventId: string;
  sequence: number;
  timestamp: string;
  direction: "client_to_target" | "target_to_client" | "observer" | "runner";
  kind: NormalizedEventKind;
  operationId?: string;
  parentEventId?: string;
  stepId?: string;
  tool?: string;
  arguments?: JsonValue;
  outcome?: NormalizedOutcome;
  physicalCall: boolean;
  attempt?: number;
  mutationIds?: string[];
  mutationPhase?: MutationPhase;
  durationMs?: number;
  redactionApplied: boolean;
  observerId?: string;
  observerStatus?:
    | "present"
    | "absent"
    | "changed"
    | "forbidden"
    | "inconclusive";
  observerSource?: string;
  observerValue?: JsonValue;
}

export interface AdapterCapabilities {
  id: string;
  version: string;
  protocol: string;
  transport: string;
  realClient: boolean;
  physicalInterception: boolean;
  responseMutation: boolean;
  transportDisconnect: boolean;
  stateObservation: boolean;
  determinism: "deterministic" | "partial" | "nondeterministic";
  sandboxRequired: boolean;
  limitations: string[];
}

export interface CallOutcome {
  output?: JsonValue;
  raw?: JsonValue;
  error?: CallError;
  correlationId?: string;
  commitStatus?: CommitStatus;
  responseStatus?: ResponseStatus;
  mutationPhase?: MutationPhase;
}

export type EventKind = "step" | "retry" | "duplicate" | "effect_probe";

export interface CallEvent {
  eventId: string;
  sequence: number;
  parentEventId?: string;
  kind: EventKind;
  stepId?: string;
  tool: string;
  arguments: JsonObject;
  attempt: number;
  output?: JsonValue;
  error?: CallError;
  underlyingOutput?: JsonValue;
  underlyingError?: CallError;
  commitStatus?: CommitStatus;
  responseStatus?: ResponseStatus;
  mutationPhase?: MutationPhase;
  mutationIds: string[];
  mutationVersions?: string[];
  durationMs: number;
  physicalCall: boolean;
  redactionApplied: boolean;
}

export interface MutationRecord {
  id: string;
  type: MutationKind;
  version: string;
  seed?: number;
  appliesTo?: string;
  occurrence?: number;
  requestedAtEvent?: string;
  appliedAtEvent?: string;
  parameters: JsonObject;
  phase?: MutationPhase;
  result: "applied" | "not_matched" | "blocked" | "failed";
}

export interface EffectValue {
  id: string;
  value: JsonValue | undefined;
  source: EffectProbe["source"];
  path: string;
  tool?: string;
  before?: JsonValue;
  after?: JsonValue;
  expected?: JsonValue;
  expectedDelta?: number;
  forbiddenChange?: "any" | "increase" | "decrease";
  observed?: JsonValue;
  error?: CallError;
  observerStatus?:
    | "present"
    | "absent"
    | "changed"
    | "forbidden"
    | "inconclusive";
  probeEventId?: string;
  safety: ProbeSafety;
}

export interface RunIdentity {
  runId: string;
  startedAt: string;
  completedAt?: string;
  runnerVersion: string;
  reportSchemaVersion: number;
  packSchemaVersion: number;
  packId: string;
  packSource: string;
  packSha256: string;
  serverManifestSha256?: string;
  mutationSeed?: number;
  platform: { os: string; arch: string; node: string };
  determinism: "deterministic" | "partial" | "nondeterministic";
}

export interface Finding {
  id: string;
  severity: Severity;
  status: "failed" | "passed" | "skipped";
  category?:
    | "assertion_failure"
    | "missing_effect"
    | "extra_transition"
    | "duplicate_transition"
    | "changed_effect"
    | "probe_error";
  message: string;
  effectId?: string;
  whyItMatters?: string;
  evidence?: JsonValue;
  expected?: JsonValue;
  observed?: JsonValue;
  evidenceEventIds: string[];
  firstDivergentEventId?: string;
  remediation?: string;
  fingerprint?: {
    algorithm: "sha256";
    value: string;
    inputs: string[];
  };
  reproduction: ReproductionMetadata;
  redactionApplied: boolean;
}

export interface AssertionResult {
  id: string;
  passed: boolean;
  finding?: Finding;
}

export interface ReproductionMetadata {
  command: string;
  workingDirectory?: string;
  packPath: string;
  mutationIds?: string[];
  seed?: number;
}

export interface RunResult {
  schemaVersion: 1;
  identity: RunIdentity;
  pack: { id: string; name: string; source: string };
  transport: CrashTestPack["transport"];
  adapter?: AdapterCapabilities;
  server: {
    command?: string;
    args?: string[];
    cwd?: string;
    fixture?: string;
    toolCount: number;
  };
  manifest: ToolManifest[];
  mutations: MutationRecord[];
  events: CallEvent[];
  effects: EffectValue[];
  assertions: AssertionResult[];
  findings: Finding[];
  reproduction: ReproductionMetadata;
  executionWarnings: string[];
  executionError?: CallError;
  policy: {
    failOn: Severity;
    networkBoundary: "not_enforced" | "external_sandbox_required";
    credentialPolicy: "minimal_environment";
    processClosed: boolean;
  };
}

export interface RunOptions {
  source: string;
  mutationTypes?: string[];
  failOn?: Severity;
  reproductionCommand?: string;
  workingDirectory?: string;
  seed?: number;
  requestTimeoutMs?: number;
  maxRunMs?: number;
  allowUnsafeProbes?: boolean;
}

export interface ToolCallOptions {
  requestTimeoutMs?: number;
}

export interface CrashTestClient {
  connect(options?: ToolCallOptions): Promise<void>;
  listTools(options?: ToolCallOptions): Promise<ToolManifest[]>;
  callTool(
    name: string,
    args: JsonObject,
    options?: ToolCallOptions,
  ): Promise<CallOutcome>;
  getFixtureState?(): JsonObject | undefined;
  getFixtureStateSnapshot?(): JsonObject | undefined;
  close(): Promise<void>;
}
