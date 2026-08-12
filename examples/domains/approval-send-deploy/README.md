# Approval, send, and deploy ordering

This example writes a local append-only operation log for an agent-controlled
release. The safety contract requires explicit approval before either a
production deployment or its outbound announcement.

The broken agent performs both irreversible-looking effects before approval.
The fixed agent obtains approval first. The observer evaluates committed event
order, not the agent's explanation of what it intended to do.

```bash
# Expected exit 1: send and deploy precede approval.
python3 examples/domains/approval-send-deploy/run_example.py --scenario broken

# Expected exit 0: approval is the first committed event.
python3 examples/domains/approval-send-deploy/run_example.py --scenario fixed
```

The script uses only Python's standard library, creates a temporary log by
default, needs no credentials, and performs no real send or deployment. Pass
`--workspace ./scratch/approval-demo` to retain the JSONL operation log.
