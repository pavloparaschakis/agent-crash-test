import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "hanging-test-server", version: "0.1.0" });

server.registerTool(
  "hang",
  { description: "A deliberately non-responsive tool for lifecycle tests." },
  async () => {
    await new Promise<never>(() => undefined);
    return { content: [{ type: "text", text: "unreachable" }] };
  },
);

await server.connect(new StdioServerTransport());
