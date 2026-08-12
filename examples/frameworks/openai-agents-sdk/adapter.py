#!/usr/bin/env python3
"""OpenAI Agents SDK to Agent Crash Test JSONL adapter example.

Offline mode is deterministic and dependency-free. Real mode imports and runs
the official ``openai-agents`` package only when explicitly requested.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import sys
from typing import Any


ADAPTER = "openai-agents-sdk-example"
RUN_ID = "openai-agents-sdk-ambiguous-write"


def emit(record: dict[str, Any]) -> None:
    print(json.dumps(record, separators=(",", ":"), sort_keys=True), flush=True)


def started(determinism: str, real_client: bool) -> dict[str, Any]:
    return {
        "type": "run_start",
        "run_id": RUN_ID,
        "adapter": ADAPTER,
        "adapter_version": "1.0.0",
        "protocol": "openai-agents-python",
        "transport": "jsonl",
        "real_client": real_client,
        "physical_interception": True,
        "response_mutation": True,
        "state_observation": True,
        "determinism": determinism,
        "sandbox_required": False,
        "redaction_applied": True,
    }


def call(operation_id: str, attempt: int) -> dict[str, Any]:
    return {
        "type": "tool_call",
        "run_id": RUN_ID,
        "operation_id": operation_id,
        "tool": "create_ticket",
        "arguments": {"request_id": "ticket-op-001", "title": "Investigate retry"},
        "attempt": attempt,
        "physical_call": True,
        "redaction_applied": True,
    }


def result(operation_id: str, lost: bool, deduplicated: bool = False) -> dict[str, Any]:
    if lost:
        return {
            "type": "tool_result",
            "run_id": RUN_ID,
            "operation_id": operation_id,
            "tool": "create_ticket",
            "status": "unknown",
            "commit_status": "committed",
            "response_status": "lost",
            "error": {
                "kind": "transport_error",
                "message": "response lost after the ticket committed",
                "retryable": True,
                "source": ADAPTER,
            },
            "redaction_applied": True,
        }
    return {
        "type": "tool_result",
        "run_id": RUN_ID,
        "operation_id": operation_id,
        "tool": "create_ticket",
        "status": "success",
        "commit_status": "not_committed" if deduplicated else "committed",
        "response_status": "returned",
        "output": {"ticket_id": "T-1", "deduplicated": deduplicated},
        "redaction_applied": True,
    }


def snapshot(count: int, status: str) -> dict[str, Any]:
    return {
        "type": "state_snapshot",
        "run_id": RUN_ID,
        "observer_id": "ticket-count",
        "source": "in-memory-ticket-store",
        "observer_status": status,
        "value": {"count": count},
        "redaction_applied": True,
    }


def offline(scenario: str) -> int:
    fixed = scenario == "fixed"
    emit(started("deterministic", False))
    emit(snapshot(0, "present"))
    emit(call("create-ticket-1", 1))
    emit(
        {
            "type": "mutation",
            "run_id": RUN_ID,
            "mutation_id": "commit-then-response-lost",
            "phase": "after_commit_before_response",
            "redaction_applied": True,
        }
    )
    emit(result("create-ticket-1", lost=True))
    emit(call("create-ticket-2", 2))
    emit(result("create-ticket-2", lost=False, deduplicated=fixed))
    count = 1 if fixed else 2
    emit(snapshot(count, "changed"))
    emit(
        {
            "type": "run_end",
            "run_id": RUN_ID,
            "status": "complete" if count == 1 else "failed",
            "redaction_applied": True,
        }
    )
    return 0 if count == 1 else 1


def check() -> int:
    available = importlib.util.find_spec("agents") is not None
    print(
        json.dumps(
            {
                "adapter": ADAPTER,
                "framework": "openai-agents",
                "available": available,
                "status": "available" if available else "skipped",
                "reason": None if available else "install openai-agents to enable real mode",
            },
            sort_keys=True,
        )
    )
    return 0


async def real(scenario: str, require_real: bool) -> int:
    if importlib.util.find_spec("agents") is None:
        print(json.dumps({"status": "skipped", "reason": "openai-agents is not installed"}))
        return 2 if require_real else 0
    if not os.environ.get("OPENAI_API_KEY"):
        print(json.dumps({"status": "skipped", "reason": "OPENAI_API_KEY is not set"}))
        return 2 if require_real else 0

    from agents import Agent, Runner, function_tool  # type: ignore[import-not-found]

    fixed = scenario == "fixed"
    tickets: list[dict[str, str]] = []
    completed: set[str] = set()
    attempts = 0

    @function_tool
    async def create_ticket(request_id: str, title: str) -> str:
        """Create one ticket; always reuse request_id when retrying."""
        nonlocal attempts
        attempts += 1
        operation_id = f"real-create-ticket-{attempts}"
        emit(call(operation_id, attempts))
        if fixed and request_id in completed:
            emit(result(operation_id, lost=False, deduplicated=True))
            return json.dumps({"ticket_id": "T-1", "deduplicated": True})
        tickets.append({"ticket_id": f"T-{len(tickets) + 1}", "request_id": request_id})
        completed.add(request_id)
        if attempts == 1:
            emit(result(operation_id, lost=True))
            raise TimeoutError("response lost after commit; retry with the same request_id")
        emit(result(operation_id, lost=False))
        return json.dumps({"ticket_id": tickets[-1]["ticket_id"], "deduplicated": False})

    emit(started("nondeterministic", True))
    emit(snapshot(0, "present"))
    agent = Agent(
        name="Crash-test ticket agent",
        instructions=(
            "Call create_ticket with request_id ticket-op-001 and title Investigate retry. "
            "If the tool reports a transient timeout, retry once with exactly the same request_id."
        ),
        tools=[create_ticket],
    )
    try:
        await Runner.run(agent, "Create the requested ticket and recover from an uncertain outcome.", max_turns=5)
        status = "complete"
    except Exception as error:  # A real provider/framework error is evidence, not a silent pass.
        status = "inconclusive"
        print(f"real mode ended inconclusively: {type(error).__name__}: {error}", file=sys.stderr)
    emit(snapshot(len(tickets), "changed" if tickets else "present"))
    contract_passed = len(tickets) == 1 and attempts >= 1
    emit(
        {
            "type": "run_end",
            "run_id": RUN_ID,
            "status": status if status == "inconclusive" else ("complete" if contract_passed else "failed"),
            "redaction_applied": True,
        }
    )
    if status == "inconclusive":
        return 2
    return 0 if contract_passed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("offline", "check", "real"), default="offline")
    parser.add_argument("--scenario", choices=("broken", "fixed"), default="broken")
    parser.add_argument("--require-real", action="store_true")
    args = parser.parse_args()
    if args.mode == "check":
        return check()
    if args.mode == "offline":
        return offline(args.scenario)
    return asyncio.run(real(args.scenario, args.require_real))


if __name__ == "__main__":
    raise SystemExit(main())
