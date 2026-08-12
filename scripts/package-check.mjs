import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;

assert.ok(
  npmCli,
  "npm_execpath is unavailable; run this check through `npm run package:check`",
);
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "agent-crash-test-package-"),
);
const npmCache = path.join(temporary, "npm-cache");

function execute(program, args, cwd = root, timeout = 30_000) {
  return spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      npm_config_cache: npmCache,
      npm_config_fetch_retries: "0",
      npm_config_fetch_timeout: "5000",
    },
    timeout,
  });
}

function run(program, args, cwd = root) {
  const result = execute(program, args, cwd);
  assert.equal(
    result.status,
    0,
    `${program} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

async function extractOffline(tarball, consumer) {
  if (process.platform === "win32")
    throw new Error(
      "Offline package extraction fallback is unavailable on Windows; run with registry access.",
    );
  const modules = path.join(consumer, "node_modules");
  await fs.mkdir(modules, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", modules], root);
  await fs.rename(
    path.join(modules, "package"),
    path.join(modules, "agent-crash-test"),
  );
}

try {
  const packed = JSON.parse(
    run(process.execPath, [
      npmCli,
      "pack",
      "--pack-destination",
      temporary,
      "--json",
    ]),
  );
  const metadata = packed[0];
  const tarball = metadata?.filename;
  assert.equal(typeof tarball, "string", "npm pack did not return a tarball");
  assert.ok(
    metadata.entryCount < 250,
    "runtime package contains too many files",
  );
  assert.equal(
    metadata.files.some((file) => file.path.startsWith("dist/test/")),
    false,
    "runtime package must not contain compiled tests",
  );
  assert.equal(
    metadata.files.some((file) => file.path.startsWith("src/")),
    false,
    "runtime package must not contain TypeScript source",
  );

  const consumer = path.join(root, ".agent-crash-test", "package-consumer");
  await fs.rm(consumer, { recursive: true, force: true });
  await fs.mkdir(consumer, { recursive: true });
  await fs.writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "agent-crash-test-package-consumer",
      private: true,
    }),
    "utf8",
  );

  const tarballPath = path.join(temporary, tarball);
  const install = execute(
    process.execPath,
    [
      npmCli,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarballPath,
    ],
    consumer,
  );
  let installMode = "clean npm install";
  if (install.status !== 0) {
    const diagnostic = `${install.stdout}\n${install.stderr}\n${install.error?.message ?? ""}`;
    if (
      !/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|registry|timed out/i.test(
        diagnostic,
      )
    )
      assert.fail(`npm install failed:\n${diagnostic}`);
    await extractOffline(tarballPath, consumer);
    installMode = "offline tarball extraction with repository dependencies";
  }

  const installedPackageRoot = path.join(
    consumer,
    "node_modules",
    "agent-crash-test",
  );
  const installedCli = path.join(installedPackageRoot, "dist", "cli.js");
  await fs.access(installedCli);
  await fs.access(
    path.join(installedPackageRoot, "examples", "controls", "README.md"),
  );
  const doctor = execute(process.execPath, [installedCli, "doctor"], consumer);
  assert.equal(
    doctor.status,
    0,
    `installed CLI doctor failed:\n${doctor.stdout}\n${doctor.stderr}`,
  );
  const demo = execute(process.execPath, [installedCli, "demo"], consumer);
  assert.equal(
    demo.status,
    0,
    `installed CLI demo failed:\n${demo.stdout}\n${demo.stderr}`,
  );
  assert.match(
    demo.stdout,
    /Demo complete: 12 packs, 10 intentional finding\(s\)/,
  );
  const demoReports = await fs.readdir(
    path.join(consumer, ".agent-crash-test", "demo"),
  );
  assert.equal(
    demoReports.length,
    24,
    "installed demo should write Markdown and JSON reports for twelve packs",
  );
  console.log(
    `Package smoke passed: ${tarball} (${metadata.entryCount} files; ${installMode}).`,
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.rm(path.join(root, ".agent-crash-test", "package-consumer"), {
    recursive: true,
    force: true,
  });
}
