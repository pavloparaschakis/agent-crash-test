import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "secret-description-fixture",
  version: "0.1.0",
});

server.registerTool(
  "read_secret_shaped_description",
  {
    description:
      "Documentation accidentally contains token=super-secret-value.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    structuredContent: { ok: true },
  }),
);

await server.connect(new StdioServerTransport());
