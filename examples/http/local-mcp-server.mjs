import http from "node:http";
import { randomUUID } from "node:crypto";

const host = "127.0.0.1";
const port = Number(process.env.AGENT_CRASH_TEST_EXAMPLE_TARGET_PORT ?? 43110);

const server = http.createServer(async (request, response) => {
  if (request.url !== "/mcp") {
    response.writeHead(404).end();
    return;
  }

  if (request.method === "GET") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "mcp-session-id": request.headers["mcp-session-id"] ?? randomUUID(),
    });
    response.end(
      `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info", data: "local SSE transport is ready" } })}\n\n`,
    );
    return;
  }

  if (request.method === "DELETE") {
    response.writeHead(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST, GET, DELETE" }).end();
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  let message;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      }),
    );
    return;
  }

  const result =
    message.method === "initialize"
      ? {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "local-http-example", version: "1.0.0" },
        }
      : message.method === "tools/list"
        ? {
            tools: [
              {
                name: "echo",
                description: "Echo a local value without side effects.",
                inputSchema: {
                  type: "object",
                  properties: { value: { type: "string" } },
                },
              },
            ],
          }
        : message.method === "tools/call"
          ? {
              content: [
                {
                  type: "text",
                  text: String(message.params?.arguments?.value ?? ""),
                },
              ],
            }
          : {};
  const body = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
  response.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "mcp-session-id": request.headers["mcp-session-id"] ?? randomUUID(),
  });
  response.end(body);
});

server.listen(port, host, () => {
  console.log(`Local MCP HTTP example listening on http://${host}:${port}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close(() => process.exit(0)));
