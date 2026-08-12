import fs from "node:fs/promises";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";

const LOOPBACK_HOST = "127.0.0.1";

export interface UiServerOptions {
  /** Existing directory containing generated reports. */
  directory: string;
  /** Use zero to request an available ephemeral port. */
  port?: number;
  title?: string;
}

export interface UiServerHandle {
  readonly host: typeof LOOPBACK_HOST;
  readonly port: number;
  readonly url: string;
  readonly server: Server;
  close(): Promise<void>;
}

class UnsafePathError extends Error {}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

export function contentTypeForPath(filePath: string): string {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function securityHeaders(contentType: string): http.OutgoingHttpHeaders {
  return {
    "cache-control": "no-store, max-age=0",
    "content-security-policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function sendText(
  response: ServerResponse,
  status: number,
  message: string,
  method = "GET",
): void {
  const body = `${message}\n`;
  response.writeHead(status, {
    ...securityHeaders("text/plain; charset=utf-8"),
    "content-length": Buffer.byteLength(body),
  });
  response.end(method === "HEAD" ? undefined : body);
}

function decodedPathname(request: IncomingMessage): string {
  const rawTarget = request.url ?? "/";
  const rawPath = rawTarget.split(/[?#]/, 1)[0] ?? "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new URIError("Malformed URL encoding");
  }
  if (!decoded.startsWith("/")) throw new URIError("Invalid request target");
  if (decoded.includes("\0") || decoded.includes("\\"))
    throw new UnsafePathError("Unsafe path");
  if (decoded.split("/").some((segment) => segment === ".."))
    throw new UnsafePathError("Unsafe path");
  return decoded;
}

function insideRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolveExistingFile(
  root: string,
  pathname: string,
): Promise<string> {
  const candidate = path.resolve(root, `.${pathname}`);
  if (!insideRoot(root, candidate)) throw new UnsafePathError("Unsafe path");
  const realCandidate = await fs.realpath(candidate);
  if (!insideRoot(root, realCandidate))
    throw new UnsafePathError("Resolved path leaves report directory");
  const stat = await fs.stat(realCandidate);
  if (!stat.isFile()) {
    const error = new Error("Not a file") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
  return realCandidate;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replaceAll("%2F", "/");
}

async function renderDirectoryIndex(
  root: string,
  title: string,
): Promise<string> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));
  const links = files.length
    ? files
        .map(
          (entry) =>
            `<li><a href="/${encodePathSegment(entry.name)}"><span>${escapeHtml(entry.name)}</span><small>${escapeHtml(contentTypeForPath(entry.name).split(";", 1)[0])}</small></a></li>`,
        )
        .join("\n")
    : '<li class="empty">No report files found.</li>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)}</title><style>
:root{color-scheme:dark;font-family:"IBM Plex Mono","Cascadia Mono",monospace;background:#0e1112;color:#ece9de}*{box-sizing:border-box}body{margin:0;padding:clamp(24px,7vw,84px);background:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),#0e1112;background-size:24px 24px;min-height:100vh}main{max-width:900px;margin:auto;border-top:5px solid #d9ff43;padding-top:24px}.eyebrow{color:#d9ff43;text-transform:uppercase;letter-spacing:.15em;font-size:.72rem}h1{font:500 clamp(2.6rem,8vw,6rem)/.9 "Iowan Old Style",Georgia,serif;letter-spacing:-.05em;margin:12px 0 42px}ul{padding:0;margin:0;list-style:none;border:1px solid #343a3c}li+li{border-top:1px solid #343a3c}a{display:flex;justify-content:space-between;gap:20px;padding:18px 20px;color:#ece9de;text-decoration:none;background:#171a1c}a:hover,a:focus-visible{color:#0e1112;background:#d9ff43;outline:none}small{opacity:.65}.empty{padding:28px;color:#98978f}.note{margin-top:24px;color:#98978f;font-size:.72rem}
</style></head><body><main><div class="eyebrow">Agent Crash Test / Local Reports</div><h1>${escapeHtml(title)}</h1><ul>${links}</ul><p class="note">Loopback-only · read-only · no telemetry · files are never uploaded</p></main></body></html>`;
}

async function serveFile(
  response: ServerResponse,
  method: string,
  filePath: string,
): Promise<void> {
  const file = await fs.open(filePath, "r");
  try {
    const stat = await file.stat();
    response.writeHead(200, {
      ...securityHeaders(contentTypeForPath(filePath)),
      "content-length": stat.size,
    });
    if (method === "HEAD") {
      response.end();
      return;
    }
    const stream = file.createReadStream({ autoClose: false });
    stream.on("error", () => response.destroy());
    stream.pipe(response);
    await new Promise<void>((resolve) => {
      response.once("finish", resolve);
      response.once("close", resolve);
    });
  } finally {
    await file.close().catch(() => undefined);
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  title: string,
): Promise<void> {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendText(response, 405, "Method not allowed", method);
    return;
  }

  let pathname: string;
  try {
    pathname = decodedPathname(request);
  } catch (error) {
    sendText(
      response,
      error instanceof UnsafePathError ? 403 : 400,
      error instanceof UnsafePathError ? "Forbidden" : "Bad request",
      method,
    );
    return;
  }

  if (pathname === "/") {
    const body = await renderDirectoryIndex(root, title);
    response.writeHead(200, {
      ...securityHeaders("text/html; charset=utf-8"),
      "content-length": Buffer.byteLength(body),
    });
    response.end(method === "HEAD" ? undefined : body);
    return;
  }

  try {
    await serveFile(
      response,
      method,
      await resolveExistingFile(root, pathname),
    );
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    if (error instanceof UnsafePathError) {
      sendText(response, 403, "Forbidden", method);
      return;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EACCES") {
      sendText(response, 404, "Not found", method);
      return;
    }
    throw error;
  }
}

/** Start a read-only report browser on the IPv4 loopback interface only. */
export async function startUiServer(
  options: UiServerOptions,
): Promise<UiServerHandle> {
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new RangeError("UI server port must be an integer from 0 to 65535");

  const root = await fs.realpath(options.directory);
  const stat = await fs.stat(root);
  if (!stat.isDirectory())
    throw new Error("UI server directory must be an existing directory");
  const title = options.title ?? "Crash-test reports";
  const server = http.createServer((request, response) => {
    void handleRequest(request, response, root, title).catch(() => {
      if (!response.headersSent)
        sendText(response, 500, "Internal server error", request.method);
      else response.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: LOOPBACK_HOST, port, exclusive: true });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("UI server did not expose a TCP address");
  }
  let closed = false;
  return {
    host: LOOPBACK_HOST,
    port: address.port,
    url: `http://${LOOPBACK_HOST}:${address.port}/`,
    server,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
