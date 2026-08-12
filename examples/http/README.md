# Local Streamable HTTP/SSE transport example

This example exercises the standalone HTTP transport foundation without CLI or
package-export wiring. It binds both processes to `127.0.0.1`.

Build the TypeScript source, then use two terminals:

```bash
npm run build
node examples/http/local-mcp-server.mjs
```

```bash
node examples/http/proxy-demo.mjs
```

Send a Streamable HTTP request through the proxy:

```bash
curl --fail-with-body http://127.0.0.1:43111/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Open a short SSE session:

```bash
curl --no-buffer http://127.0.0.1:43111/mcp \
  -H 'Accept: text/event-stream' \
  -H 'Mcp-Session-Id: local-example'
```

The library entry points are `startHttpTransportProxy`,
`createHttpTransportRequestHandler`, and `resolveHttpTransportOptions` in
`src/http-transport.ts`. They intentionally are not wired into the existing
package exports or CLI in this isolated change.

Remote binding and remote upstream targets are rejected unless their distinct,
explicit unsafe opt-ins are enabled. Keep those opt-ins disabled unless another
network boundary supplies authentication, TLS, and access control.
