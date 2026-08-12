import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = path.join(root, "scripts", "release-assets.mjs");
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "agent-crash-test-release-assets-"),
);

try {
  const content = Buffer.from("source-preview-test-tarball\n", "utf8");
  const tarball = "agent-crash-test-0.1.0.tgz";
  await fs.writeFile(path.join(temporary, tarball), content);
  const result = spawnSync(process.execPath, [script, temporary], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(
    result.status,
    0,
    `release asset generator failed:\n${result.stdout}\n${result.stderr}`,
  );

  const expected = createHash("sha256").update(content).digest("hex");
  assert.equal(
    await fs.readFile(path.join(temporary, "SHA256SUMS"), "utf8"),
    `${expected}  ${tarball}\n`,
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(temporary, "release-manifest.json"), "utf8"),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.package.name, "agent-crash-test");
  assert.equal(manifest.package.version, "0.1.0");
  assert.equal(manifest.package.tarball, tarball);
  assert.equal(manifest.package.bytes, content.byteLength);
  assert.equal(manifest.package.sha256, expected);
  assert.equal(manifest.publication.strategy, "github-source-preview");
  console.log("Release asset generator check passed.");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
