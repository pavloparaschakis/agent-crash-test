# Filesystem/code-agent duplicate change

This example reproduces a failure that can occur when a coding agent writes a
file successfully, loses the acknowledgement, and retries the edit. The broken
implementation appends the generated function twice. The fixed implementation
records the logical operation ID beside the workspace and deduplicates the
retry.

It uses only Python's standard library, creates an isolated temporary workspace
by default, performs no network access, and needs no credentials.

```bash
# Expected exit 1: two physical writes create a duplicate definition.
python3 examples/domains/filesystem-code-agent/run_example.py --scenario broken

# Expected exit 0: the retry reuses the operation ID and produces one block.
python3 examples/domains/filesystem-code-agent/run_example.py --scenario fixed
```

Pass `--workspace ./scratch/code-agent-demo` to preserve the resulting files for
inspection. Do not point that option at a real source tree: the script
initializes `service.py` in the selected directory.

The contract is deliberately effect-level: `health_check` must exist exactly
once. A successful API call or a two-attempt trace cannot establish that fact;
the observer reads the committed file.
