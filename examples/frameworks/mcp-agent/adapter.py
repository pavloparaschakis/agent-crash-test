#!/usr/bin/env python3
"""mcp-agent to Agent Crash Test JSONL adapter example."""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any


ADAPTER = "mcp-agent-example"
RUN_ID = "mcp-agent-ambiguous-write"
HERE = Path(__file__).resolve().parent


def emit(record: dict[str, Any]) -> None:
    print(json.dumps(record, separators=(",", ":"), sort_keys=True), flush=True)


def start(determinism: str, real_client: bool) -> None:
    emit(
        {
            "type": "run_start",
            "run_id": RUN_ID,
            "adapter": ADAPTER,
            "adapter_version": "1.0.0",
            "protocol": "mcp-agent",
            "transport": "jsonl",
            "real_client": real_client,
            "physical_interception": True,
            "response_mutation": True,
            "state_observation": True,
            "determinism": determinism,
            "sandbox_required": False,
            "redaction_applied": True,
        }
    )


def snapshot(count: int, status: str) -> None:
    emit(
        {
            "type": "state_snapshot",
            "run_id": RUN_ID,
            "observer_id": "job-count",
            "source": "in-memory-job-store",
            "observer_status": status,
            "value": {"count": count},
            "redaction_applied": True,
        }
    )


def tool_call(operation_id: str, attempt: int) -> None:
    emit(
        {
            "type": "tool_call",
            "run_id": RUN_ID,
            "operation_id": operation_id,
            "tool": "enqueue_job",
            "arguments": {"request_id": "job-op-001", "task": "index-repository"},
            "attempt": attempt,
            "physical_call": True,
            "redaction_applied": True,
        }
    )


def tool_result(operation_id: str, lost: bool, deduplicated: bool = False) -> None:
    record: dict[str, Any] = {
        "type": "tool_result",
        "run_id": RUN_ID,
        "operation_id": operation_id,
        "tool": "enqueue_job",
        "status": "unknown" if lost else "success",
        "commit_status": "committed" if lost or not deduplicated else "not_committed",
        "response_status": "lost" if lost else "returned",
        "redaction_applied": True,
    }
    if lost:
        record["error"] = {
            "kind": "transport_error",
            "message": "response lost after enqueue committed",
            "retryable": True,
            "source": ADAPTER,
        }
    else:
        record["output"] = {"job_id": "J-1", "deduplicated": deduplicated}
    emit(record)


def offline(scenario: str) -> int:
    fixed = scenario == "fixed"
    start("deterministic", False)
    snapshot(0, "present")
    tool_call("enqueue-job-1", 1)
    emit(
        {
            "type": "mutation",
            "run_id": RUN_ID,
            "mutation_id": "commit-then-response-lost",
            "phase": "after_commit_before_response",
            "redaction_applied": True,
        }
    )
    tool_result("enqueue-job-1", lost=True)
    tool_call("enqueue-job-2", 2)
    tool_result("enqueue-job-2", lost=False, deduplicated=fixed)
    count = 1 if fixed else 2
    snapshot(count, "changed")
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
    available = importlib.util.find_spec("mcp_agent") is not None
    print(
        json.dumps(
            {
                "adapter": ADAPTER,
                "framework": "mcp-agent",
                "available": available,
                "status": "available" if available else "skipped",
                "reason": None if available else "install mcp-agent[openai] to enable real mode",
            },
            sort_keys=True,
        )
    )
    return 0


async def real(scenario: str, require_real: bool) -> int:
    if importlib.util.find_spec("mcp_agent") is None:
        print(json.dumps({"status": "skipped", "reason": "mcp-agent is not installed"}))
        return 2 if require_real else 0
    if not os.environ.get("OPENAI_API_KEY"):
        print(json.dumps({"status": "skipped", "reason": "OPENAI_API_KEY is not set"}))
        return 2 if require_real else 0

    from mcp_agent.agents.agent import Agent  # type: ignore[import-not-found]
    from mcp_agent.app import MCPApp  # type: ignore[import-not-found]
    from mcp_agent.workflows.llm.augmented_llm_openai import (  # type: ignore[import-not-found]
        OpenAIAugmentedLLM,
    )

    fixed = scenario == "fixed"
    jobs: list[dict[str, str]] = []
    completed: set[str] = set()
    attempts = 0

    async def enqueue_job(request_id: str, task: str) -> str:
        """Enqueue a job once; retries must reuse request_id."""
        nonlocal attempts
        attempts += 1
        operation_id = f"real-enqueue-{attempts}"
        tool_call(operation_id, attempts)
        if fixed and request_id in completed:
            tool_result(operation_id, lost=False, deduplicated=True)
            return json.dumps({"job_id": "J-1", "deduplicated": True})
        jobs.append({"job_id": f"J-{len(jobs) + 1}", "request_id": request_id})
        completed.add(request_id)
        if attempts == 1:
            tool_result(operation_id, lost=True)
            raise TimeoutError("response lost after commit; retry with the same request_id")
        tool_result(operation_id, lost=False)
        return json.dumps({"job_id": jobs[-1]["job_id"], "deduplicated": False})

    original_cwd = Path.cwd()
    os.chdir(HERE)
    start("nondeterministic", True)
    snapshot(0, "present")
    try:
        app = MCPApp(name="agent_crash_test_mcp_agent")
        async with app.run():
            agent = Agent(
                name="crash_test_job_agent",
                instruction=(
                    "Call enqueue_job with request_id job-op-001 and task index-repository. "
                    "Retry a transient timeout once with the same request_id."
                ),
                server_names=[],
                functions=[enqueue_job],
            )
            async with agent:
                llm = await agent.attach_llm(OpenAIAugmentedLLM)
                await llm.generate_str("Enqueue the requested repository indexing job.")
        status = "complete"
    except Exception as error:
        status = "inconclusive"
        print(f"real mode ended inconclusively: {type(error).__name__}: {error}", file=sys.stderr)
    finally:
        os.chdir(original_cwd)
    snapshot(len(jobs), "changed" if jobs else "present")
    contract_passed = len(jobs) == 1 and attempts >= 1
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
