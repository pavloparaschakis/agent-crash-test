#!/usr/bin/env python3
"""Emit the same language-neutral case as jsonl-node-example.mjs."""

import json
import sys


records = [
    {
        "type": "run_start",
        "run_id": "example-python-run",
        "adapter": "python-example",
        "adapter_version": "1.0.0",
        "protocol": "mcp",
        "transport": "jsonl",
        "determinism": "partial",
        "physical_interception": True,
        "response_mutation": True,
        "state_observation": True,
        "redaction_applied": True,
    },
    {
        "type": "tool_call",
        "run_id": "example-python-run",
        "operation_id": "create-1",
        "tool": "create_issue",
        "arguments": {"title": "adapter example", "request_id": "req-1"},
        "physical_call": True,
        "redaction_applied": True,
    },
    {
        "type": "tool_result",
        "run_id": "example-python-run",
        "operation_id": "create-1",
        "status": "unknown",
        "commit_status": "committed",
        "response_status": "lost",
        "error": {
            "kind": "transport_error",
            "message": "response lost after commit",
            "retryable": True,
            "source": "example",
        },
        "redaction_applied": True,
    },
    {
        "type": "state_snapshot",
        "run_id": "example-python-run",
        "observer_id": "issues",
        "source": "test-db",
        "observer_status": "changed",
        "value": {"count": 1},
        "redaction_applied": True,
    },
    {
        "type": "run_end",
        "run_id": "example-python-run",
        "status": "complete",
        "redaction_applied": True,
    },
]

for record in records:
    print(json.dumps(record, separators=(",", ":")))
