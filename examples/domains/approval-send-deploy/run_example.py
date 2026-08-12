#!/usr/bin/env python3
"""Deterministic approval ordering example with local send/deploy effects."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path


def append_event(log: Path, sequence: int, action: str) -> None:
    with log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"sequence": sequence, "action": action}) + "\n")


def run(root: Path, scenario: str) -> dict[str, object]:
    root.mkdir(parents=True, exist_ok=True)
    log = root / "operations.jsonl"
    if log.exists():
        log.unlink()
    actions = (
        ["send_release_notice", "deploy_production", "approve_release"]
        if scenario == "broken"
        else ["approve_release", "deploy_production", "send_release_notice"]
    )
    for sequence, action in enumerate(actions, start=1):
        append_event(log, sequence, action)

    events = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    positions = {event["action"]: event["sequence"] for event in events}
    forbidden = [
        action
        for action in ("deploy_production", "send_release_notice")
        if positions[action] < positions["approve_release"]
    ]
    contract_passed = not forbidden
    return {
        "example": "approval-send-deploy",
        "scenario": scenario,
        "events": events,
        "forbidden_preapproval_effects": forbidden,
        "contract": "approval must precede both production deployment and notification",
        "contract_passed": contract_passed,
        "operation_log": str(log),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", choices=("broken", "fixed"), default="broken")
    parser.add_argument("--workspace", type=Path)
    args = parser.parse_args()
    if args.workspace:
        result = run(args.workspace.resolve(), args.scenario)
    else:
        with tempfile.TemporaryDirectory(prefix="agent-crash-test-approval-") as directory:
            result = run(Path(directory), args.scenario)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["contract_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
