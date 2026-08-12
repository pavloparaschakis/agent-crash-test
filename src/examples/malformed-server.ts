// Deliberately emits an invalid MCP/JSON frame so the client lifecycle tests
// can prove malformed protocol output is bounded and classified.
import fs from "node:fs/promises";

if (process.env.MALFORMED_PID_FILE)
  await fs.writeFile(
    process.env.MALFORMED_PID_FILE,
    String(process.pid),
    "utf8",
  );

process.stdout.write("this is not a valid MCP message\n");
setInterval(() => undefined, 1_000);
