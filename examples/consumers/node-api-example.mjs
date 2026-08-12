import assert from "node:assert/strict";
import {
  evaluateJsonlRun,
  loadPack,
  proposeGuidedCapture,
  renderHtmlReport,
  runPack,
  startHostedService,
  startHttpTransportProxy,
  terminalReport,
} from "../../dist/index.js";

assert.equal(typeof evaluateJsonlRun, "function");
assert.equal(typeof proposeGuidedCapture, "function");
assert.equal(typeof renderHtmlReport, "function");
assert.equal(typeof startHostedService, "function");
assert.equal(typeof startHttpTransportProxy, "function");

const source = "examples/packs/fixture-duplicate-call.yaml";
const { pack } = await loadPack(source);
const result = await runPack(pack, {
  source,
  workingDirectory: process.cwd(),
});

console.log(terminalReport(result));
if (result.findings.length > 0) process.exitCode = 1;
