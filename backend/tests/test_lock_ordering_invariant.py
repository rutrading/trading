"""Static-analysis test: every code path that takes more than one
FOR UPDATE lock must do so in the order trading_account → order → holding.

The convention is declared at backend/app/services/trading.py:6-20. It is
enforced today only by code review; this test catches a future drift in
any router or task that violates the order and would otherwise silently
introduce a deadlock against `place_order` or `execute_fill`.

Mutually exclusive branches (if/elif/else) are walked separately so a
fill-vs-expire dispatch in `_process_open_orders` doesn't false-positive
across paths the runtime never combines.
"""

import ast
from pathlib import Path

ALLOWED_LOCK_ORDER = ["TradingAccount", "Order", "Holding"]
RANK = {name: i for i, name in enumerate(ALLOWED_LOCK_ORDER)}

ROOT = Path(__file__).resolve().parent.parent / "app"
FILES = [
    ROOT / "routers" / "orders.py",
    ROOT / "tasks" / "order_executor.py",
    ROOT / "services" / "trading.py",
]


def _lock_model(call: ast.Call) -> str | None:
    """If `call` is a `db.query(Model).<chain>.with_for_update()` chain,
    return Model's name; otherwise None.
    """
    func = call.func
    if not (isinstance(func, ast.Attribute) and func.attr == "with_for_update"):
        return None
    cursor: ast.AST = func.value
    while isinstance(cursor, ast.Call):
        cursor_func = cursor.func
        if isinstance(cursor_func, ast.Attribute) and cursor_func.attr == "query":
            if cursor.args and isinstance(cursor.args[0], ast.Name):
                return cursor.args[0].id
            return None
        if isinstance(cursor_func, ast.Attribute):
            cursor = cursor_func.value
        else:
            return None
    return None


def _collect_paths(body: list[ast.stmt]) -> list[list[str]]:
    """Walk a sequence of statements; return every distinct lock sequence
    a runtime path could observe. Branches contribute one path per arm.
    """
    paths: list[list[str]] = [[]]
    for stmt in body:
        if isinstance(stmt, ast.If):
            then_paths = _collect_paths(stmt.body)
            else_paths = _collect_paths(stmt.orelse) if stmt.orelse else [[]]
            paths = [p + b for p in paths for b in (then_paths + else_paths)]
        elif isinstance(stmt, (ast.For, ast.AsyncFor, ast.While)):
            inner = _collect_paths(stmt.body)
            paths = [p + b for p in paths for b in inner]
        elif isinstance(stmt, ast.Try):
            try_paths = _collect_paths(stmt.body)
            handler_paths = []
            for h in stmt.handlers:
                handler_paths.extend(_collect_paths(h.body))
            arms = try_paths + (handler_paths or [[]])
            paths = [p + b for p in paths for b in arms]
        else:
            locks: list[str] = []
            for sub in ast.walk(stmt):
                if isinstance(sub, ast.Call):
                    model = _lock_model(sub)
                    if model is not None:
                        locks.append(model)
            if locks:
                paths = [p + locks for p in paths]
    return paths


def test_lock_acquisition_order_is_account_then_order_then_holding():
    for path in FILES:
        tree = ast.parse(path.read_text())
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for sequence in _collect_paths(fn.body):
                ordered = [m for m in sequence if m in RANK]
                indices = [RANK[m] for m in ordered]
                assert indices == sorted(indices), (
                    f"{path.name}::{fn.name} acquires locks in {ordered} — "
                    f"violates {' → '.join(ALLOWED_LOCK_ORDER)} ordering"
                )
