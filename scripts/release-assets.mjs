import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = path.resolve(
  process.argv[2] ?? path.join(root, ".release-assets"),
);
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);

await fs.mkdir(outputDirectory, { recursive: true });
const files = (await fs.readdir(outputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
  .map((entry) => entry.name)
  .sort();

if (files.length !== 1)
  throw new Error(
    `Expected exactly one npm source tarball in ${outputDirectory}; found ${files.length}. Run npm pack first.`,
  );

const tarball = files[0];
const tarballPath = path.join(outputDirectory, tarball);
const bytes = await fs.readFile(tarballPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const generatedAt = new Date().toISOString();
const commit = process.env.GITHUB_SHA ?? process.env.GIT_COMMIT ?? null;

await fs.writeFile(
  path.join(outputDirectory, "SHA256SUMS"),
  `${sha256}  ${tarball}\n`,
  "utf8",
);
await fs.writeFile(
  path.join(outputDirectory, "release-manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      commit,
      package: {
        name: packageJson.name,
        version: packageJson.version,
        private: packageJson.private === true,
        tarball,
        bytes: bytes.byteLength,
        sha256,
      },
      publication: {
        strategy: "github-source-preview",
        npmPublication: "not-configured",
      },
    },
    null,
  )}\n`,
  "utf8",
);

console.log(
  `Release assets prepared: ${tarball} (${bytes.byteLength} bytes, sha256 ${sha256})`,
);
