import assert from "node:assert/strict";
import test from "node:test";
import { getPath, setPath } from "../../json-path.js";

test("gets nested object, array, and length paths", () => {
  const value = { invoices: [{ id: "inv_1" }, { id: "inv_2" }] };
  assert.equal(getPath(value, "invoices.length"), 2);
  assert.equal(getPath(value, "invoices[1].id"), "inv_2");
});

test("sets a nested object path", () => {
  const value = { state: {} };
  setPath(value, "state.status", "ready");
  assert.deepEqual(value, { state: { status: "ready" } });
});
