"""One-time, guarded import of an OfferFlow SQLite database."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, JSON, func, insert, select, text
from sqlalchemy.orm import Session

from ..api import models


MAX_SQLITE_UPLOAD_BYTES = 15 * 1024 * 1024
SQLITE_HEADER = b"SQLite format 3\x00"


class SQLiteImportError(Exception):
    pass


def _source_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }


def _convert(value: Any, column: Any, table_name: str) -> Any:
    if value is None:
        return None
    if isinstance(column.type, JSON) and isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise SQLiteImportError(
                f"{table_name}.{column.name} 包含无效 JSON"
            ) from exc
    if isinstance(column.type, DateTime) and isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise SQLiteImportError(
                f"{table_name}.{column.name} 包含无效日期"
            ) from exc
    return value


def _read_rows(
    connection: sqlite3.Connection, table: Any
) -> list[dict[str, Any]]:
    quoted = table.name.replace('"', '""')
    source_columns = {
        str(row[1])
        for row in connection.execute(f'PRAGMA table_info("{quoted}")').fetchall()
    }
    if "id" not in source_columns:
        raise SQLiteImportError(f"本地数据库表 {table.name} 缺少 id 列")

    rows: list[dict[str, Any]] = []
    for source_row in connection.execute(f'SELECT * FROM "{quoted}"'):
        row: dict[str, Any] = {}
        for column in table.columns:
            if column.name in source_columns:
                row[column.name] = _convert(
                    source_row[column.name], column, table.name
                )
        rows.append(row)
    return rows


def _counts(session: Session) -> dict[str, int]:
    return {
        table.name: int(
            session.execute(select(func.count()).select_from(table)).scalar_one()
        )
        for table in models.Base.metadata.sorted_tables
    }


def _remove_blank_profile_placeholder(session: Session, counts: dict[str, int]) -> None:
    nonempty = {name: count for name, count in counts.items() if count}
    if nonempty != {"user_profiles": 1}:
        return
    profile = session.query(models.UserProfile).one()
    if not profile.base_resume and not profile.user_memory:
        session.delete(profile)
        session.flush()
        counts["user_profiles"] = 0


def _reset_sequence(session: Session, table: Any) -> None:
    if session.get_bind().dialect.name != "postgresql" or "id" not in table.c:
        return
    max_id = session.execute(select(func.max(table.c.id))).scalar_one()
    if max_id is None:
        return
    session.execute(
        text(
            "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
            ":max_id, true)"
        ),
        {"table_name": table.name, "max_id": int(max_id)},
    )


def import_sqlite_bytes(session: Session, payload: bytes) -> dict[str, int]:
    if not payload.startswith(SQLITE_HEADER):
        raise SQLiteImportError("文件不是有效的 SQLite 数据库")
    if len(payload) > MAX_SQLITE_UPLOAD_BYTES:
        raise SQLiteImportError("数据库文件超过 15 MB 限制")

    source = sqlite3.connect(":memory:")
    source.row_factory = sqlite3.Row
    try:
        source.deserialize(payload)
        available = _source_tables(source)
        required = {table.name for table in models.Base.metadata.sorted_tables}
        missing = sorted(required - available)
        if missing:
            raise SQLiteImportError("数据库缺少必要表：" + ", ".join(missing))

        source_rows = {
            table.name: _read_rows(source, table)
            for table in models.Base.metadata.sorted_tables
        }
        source_counts = {name: len(rows) for name, rows in source_rows.items()}

        destination_counts = _counts(session)
        _remove_blank_profile_placeholder(session, destination_counts)
        nonempty = {
            name: count for name, count in destination_counts.items() if count
        }
        if nonempty:
            details = ", ".join(
                f"{name}={count}" for name, count in sorted(nonempty.items())
            )
            raise SQLiteImportError(
                "云端已有数据，为防止覆盖已停止导入：" + details
            )

        for table in models.Base.metadata.sorted_tables:
            rows = source_rows[table.name]
            for start in range(0, len(rows), 500):
                session.execute(insert(table), rows[start : start + 500])
            _reset_sequence(session, table)

        imported_counts = _counts(session)
        if imported_counts != source_counts:
            raise SQLiteImportError("导入后的记录数量校验失败")
        session.commit()
        return imported_counts
    except Exception:
        session.rollback()
        raise
    finally:
        source.close()
