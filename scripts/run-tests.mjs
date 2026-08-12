import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requested = process.argv.slice(2);
const groups = requested.length
  ? requested
  : ["unit", "integration", "examples"];

async function filesIn(directory) {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(file)));
    else if (entry.isFile() && entry.name.endsWith(".test.js"))
      files.push(file);
  }
  return files;
}

const testFiles = [];
for (const group of groups)
  testFiles.push(...(await filesIn(path.join(root, "dist", "test", group))));
if (!testFiles.length) {
  console.error("No compiled test files found. Run npm run build first.");
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
  cwd: root,
});
child.on("exit", (code) => process.exit(code ?? 1));
