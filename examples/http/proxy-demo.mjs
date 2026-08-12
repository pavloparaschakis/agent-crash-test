import { startHttpTransportProxy } from "../../dist/http-transport.js";

const targetUrl =
  process.env.AGENT_CRASH_TEST_HTTP_TARGET ?? "http://127.0.0.1:43110/mcp";
const port = Number(process.env.AGENT_CRASH_TEST_HTTP_PROXY_PORT ?? 43111);

const proxy = await startHttpTransportProxy({
  targetUrl,
  port,
  onEvent(event) {
    // Header values delivered here are redacted by the transport.
    console.error(JSON.stringify(event));
  },
  responseMutation: {
    onResponse(context) {
      // Parent wiring can select a real fault here. This harmless marker proves
      // that buffered JSON responses pass through the mutation integration seam.
      if (!context.streaming)
        return { headerChanges: { "x-agent-crash-test": "observed" } };
    },
    onSseEvent(context) {
      // SSE events are bounded and delivered one at a time. Returning undefined
      // preserves the original event exactly.
      void context;
    },
  },
});

console.log(`HTTP transport proxy listening on ${proxy.url}`);
console.log(`Forwarding to ${proxy.targetUrl}`);

for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await proxy.close();
    process.exit(0);
  });
