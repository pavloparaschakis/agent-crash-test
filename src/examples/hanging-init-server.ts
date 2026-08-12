// Deliberately starts a child that never completes MCP initialization so the
// client lifecycle tests can prove initialization timeouts are bounded.
import fs from "node:fs/promises";

if (process.env.HANGING_INIT_PID_FILE)
  await fs.writeFile(
    process.env.HANGING_INIT_PID_FILE,
    String(process.pid),
    "utf8",
  );

setInterval(() => undefined, 1_000);
