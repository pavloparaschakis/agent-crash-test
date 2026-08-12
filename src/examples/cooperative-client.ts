import process from "node:process";
import { McpStdioClient } from "../mcp-client.js";
import type { JsonObject } from "../types.js";

async function main(): Promise<void> {
  const command = process.env.AGENT_CRASH_TEST_MCP_COMMAND;
  const rawArgs = process.env.AGENT_CRASH_TEST_MCP_ARGS_JSON;
  if (!command || !rawArgs)
    throw new Error(
      "AGENT_CRASH_TEST_MCP_COMMAND and AGENT_CRASH_TEST_MCP_ARGS_JSON are required.",
    );
  const parsed = JSON.parse(rawArgs) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => typeof value !== "string")
  )
    throw new Error("AGENT_CRASH_TEST_MCP_ARGS_JSON must be a string array.");
  const client = new McpStdioClient(
    { command, args: parsed as string[] },
    process.cwd(),
  );
  try {
    await client.connect({ requestTimeoutMs: 15_000 });
    const manifest = await client.listTools({ requestTimeoutMs: 15_000 });
    const requested = process.env.AGENT_CRASH_TEST_TOOL;
    const tool = requested
      ? manifest.find((item) => item.name === requested)
      : (manifest.find((item) => item.name === "create_invoice") ??
        manifest[0]);
    if (!tool) throw new Error("The wrapped server exposed no tools.");
    const rawArguments = process.env.AGENT_CRASH_TEST_TOOL_ARGUMENTS;
    const args = rawArguments
      ? (JSON.parse(rawArguments) as JsonObject)
      : {
          customer_id: "cus_real_client",
          amount: 42,
          request_id: "req_real_client",
          confirmed: true,
        };
    const result = await client.callTool(tool.name, args, {
      requestTimeoutMs: 15_000,
    });
    process.stdout.write(
      `${JSON.stringify({ tool: tool.name, outcome: result.error ? "error" : "success" })}\n`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
