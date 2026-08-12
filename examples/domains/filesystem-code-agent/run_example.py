#!/usr/bin/env python3
"""Deterministic code-agent retry example with a real local filesystem effect."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path


BLOCK = """# agent-generated: add-health-check
def health_check() -> str:
    return \"ok\"
"""


class ResponseLost(RuntimeError):
    """The write committed, but the agent did not receive the response."""


class CodeWorkspace:
    def __init__(self, root: Path, idempotent: bool) -> None:
        self.root = root
        self.idempotent = idempotent
        self.source = root / "service.py"
        self.ledger = root / ".agent-operations.json"
        self.physical_writes = 0
        root.mkdir(parents=True, exist_ok=True)
        self.source.write_text("def existing() -> str:\n    return \"ready\"\n", encoding="utf-8")
        if self.ledger.exists():
            self.ledger.unlink()

    def apply_change(self, operation_id: str, lose_response: bool) -> dict[str, object]:
        completed = self._completed_operations()
        if self.idempotent and operation_id in completed:
            return {"deduplicated": True, "operation_id": operation_id}

        with self.source.open("a", encoding="utf-8") as handle:
            handle.write("\n" + BLOCK)
        self.physical_writes += 1

        if self.idempotent:
            completed.add(operation_id)
            self.ledger.write_text(json.dumps(sorted(completed)), encoding="utf-8")
        if lose_response:
            raise ResponseLost("write committed; acknowledgement was lost")
        return {"deduplicated": False, "operation_id": operation_id}

    def _completed_operations(self) -> set[str]:
        if not self.ledger.exists():
            return set()
        return set(json.loads(self.ledger.read_text(encoding="utf-8")))


def run(root: Path, scenario: str) -> dict[str, object]:
    workspace = CodeWorkspace(root, idempotent=scenario == "fixed")
    operation_id = "edit-health-check-v1"
    attempts = 0
    response_lost = False
    try:
        attempts += 1
        workspace.apply_change(operation_id, lose_response=True)
    except ResponseLost:
        response_lost = True
        attempts += 1
        workspace.apply_change(operation_id, lose_response=False)

    source = workspace.source.read_text(encoding="utf-8")
    generated_blocks = source.count("# agent-generated: add-health-check")
    duplicate_definitions = max(0, source.count("def health_check()") - 1)
    contract_passed = generated_blocks == 1 and duplicate_definitions == 0
    return {
        "example": "filesystem-code-agent",
        "scenario": scenario,
        "response_lost_after_commit": response_lost,
        "logical_operation_id": operation_id,
        "attempts": attempts,
        "physical_writes": workspace.physical_writes,
        "generated_blocks": generated_blocks,
        "duplicate_definitions": duplicate_definitions,
        "contract": "the generated code change is present exactly once",
        "contract_passed": contract_passed,
        "workspace": str(root),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", choices=("broken", "fixed"), default="broken")
    parser.add_argument("--workspace", type=Path)
    args = parser.parse_args()
    if args.workspace:
        result = run(args.workspace.resolve(), args.scenario)
    else:
        with tempfile.TemporaryDirectory(prefix="agent-crash-test-code-") as directory:
            result = run(Path(directory), args.scenario)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["contract_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
