// Deliberately returns an invalid tools/list entry so discovery validation
// remains a typed protocol failure rather than an assertion/reporting crash.
import readline from "node:readline";

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  let message: { id?: number; method?: string };
  try {
    message = JSON.parse(line) as { id?: number; method?: string };
  } catch {
    return;
  }
  if (message.method === "initialize") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          serverInfo: { name: "malformed-manifest", version: "0.1.0" },
        },
      })}\n`,
    );
  } else if (message.method === "tools/list") {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [{ name: "broken", inputSchema: [] }],
        },
      })}\n`,
    );
  }
});
