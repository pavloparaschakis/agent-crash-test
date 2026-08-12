import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const reportPath = process.argv[2];
const apiToken = process.env.ACT_HOSTED_API_TOKEN;
const serviceUrl = process.env.ACT_HOSTED_URL ?? "http://127.0.0.1:7411";

if (!reportPath || !apiToken) {
  console.error(
    "Usage: ACT_HOSTED_API_TOKEN=... node examples/hosted/upload-run.mjs <run-result.json>",
  );
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(reportPath);
  const body = await fs.readFile(absolutePath);
  const response = await fetch(`${serviceUrl}/v1/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body,
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error(
      `Upload rejected (${response.status}): ${responseText.trim()}`,
    );
    process.exitCode = 1;
  } else {
    const summary = JSON.parse(responseText);
    console.log(`Stored ${summary.runId} as ${summary.id}`);
    console.log(`${serviceUrl}/v1/runs/${summary.id}`);
  }
}
