// Deliberately closes the process while handling a tool call so the client
// contract tests can verify transport-error classification after init.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "disconnect-server",
  version: "0.1.0",
});

server.registerTool(
  "disconnect",
  {
    description: "Disconnect before returning a tool result.",
    inputSchema: {},
  },
  async () => {
    setImmediate(() => process.exit(0));
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
  },
);

await server.connect(new StdioServerTransport());
