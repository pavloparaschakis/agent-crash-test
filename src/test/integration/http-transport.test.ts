import assert from "node:assert/strict";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  HttpTransportConfigurationError,
  isLoopbackHostname,
  redactHttpHeaders,
  resolveHttpTransportOptions,
  startHttpTransportProxy,
  type HttpProxyEvent,
} from "../../http-transport.js";
import { REDACTION_MARKER } from "../../redaction.js";

interface LocalServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}

async function localServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<LocalServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function rpcBody(id = 1): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/list",
    params: {},
  });
}

async function loopbackSkipReason(): Promise<string | undefined> {
  const server = http.createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return undefined;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES")
      return `loopback sockets are unavailable in this test environment (${code})`;
    throw error;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const networkSkip = await loopbackSkipReason();

test("redacts sensitive headers without changing the forwarding source", () => {
  const source = {
    authorization: "Bearer top-secret-token-123456",
    cookie: "session=private-cookie-value",
    "x-api-key": "private-api-key-value",
    "mcp-session-id": "public-session-id",
  };
  const safe = redactHttpHeaders(source);
  assert.equal(safe.authorization, REDACTION_MARKER);
  assert.equal(safe.cookie, REDACTION_MARKER);
  assert.equal(safe["x-api-key"], REDACTION_MARKER);
  assert.equal(safe["mcp-session-id"], "public-session-id");
  assert.equal(source.authorization, "Bearer top-secret-token-123456");
});

test("normalizes one-value header arrays while preserving true multi-value headers", () => {
  const safe = redactHttpHeaders({
    "set-cookie": ["session=private-cookie-value"],
    "x-forwarded-for": ["127.0.0.1", "127.0.0.2"],
  });
  assert.equal(safe["set-cookie"], REDACTION_MARKER);
  assert.deepEqual(safe["x-forwarded-for"], ["127.0.0.1", "127.0.0.2"]);
});

test(
  "forwards Streamable HTTP POST requests, sessions, and bounded response mutations",
  { skip: networkSkip },
  async () => {
    let received:
      | {
          method?: string;
          url?: string;
          authorization?: string;
          protocolVersion?: string;
          body: string;
        }
      | undefined;
    const target = await localServer((request, response) => {
      void requestBody(request).then((body) => {
        received = {
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          protocolVersion: request.headers["mcp-protocol-version"] as string,
          body,
        };
        const output = JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { tools: [] },
        });
        response.writeHead(202, {
          "content-type": "application/json",
          "mcp-session-id": "session-forwarded",
          "set-cookie": "upstream-secret=value",
          "content-length": Buffer.byteLength(output),
        });
        response.end(output);
      });
    });
    const events: HttpProxyEvent[] = [];
    let hookAuthorization: string | string[] | undefined;
    let hookCookie: string | string[] | undefined;
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/actual?configured=yes`,
      onEvent: (event) => events.push(event),
      responseMutation: {
        onResponse: (context) => {
          hookAuthorization = context.request.headers.authorization;
          hookCookie = context.headers["set-cookie"];
          assert.equal(context.streaming, false);
          return {
            statusCode: 203,
            headerChanges: { "x-agent-crash-test": "mutated" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: { tools: [], mutation: "observed" },
            }),
          };
        },
      },
    });

    try {
      const response = await fetch(`${proxy.url}?client=yes`, {
        method: "POST",
        headers: {
          authorization: "Bearer top-secret-token-123456",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-06-18",
        },
        body: rpcBody(),
      });
      assert.equal(response.status, 203);
      assert.equal(response.headers.get("mcp-session-id"), "session-forwarded");
      assert.equal(response.headers.get("x-agent-crash-test"), "mutated");
      assert.deepEqual(await response.json(), {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [], mutation: "observed" },
      });
      assert.deepEqual(received, {
        method: "POST",
        url: "/actual?configured=yes&client=yes",
        authorization: "Bearer top-secret-token-123456",
        protocolVersion: "2025-06-18",
        body: rpcBody(),
      });
      assert.equal(hookAuthorization, REDACTION_MARKER);
      assert.equal(hookCookie, REDACTION_MARKER);
      const requestEvent = events.find((event) => event.kind === "request");
      assert.equal(requestEvent?.headers?.authorization, REDACTION_MARKER);
      assert.equal(
        JSON.stringify(events).includes("top-secret-token-123456"),
        false,
      );
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test(
  "streams GET SSE sessions and exposes per-event mutation hooks",
  { skip: networkSkip },
  async () => {
    let receivedSession: string | undefined;
    const target = await localServer((request, response) => {
      receivedSession = request.headers["mcp-session-id"] as string;
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "mcp-session-id": "session-sse",
      });
      response.write("event: message\r\ndata: first\r\n\r\n");
      response.end("event: message\ndata: second\n\n");
    });
    const sequences: number[] = [];
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/mcp`,
      responseMutation: {
        onSseEvent: (context) => {
          sequences.push(context.sequence);
          if (context.sequence === 1)
            return { body: "event: message\ndata: changed\n\n" };
        },
      },
    });

    try {
      const response = await fetch(proxy.url, {
        headers: {
          accept: "text/event-stream",
          "mcp-session-id": "client-session",
        },
      });
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") ?? "",
        /text\/event-stream/,
      );
      assert.equal(response.headers.get("mcp-session-id"), "session-sse");
      assert.equal(receivedSession, "client-session");
      assert.equal(
        await response.text(),
        "event: message\ndata: changed\n\nevent: message\ndata: second\n\n",
      );
      assert.deepEqual(sequences, [1, 2]);
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test(
  "forwards DELETE session termination requests",
  { skip: networkSkip },
  async () => {
    let method: string | undefined;
    let session: string | undefined;
    const target = await localServer((request, response) => {
      method = request.method;
      session = request.headers["mcp-session-id"] as string;
      response.writeHead(204);
      response.end();
    });
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/mcp`,
    });
    try {
      const response = await fetch(proxy.url, {
        method: "DELETE",
        headers: { "mcp-session-id": "session-to-close" },
      });
      assert.equal(response.status, 204);
      assert.equal(method, "DELETE");
      assert.equal(session, "session-to-close");
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test(
  "returns a bounded 504 response when the upstream does not respond",
  { skip: networkSkip },
  async () => {
    const target = await localServer(() => {
      // Deliberately never produce response headers.
    });
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/mcp`,
      requestTimeoutMs: 80,
    });
    try {
      const started = Date.now();
      const response = await fetch(proxy.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rpcBody(),
      });
      assert.equal(response.status, 504);
      assert.ok(Date.now() - started < 1_000);
      assert.match(await response.text(), /timed out after 80ms/);
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test(
  "rejects malformed JSON-RPC before forwarding it upstream",
  { skip: networkSkip },
  async () => {
    let upstreamCalls = 0;
    const target = await localServer((_request, response) => {
      upstreamCalls += 1;
      response.end("unexpected");
    });
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/mcp`,
    });
    try {
      const malformed = await fetch(proxy.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      });
      assert.equal(malformed.status, 400);
      assert.equal(
        ((await malformed.json()) as { error: { code: number } }).error.code,
        -32700,
      );

      const invalidRpc = await fetch(proxy.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      });
      assert.equal(invalidRpc.status, 400);
      assert.equal(upstreamCalls, 0);
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test(
  "enforces request and buffered upstream response byte bounds",
  { skip: networkSkip },
  async () => {
    let upstreamCalls = 0;
    const target = await localServer((_request, response) => {
      upstreamCalls += 1;
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": "512",
      });
      response.end("x".repeat(512));
    });
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/mcp`,
      maxRequestBodyBytes: 100,
      maxResponseBodyBytes: 64,
    });
    try {
      const oversizedRequest = await fetch(proxy.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { value: "x".repeat(256) },
        }),
      });
      assert.equal(oversizedRequest.status, 413);
      assert.equal(upstreamCalls, 0);

      const oversizedResponse = await fetch(proxy.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rpcBody(),
      });
      assert.equal(oversizedResponse.status, 502);
      assert.match(
        await oversizedResponse.text(),
        /response exceeds the 64-byte limit/,
      );
      assert.equal(upstreamCalls, 1);
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test(
  "graceful shutdown aborts active SSE sessions and releases sockets",
  { skip: networkSkip },
  async () => {
    let upstreamClosedResolve: (() => void) | undefined;
    const upstreamClosed = new Promise<void>((resolve) => {
      upstreamClosedResolve = resolve;
    });
    const target = await localServer((request, response) => {
      request.once("close", () => upstreamClosedResolve?.());
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("event: message\ndata: open\n\n");
    });
    const proxy = await startHttpTransportProxy({
      targetUrl: `${target.url}/mcp`,
      shutdownGraceMs: 100,
    });

    try {
      const response = await fetch(proxy.url, {
        headers: { accept: "text/event-stream" },
      });
      assert.equal(response.status, 200);
      const reader = response.body!.getReader();
      const first = await reader.read();
      assert.equal(first.done, false);
      await proxy.close();
      await proxy.closed;
      await Promise.race([
        upstreamClosed,
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error("upstream SSE connection stayed open")),
            500,
          ),
        ),
      ]);
      await reader.cancel().catch(() => undefined);
    } finally {
      await proxy.close();
      await target.close();
    }
  },
);

test("defaults to loopback and refuses accidental remote binding or targets", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.255.1.9"), true);
  assert.equal(isLoopbackHostname("::1"), true);
  assert.equal(isLoopbackHostname("0.0.0.0"), false);
  assert.equal(isLoopbackHostname("example.com"), false);
  assert.throws(
    () =>
      resolveHttpTransportOptions({
        targetUrl: "https://example.com/mcp",
      }),
    (error: unknown) =>
      error instanceof HttpTransportConfigurationError &&
      /non-loopback target/.test(error.message),
  );
  assert.throws(
    () =>
      resolveHttpTransportOptions({
        targetUrl: "http://127.0.0.1:1/mcp",
        host: "0.0.0.0",
      }),
    /Refusing non-loopback bind address/,
  );

  const defaults = resolveHttpTransportOptions({
    targetUrl: "http://127.0.0.1:1/mcp",
  });
  assert.equal(defaults.host, "127.0.0.1");
  assert.equal(defaults.port, 0);
});

test(
  "actually listens on loopback when sockets are available",
  { skip: networkSkip },
  async () => {
    const proxy = await startHttpTransportProxy({
      targetUrl: "http://127.0.0.1:1/mcp",
    });
    try {
      assert.equal(proxy.address.address, "127.0.0.1");
      assert.match(proxy.url, /^http:\/\/127\.0\.0\.1:/);
    } finally {
      await proxy.close();
    }
  },
);
