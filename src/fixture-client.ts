import { cloneJson, getPath, setPath } from "./json-path.js";
import type {
  CallOutcome,
  CrashTestClient,
  FixtureDefinition,
  FixtureEffect,
  JsonObject,
  JsonValue,
  ToolManifest,
} from "./types.js";

function resolveValue(
  value: JsonValue | undefined,
  args: JsonObject,
  state: JsonObject,
): JsonValue {
  if (typeof value === "string") {
    if (value === "$state") return cloneJson(state);
    if (value.startsWith("$args."))
      return cloneJson(getPath(args, value.slice(6)) ?? null);
    if (value.startsWith("$state."))
      return cloneJson(getPath(state, value.slice(7)) ?? null);
  }
  if (Array.isArray(value))
    return value.map((item) => resolveValue(item, args, state));
  if (value && typeof value === "object") {
    const resolved: JsonObject = {};
    for (const [key, nested] of Object.entries(value))
      resolved[key] = resolveValue(nested, args, state);
    return resolved;
  }
  return value ?? null;
}

function applyEffect(
  effect: FixtureEffect,
  args: JsonObject,
  state: JsonObject,
): void {
  const value = resolveValue(effect.value, args, state);
  if (effect.op === "set") {
    setPath(state, effect.path, value);
    return;
  }
  if (effect.op === "increment") {
    const current = getPath(state, effect.path);
    setPath(state, effect.path, typeof current === "number" ? current + 1 : 1);
    return;
  }
  const existing = getPath(state, effect.path);
  if (!Array.isArray(existing))
    throw new Error(
      `Fixture append effect requires an array at ${effect.path}`,
    );
  existing.push(value);
}

export class FixtureClient implements CrashTestClient {
  private state: JsonObject;

  constructor(
    private readonly fixture: FixtureDefinition,
    initialState?: JsonObject,
  ) {
    this.state = cloneJson(initialState ?? fixture.initial_state ?? {});
  }

  async connect(): Promise<void> {}

  async listTools(): Promise<ToolManifest[]> {
    return Object.entries(this.fixture.tools).map(([name, tool]) => {
      const manifest: ToolManifest = { name };
      if (tool.description !== undefined)
        manifest.description = tool.description;
      if (tool.input_schema !== undefined)
        manifest.inputSchema = tool.input_schema;
      if (tool.output_schema !== undefined)
        manifest.outputSchema = tool.output_schema;
      if (tool.annotations !== undefined)
        manifest.annotations = tool.annotations;
      return manifest;
    });
  }

  async callTool(name: string, args: JsonObject): Promise<CallOutcome> {
    const tool = this.fixture.tools[name];
    if (!tool)
      return {
        error: {
          kind: "server_error",
          message: `Fixture does not define tool ${name}`,
        },
        commitStatus: "not_committed",
        responseStatus: "returned",
      };
    if (tool.error)
      return {
        error: tool.error,
        commitStatus:
          tool.error.kind === "permission_denied"
            ? "not_attempted"
            : "not_committed",
        responseStatus: "returned",
      };
    for (const effect of tool.effects ?? [])
      applyEffect(effect, args, this.state);
    const output =
      tool.result === "$state"
        ? cloneJson(this.state)
        : resolveValue(tool.result, args, this.state);
    return {
      output,
      raw: output,
      commitStatus:
        (tool.effects?.length ?? 0) > 0 ? "committed" : "not_committed",
      responseStatus: "returned",
    };
  }

  getFixtureState(): JsonObject {
    return cloneJson(this.state);
  }

  getFixtureStateSnapshot(): JsonObject {
    return cloneJson(this.state);
  }

  async close(): Promise<void> {}
}
