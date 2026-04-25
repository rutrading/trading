"""Drift guard for the transaction kind enum duplicated across Python and TS.

Both `backend/app/db/models.py` and `web/src/db/schema.ts` declare the
`transaction_kind` Postgres enum. SQLite ignores enum constraints, so a
backend test against the SQLite-backed test DB cannot detect drift; this
static check parses the TS source and compares to the SQLAlchemy enum's
values directly.
"""

import re
from pathlib import Path

from app.db.models import transaction_kind_enum

_TS_PATH = Path(__file__).parents[2] / "web/src/db/schema.ts"


def test_ts_transaction_kind_enum_matches_python() -> None:
    text = _TS_PATH.read_text()
    block = re.search(
        r'transactionKindEnum\s*=\s*pgEnum\(\s*"transaction_kind"\s*,'
        r"\s*\[(.*?)\]\s*\)",
        text,
        re.DOTALL,
    )
    assert block is not None, (
        "Could not locate transactionKindEnum declaration in schema.ts; "
        "the regex needs updating."
    )
    ts_values = set(re.findall(r'"(\w+)"', block.group(1)))
    py_values = set(transaction_kind_enum.enums)
    assert ts_values == py_values, (
        "transaction_kind enum drifted between Python and TS. "
        f"Only in TS: {sorted(ts_values - py_values)}. "
        f"Only in Python: {sorted(py_values - ts_values)}."
    )
