import path from "node:path";
import process from "node:process";
import { startHostedService } from "../../dist/hosted-service.js";

const apiToken = process.env.ACT_HOSTED_API_TOKEN;
if (!apiToken) {
  console.error("ACT_HOSTED_API_TOKEN is required (minimum 16 characters).");
  process.exitCode = 2;
} else {
  const portText = process.env.ACT_HOSTED_PORT ?? "7411";
  if (!/^[0-9]+$/.test(portText) || Number(portText) > 65_535) {
    console.error("ACT_HOSTED_PORT must be an integer from 0 to 65535.");
    process.exitCode = 2;
  } else {
    const dataDirectory = path.resolve(
      process.env.ACT_HOSTED_DATA_DIR ?? ".agent-crash-test/hosted",
    );
    const service = await startHostedService({
      dataDirectory,
      apiToken,
      host: "127.0.0.1",
      port: Number(portText),
    });

    console.log(`Agent Crash Test collaboration service: ${service.url}`);
    console.log(`Local data directory: ${service.dataDirectory}`);
    console.log("Telemetry: disabled (no external requests are made)");

    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}; draining active requests...`);
      try {
        await service.stop();
        console.log("Hosted service stopped.");
      } catch (error) {
        console.error(`Graceful shutdown failed: ${String(error)}`);
        process.exitCode = 1;
      }
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  }
}
