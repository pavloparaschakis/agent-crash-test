import readline from "node:readline";

type RpcMessage = Record<string, unknown>;

const write = (message: RpcMessage): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

let initializeId: string | number | null | undefined;
let waitingForPing = false;

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  if (!line.trim()) continue;
  const message = JSON.parse(line) as RpcMessage;
  const id =
    typeof message.id === "string" ||
    typeof message.id === "number" ||
    message.id === null
      ? message.id
      : undefined;
  const method =
    typeof message.method === "string" ? message.method : undefined;

  if (method === "initialize" && id !== undefined) {
    initializeId = id;
    waitingForPing = true;
    write({
      jsonrpc: "2.0",
      id: 100,
      method: "ping",
      params: { reason: "proxy-correlation-test" },
    });
    continue;
  }

  if (id === 100 && method === undefined && waitingForPing) {
    waitingForPing = false;
    write({
      jsonrpc: "2.0",
      id: initializeId,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        serverInfo: { name: "server-request-test", version: "1" },
      },
    });
    continue;
  }

  if (method === "notifications/initialized") continue;

  if (method === "tools/list" && id !== undefined) {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Return the supplied value.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
    continue;
  }

  if (method === "tools/call" && id !== undefined) {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
        structuredContent: { ok: true },
      },
    });
  }
}
