import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const markdownFiles = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (
      ["node_modules", "dist", ".git", ".agent-crash-test"].includes(entry.name)
    )
      continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile() && entry.name.endsWith(".md"))
      markdownFiles.push(file);
  }
}

await walk(root);
const failures = [];
for (const file of markdownFiles) {
  const source = await fs.readFile(file, "utf8");
  const links = source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
  for (const match of links) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
    target = decodeURIComponent(target.split("#", 1)[0]);
    if (!target || /^(?:LINK|artifact-link|your-org)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    try {
      await fs.access(resolved);
    } catch {
      failures.push(`${path.relative(root, file)} -> ${target}`);
    }
  }
}

if (failures.length) {
  console.error("Broken local Markdown links:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  `Checked ${markdownFiles.length} Markdown files; local links are valid.`,
);
