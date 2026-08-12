import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workflowDirectory = path.join(root, ".github", "workflows");
const actionSource = await fs.readFile(path.join(root, "action.yml"), "utf8");
const workflowNames = (await fs.readdir(workflowDirectory))
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();
const workflows = new Map();

for (const name of workflowNames) {
  const source = await fs.readFile(path.join(workflowDirectory, name), "utf8");
  const workflow = parse(source);
  assert.ok(
    workflow && typeof workflow === "object",
    `${name} must be an object`,
  );
  assert.equal(
    workflow.permissions?.contents,
    "read",
    `${name} must default to contents: read`,
  );
  for (const match of source.matchAll(/uses:\s*([^\s#]+)/g)) {
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    assert.match(
      reference,
      /@[0-9a-f]{40}$/,
      `${name} has an unpinned external action: ${reference}`,
    );
  }
  workflows.set(name, workflow);
}

const ci = workflows.get("ci.yml");
assert.ok(ci, "ci.yml is required");
assert.ok(ci.on?.push !== undefined, "CI must run on pushes");
assert.ok(ci.on?.pull_request !== undefined, "CI must run on pull requests");
assert.ok(ci.on?.merge_group !== undefined, "CI must run in a merge queue");
assert.deepEqual(ci.jobs?.test?.strategy?.matrix?.os, [
  "ubuntu-latest",
  "macos-latest",
  "windows-latest",
]);
assert.deepEqual(ci.jobs?.test?.strategy?.matrix?.node, [20, 22, 24]);
assert.equal(ci.jobs?.test?.permissions, undefined);
assert.equal(ci.jobs?.test?.["timeout-minutes"], 20);
assert.equal(ci.concurrency?.["cancel-in-progress"], true);
assert.match(
  ci.jobs?.test?.steps?.map((step) => step.run ?? "").join("\n"),
  /npm run acceptance/,
);
assert.match(actionSource, /npm ci --ignore-scripts --prefix/);
for (const match of actionSource.matchAll(/uses:\s*([^\s#]+)/g)) {
  assert.match(
    match[1],
    /@[0-9a-f]{40}$/,
    `action.yml has an unpinned external action: ${match[1]}`,
  );
}

const actionSelfTest = workflows.get("action-self-test.yml");
assert.ok(actionSelfTest, "action-self-test.yml is required");
assert.ok(
  actionSelfTest.jobs?.["local-action"],
  "passing Action job is required",
);
assert.ok(
  actionSelfTest.jobs?.["intentional-failure"],
  "intentional failing Action job is required",
);
assert.equal(actionSelfTest.jobs?.["local-action"]?.["timeout-minutes"], 10);
assert.equal(
  actionSelfTest.jobs?.["intentional-failure"]?.["timeout-minutes"],
  10,
);
assert.match(
  JSON.stringify(actionSelfTest.jobs["intentional-failure"]),
  /continue-on-error|outcome.*failure/,
);

const release = workflows.get("release.yml");
assert.ok(release, "release.yml is required");
assert.deepEqual(release.on?.push?.tags, ["v*.*.*"]);
assert.equal(release.jobs?.release?.permissions?.contents, "write");
assert.equal(release.jobs?.release?.["timeout-minutes"], 30);
const releaseRuns = release.jobs?.release?.steps
  ?.map((step) => step.run ?? "")
  .join("\n");
assert.match(releaseRuns, /npm run acceptance/);
assert.match(releaseRuns, /npm audit --omit=dev --audit-level=high/);
assert.match(releaseRuns, /scripts\/release-assets\.mjs/);
assert.match(releaseRuns, /gh .*release_args/);
assert.doesNotMatch(releaseRuns, /npm publish/);

console.log(`Workflow config check passed: ${workflowNames.length} workflows.`);
