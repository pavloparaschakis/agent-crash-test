"""Small dependency-free Python wrapper around the public CLI boundary.

Copy this module into a Python repository or replace it with a pytest fixture.
The JSON report, not terminal text, is the machine interface.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any


def run_pack(
    pack: str | Path,
    *,
    cli: str | Path | Sequence[str] = "agent-crash-test",
    cwd: str | Path | None = None,
) -> dict[str, Any]:
    """Run a pack and return its redacted JSON report.

    Assertion failures return a report with a non-zero CLI status so callers
    can inspect evidence before deciding whether to fail their own test.
    """

    with tempfile.TemporaryDirectory(prefix="agent-crash-test-python-") as directory:
        command = (
            [str(cli)]
            if isinstance(cli, (str, Path))
            else [str(part) for part in cli]
        )
        result = subprocess.run(
            [*command, "run", str(pack), "--format", "json", "--output", directory],
            cwd=cwd,
            check=False,
            text=True,
            capture_output=True,
        )
        reports = sorted(Path(directory).glob("*.json"))
        if not reports:
            raise RuntimeError(
                f"Agent Crash Test produced no JSON report (exit {result.returncode}): {result.stderr}"
            )
        report = json.loads(reports[0].read_text(encoding="utf-8"))
        report["_cli_returncode"] = result.returncode
        return report


def assert_pack(pack: str | Path, **kwargs: Any) -> dict[str, Any]:
    """Raise an AssertionError when the pack has execution errors or findings."""

    report = run_pack(pack, **kwargs)
    if report.get("executionError") or report.get("findings"):
        raise AssertionError(
            f"Agent Crash Test failed: {json.dumps(report.get('findings', []), indent=2)}"
        )
    return report
