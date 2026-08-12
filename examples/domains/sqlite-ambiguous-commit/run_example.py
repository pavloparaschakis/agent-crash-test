#!/usr/bin/env python3
"""SQLite ambiguous-commit retry example using only the Python standard library."""

from __future__ import annotations

import argparse
import json
import sqlite3
import tempfile
from pathlib import Path


class ResponseLost(RuntimeError):
    """The transaction committed before the acknowledgement disappeared."""


def initialize(connection: sqlite3.Connection, idempotent: bool) -> None:
    uniqueness = " UNIQUE" if idempotent else ""
    connection.execute(
        f"""CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT{uniqueness} NOT NULL,
            sku TEXT NOT NULL,
            quantity INTEGER NOT NULL
        )"""
    )
    connection.commit()


def create_order(
    connection: sqlite3.Connection,
    request_id: str,
    idempotent: bool,
    lose_response: bool,
) -> dict[str, object]:
    statement = (
        "INSERT OR IGNORE INTO orders(request_id, sku, quantity) VALUES (?, ?, ?)"
        if idempotent
        else "INSERT INTO orders(request_id, sku, quantity) VALUES (?, ?, ?)"
    )
    cursor = connection.execute(statement, (request_id, "keyboard", 1))
    connection.commit()
    if lose_response:
        raise ResponseLost("transaction committed; acknowledgement was lost")
    row = connection.execute(
        "SELECT id, request_id, sku, quantity FROM orders WHERE request_id = ? ORDER BY id LIMIT 1",
        (request_id,),
    ).fetchone()
    return {"row_id": row[0], "inserted": cursor.rowcount == 1}


def run(database: Path, scenario: str) -> dict[str, object]:
    idempotent = scenario == "fixed"
    connection = sqlite3.connect(database)
    initialize(connection, idempotent)
    request_id = "checkout-2026-001"
    attempts = 0
    try:
        attempts += 1
        create_order(connection, request_id, idempotent, lose_response=True)
    except ResponseLost:
        attempts += 1
        retry = create_order(connection, request_id, idempotent, lose_response=False)
    rows = connection.execute(
        "SELECT id, request_id, sku, quantity FROM orders ORDER BY id"
    ).fetchall()
    connection.close()
    contract_passed = len(rows) == 1
    return {
        "example": "sqlite-ambiguous-commit",
        "scenario": scenario,
        "request_id": request_id,
        "attempts": attempts,
        "committed_rows": len(rows),
        "row_ids": [row[0] for row in rows],
        "retry_inserted": retry["inserted"],
        "contract": "one logical checkout creates exactly one committed order",
        "contract_passed": contract_passed,
        "database": str(database),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", choices=("broken", "fixed"), default="broken")
    parser.add_argument("--database", type=Path)
    args = parser.parse_args()
    if args.database:
        database = args.database.resolve()
        database.parent.mkdir(parents=True, exist_ok=True)
        if database.exists():
            database.unlink()
        result = run(database, args.scenario)
    else:
        with tempfile.TemporaryDirectory(prefix="agent-crash-test-sqlite-") as directory:
            result = run(Path(directory) / "orders.db", args.scenario)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["contract_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
