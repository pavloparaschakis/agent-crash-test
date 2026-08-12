import assert from "node:assert/strict";
import test from "node:test";
import { resolveFromPack, validatePackSemantics } from "../../pack.js";
import type { CrashTestPack } from "../../types.js";

function basePack(overrides: Partial<CrashTestPack> = {}): CrashTestPack {
  return {
    version: 1,
    id: "test/pack",
    name: "Test pack",
    protocol: "mcp",
    transport: "fixture",
    server: { fixture: "fixture.yaml" },
    steps: [{ id: "read", call: "read" }],
    assertions: [
      { id: "read-count", type: "call_count", tool: "read", exactly: 1 },
    ],
    ...overrides,
  };
}

test("semantic validation rejects state contracts without fixture state", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          transport: "stdio",
          server: { command: "node" },
          state_contract: {
            effects: [{ path: "state.count", expected_delta: 1 }],
          },
        }),
        "test.yaml",
      ),
    /state_contract requires transport: fixture/,
  );
});

test("semantic validation rejects unsafe probes without an explicit pack opt-in", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          effect_probes: [
            {
              id: "state",
              source: "tool",
              tool: "read",
              path: "count",
              safety: "explicit_unsafe_opt_in",
            },
          ],
        }),
        "test.yaml",
      ),
    /unsafe effect probes require/,
  );
});

test("semantic validation requires explicit safety for stdio tool probes", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          transport: "stdio",
          server: { command: "node" },
          effect_probes: [
            { id: "state", source: "tool", tool: "read", path: "count" },
          ],
        }),
        "test.yaml",
      ),
    /explicit safety/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          transport: "stdio",
          server: { command: "node" },
          effect_probes: [
            { id: "state", source: "fixture_state", path: "count" },
          ],
        }),
        "test.yaml",
      ),
    /fixture_state effect probes require transport: fixture/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          effect_probes: [
            {
              id: "state",
              source: "tool",
              tool: "read",
              path: "count",
              safety: "fixture",
            },
          ],
        }),
        "test.yaml",
      ),
    /safety must match its source/,
  );
});

test("semantic validation rejects effect claims without an observable source", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          assertions: [
            {
              id: "effect",
              type: "effect_equals",
              effect: "missing",
              expected: 1,
            },
          ],
        }),
        "test.yaml",
      ),
    /effect_probes or state_contract source/,
  );
});

test("semantic validation rejects equality assertions without expected values", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          effect_probes: [
            { id: "state", source: "fixture_state", path: "count" },
          ],
          assertions: [
            { id: "effect", type: "effect_equals", effect: "state" },
          ],
        }),
        "test.yaml",
      ),
    /require expected/,
  );
});

test("semantic validation rejects incomplete annotation and state contracts", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          assertions: [
            {
              id: "annotation",
              type: "annotation_matches",
              expected: true,
            },
          ],
        }),
        "test.yaml",
      ),
    /annotation_matches requires tool and annotation/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({ state_contract: { effects: [{ path: "count" }] } }),
        "test.yaml",
      ),
    /state_contract effects require expected or expected_delta/,
  );
});

test("semantic validation rejects Windows-style absolute fixture paths", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({ server: { fixture: "C:\\secrets\\fixture.yaml" } }),
        "test.yaml",
      ),
    /absolute fixture paths are not allowed/,
  );
  assert.throws(
    () =>
      resolveFromPack(
        "/tmp/project/tests/pack.yaml",
        "../../outside.fixture.yaml",
        "/tmp/project",
      ),
    /escapes the allowed working directory/,
  );
});

test("semantic validation rejects duplicate identifiers that would collide in reports", () => {
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          steps: [
            { id: "read", call: "read" },
            { id: "read", call: "read" },
          ],
        }),
        "test.yaml",
      ),
    /duplicate step id read/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          mutations: [
            { id: "fault", type: "timeout" },
            { id: "fault", type: "duplicate_call" },
          ],
        }),
        "test.yaml",
      ),
    /duplicate mutation id fault/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          assertions: [
            { id: "read-count", type: "call_count", tool: "read", exactly: 1 },
            { id: "read-count", type: "call_count", tool: "read", exactly: 1 },
          ],
        }),
        "test.yaml",
      ),
    /duplicate assertion id read-count/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          state_contract: {
            effects: [{ path: "state.count", expected_delta: 1 }],
            forbidden: [{ path: "state.count", forbidden_change: "any" }],
          },
        }),
        "test.yaml",
      ),
    /duplicate state contract path id path:state\.count/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          state_contract: {
            effects: [
              { path: "state.count", expected_delta: 1, effect: "collision" },
            ],
            forbidden: [
              {
                path: "state.other",
                forbidden_change: "any",
                effect: "collision",
              },
            ],
          },
        }),
        "test.yaml",
      ),
    /duplicate state contract effect id collision/,
  );
  assert.throws(
    () =>
      validatePackSemantics(
        basePack({
          effect_probes: [
            { id: "state", source: "fixture_state", path: "state.count" },
          ],
          state_contract: {
            effects: [
              { path: "state.other", expected_delta: 1, effect: "state" },
            ],
          },
        }),
        "test.yaml",
      ),
    /duplicate effect id state/,
  );
});
