# Platform support

The v0.1 source release targets Node.js 20, 22, and 24 on Linux, macOS, and Windows. CI exercises all nine combinations before a public release claim is made.

The supported workflow is a local MCP stdio child or a credential-free fixture. Command strings use a deliberately small executable-plus-arguments parser; arbitrary shell syntax is not supported. The CLI and test scripts avoid Unix-only globbing and cleanup commands.

Normal stdio mode is not a network or filesystem sandbox. Run an untrusted server in a container, VM, or other external boundary that enforces the isolation you need. Windows/macOS support covers the runner, fixture client, report generation, and documented Action workflow; platform-specific server behavior remains the server author's responsibility.

Before each release, verify:

- `npm ci`, `npm run check`, and `npm run demo` from a clean checkout;
- path resolution, temporary directories, quoting, line endings, and UTF-8 output;
- child-process timeout and cleanup behavior;
- Markdown/JSON artifact names and overwrite behavior;
- Action execution on a GitHub-hosted runner.
