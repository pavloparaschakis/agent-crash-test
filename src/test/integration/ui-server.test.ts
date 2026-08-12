import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startUiServer } from "../../ui-server.js";

interface ResponseSnapshot {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(
  port: number,
  requestPath: string,
  method = "GET",
): Promise<ResponseSnapshot> {
  return new Promise((resolve, reject) => {
    const call = http.request(
      {
        host: "127.0.0.1",
        port,
        path: requestPath,
        method,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    call.once("error", reject);
    call.end();
  });
}

test("UI server starts on loopback, serves reports, and shuts down", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "act-ui-"));
  await fs.writeFile(
    path.join(directory, "report.html"),
    "<!doctype html><title>Report</title>",
  );
  await fs.writeFile(path.join(directory, "result.json"), '{"ok":true}\n');
  await fs.writeFile(path.join(directory, "theme.css"), "body{}\n");
  await fs.writeFile(path.join(directory, "raw.bin"), Buffer.from([0, 1, 2]));

  let ui;
  try {
    ui = await startUiServer({ directory, port: 0, title: "Local <runs>" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      await fs.rm(directory, { recursive: true, force: true });
      t.skip(
        "loopback sockets are unavailable in this test environment (EPERM)",
      );
      return;
    }
    throw error;
  }
  t.after(async () => {
    await ui.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  assert.equal(ui.host, "127.0.0.1");
  assert.match(ui.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(ui.server.listening, true);

  const index = await request(ui.port, "/");
  assert.equal(index.status, 200);
  assert.match(index.headers["content-type"] ?? "", /^text\/html/);
  assert.match(index.body, /report\.html/);
  assert.match(index.body, /Local &lt;runs&gt;/);
  assert.match(index.body, /no telemetry/i);
  assert.equal(index.headers["x-content-type-options"], "nosniff");
  assert.match(
    String(index.headers["content-security-policy"] ?? ""),
    /connect-src 'none'/,
  );

  const html = await request(ui.port, "/report.html");
  assert.equal(html.status, 200);
  assert.equal(html.headers["content-type"], "text/html; charset=utf-8");
  assert.match(html.body, /<title>Report<\/title>/);

  const json = await request(ui.port, "/result.json");
  assert.equal(json.status, 200);
  assert.equal(json.headers["content-type"], "application/json; charset=utf-8");

  const css = await request(ui.port, "/theme.css");
  assert.equal(css.status, 200);
  assert.equal(css.headers["content-type"], "text/css; charset=utf-8");

  const binary = await request(ui.port, "/raw.bin");
  assert.equal(binary.status, 200);
  assert.equal(binary.headers["content-type"], "application/octet-stream");

  const head = await request(ui.port, "/report.html", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.equal(
    head.headers["content-length"],
    String(Buffer.byteLength(html.body)),
  );

  const method = await request(ui.port, "/report.html", "POST");
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, "GET, HEAD");

  const missing = await request(ui.port, "/missing.html");
  assert.equal(missing.status, 404);
  assert.doesNotMatch(missing.body, new RegExp(directory));

  await ui.close();
  assert.equal(ui.server.listening, false);
  await ui.close();
});

test("UI server rejects traversal, encoded traversal, and escaping symlinks", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "act-ui-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "act-ui-outside-"));
  await fs.writeFile(path.join(outside, "secret.txt"), "outside-secret");
  await fs.symlink(
    path.join(outside, "secret.txt"),
    path.join(directory, "escape.txt"),
  );

  let ui;
  try {
    ui = await startUiServer({ directory });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      await fs.rm(directory, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
      t.skip(
        "loopback sockets are unavailable in this test environment (EPERM)",
      );
      return;
    }
    throw error;
  }
  t.after(async () => {
    await ui.close();
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  for (const unsafe of [
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/%2e%2e%2fsecret.txt",
    "/..%2fsecret.txt",
    "/%5c..%5csecret.txt",
  ]) {
    const response = await request(ui.port, unsafe);
    assert.equal(response.status, 403, unsafe);
    assert.doesNotMatch(response.body, /outside-secret/);
  }

  const symlink = await request(ui.port, "/escape.txt");
  assert.equal(symlink.status, 403);
  assert.doesNotMatch(symlink.body, /outside-secret/);

  const malformed = await request(ui.port, "/%ZZ");
  assert.equal(malformed.status, 400);
});

test("UI server validates startup directory and port", async () => {
  const missing = path.join(os.tmpdir(), `act-ui-missing-${Date.now()}`);
  await assert.rejects(startUiServer({ directory: missing }), /ENOENT/);

  const fileDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "act-ui-file-"),
  );
  const file = path.join(fileDirectory, "report.html");
  await fs.writeFile(file, "report");
  await assert.rejects(
    startUiServer({ directory: file }),
    /existing directory/,
  );
  await assert.rejects(
    startUiServer({ directory: fileDirectory, port: 70_000 }),
    /0 to 65535/,
  );
  await fs.rm(fileDirectory, { recursive: true, force: true });
});
