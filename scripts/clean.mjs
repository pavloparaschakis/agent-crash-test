import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
for (const directory of ["dist", "coverage", ".agent-crash-test"]) {
  await fs.rm(path.join(root, directory), { recursive: true, force: true });
}
