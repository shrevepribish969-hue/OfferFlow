"""Safely migrate an OfferFlow SQLite database to an empty PostgreSQL database.

The destination URL is requested with hidden input by default so credentials do
not end up in shell history. The migration refuses to write to a destination
that already contains OfferFlow data.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, JSON, create_engine, func, insert, select, text
from sqlalchemy.engine import URL, make_url

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from runtime.api.models import Base  # noqa: E402


DATABASE_URL_ENV = "OFFERFLOW_DATABASE_URL"

if os.name == "nt":
    # Keep Chinese status output readable in PowerShell and captured CI logs.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="将 OfferFlow SQLite 数据安全迁移到空的 Render PostgreSQL 数据库。"
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=PROJECT_ROOT / "offerflow.db",
        help="本地 SQLite 文件（默认：项目根目录下的 offerflow.db）",
    )
    parser.add_argument(
        "--database-url",
        help=(
            "目标 PostgreSQL URL。不建议直接使用此参数，因为可能进入命令历史；"
            f"优先使用隐藏输入或环境变量 {DATABASE_URL_ENV}。"
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只检查本地数据库并显示记录数量，不连接 Render。",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="跳过 MIGRATE 确认（仅用于自动化）。",
    )
    return parser.parse_args()


def open_source_read_only(path: Path) -> sqlite3.Connection:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"找不到本地数据库：{resolved}")
    connection = sqlite3.connect(
        f"file:{resolved.as_posix()}?mode=ro",
        uri=True,
    )
    connection.row_factory = sqlite3.Row
    return connection


def source_table_names(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).fetchall()
    return {str(row[0]) for row in rows}


def source_counts(connection: sqlite3.Connection) -> dict[str, int]:
    available = source_table_names(connection)
    counts: dict[str, int] = {}
    for table in Base.metadata.sorted_tables:
        if table.name not in available:
            raise RuntimeError(f"本地数据库缺少表：{table.name}")
        quoted_name = table.name.replace('"', '""')
        counts[table.name] = int(
            connection.execute(
                f'SELECT COUNT(1) FROM "{quoted_name}"'
            ).fetchone()[0]
        )
    return counts


def print_counts(title: str, counts: dict[str, int]) -> None:
    print(f"\n{title}")
    for table in Base.metadata.sorted_tables:
        print(f"  {table.name:<20} {counts.get(table.name, 0):>6}")
    print(f"  {'合计':<20} {sum(counts.values()):>6}")


def normalize_postgres_url(raw_url: str) -> URL:
    value = raw_url.strip()
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://") :]
    url = make_url(value)
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")
    if url.drivername != "postgresql+psycopg":
        raise ValueError("目标必须是 PostgreSQL 地址，而不是 SQLite 地址。")
    return url


def destination_url(args: argparse.Namespace) -> URL:
    raw_url = args.database_url or os.getenv(DATABASE_URL_ENV)
    if not raw_url:
        raw_url = getpass.getpass("粘贴 Render External Database URL（输入会隐藏）：")
    if not raw_url.strip():
        raise ValueError("数据库地址不能为空。")
    return normalize_postgres_url(raw_url)


def convert_value(value: Any, column: Any, table_name: str) -> Any:
    if value is None:
        return None
    if isinstance(column.type, JSON) and isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"{table_name}.{column.name} 包含无效 JSON。"
            ) from exc
    if isinstance(column.type, DateTime) and isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(
                f"{table_name}.{column.name} 包含无效日期：{value!r}"
            ) from exc
    return value


def read_source_rows(
    connection: sqlite3.Connection, table: Any
) -> list[dict[str, Any]]:
    quoted_name = table.name.replace('"', '""')
    source_columns = {
        str(row[1])
        for row in connection.execute(
            f'PRAGMA table_info("{quoted_name}")'
        ).fetchall()
    }
    if "id" not in source_columns:
        raise RuntimeError(f"本地表 {table.name} 缺少 id 列。")

    rows: list[dict[str, Any]] = []
    for source_row in connection.execute(f'SELECT * FROM "{quoted_name}"'):
        converted: dict[str, Any] = {}
        for column in table.columns:
            if column.name in source_columns:
                converted[column.name] = convert_value(
                    source_row[column.name], column, table.name
                )
        rows.append(converted)
    return rows


def target_counts(connection: Any) -> dict[str, int]:
    return {
        table.name: int(
            connection.execute(select(func.count()).select_from(table)).scalar_one()
        )
        for table in Base.metadata.sorted_tables
    }


def reset_postgres_sequence(connection: Any, table: Any) -> None:
    if "id" not in table.c:
        return
    max_id = connection.execute(select(func.max(table.c.id))).scalar_one()
    if max_id is None:
        return
    connection.execute(
        text(
            "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
            ":max_id, true)"
        ),
        {"table_name": table.name, "max_id": int(max_id)},
    )


def migrate(source: sqlite3.Connection, postgres_url: URL) -> None:
    try:
        engine = create_engine(postgres_url, pool_pre_ping=True)
    except ModuleNotFoundError as exc:
        if exc.name in {"psycopg", "psycopg_binary"}:
            raise RuntimeError(
                '缺少 PostgreSQL 驱动，请先运行：pip install "psycopg[binary]>=3.2,<4"'
            ) from exc
        raise

    with engine.begin() as destination:
        Base.metadata.create_all(bind=destination)
        before = target_counts(destination)
        nonempty = {name: count for name, count in before.items() if count}
        if nonempty:
            details = ", ".join(f"{name}={count}" for name, count in nonempty.items())
            raise RuntimeError(
                "Render 数据库不是空库，已安全停止，未写入任何数据：" + details
            )

        for table in Base.metadata.sorted_tables:
            rows = read_source_rows(source, table)
            for start in range(0, len(rows), 500):
                destination.execute(insert(table), rows[start : start + 500])
            reset_postgres_sequence(destination, table)

        after = target_counts(destination)
        expected = source_counts(source)
        if after != expected:
            raise RuntimeError(
                "迁移后数量校验失败，事务将回滚。"
                f"本地={expected}，Render={after}"
            )

    engine.dispose()
    print_counts("Render 迁移后记录数", after)
    print("\n迁移成功。所有表的记录数量均已校验。")


def sanitized_error(exc: Exception, url: URL | None) -> str:
    message = str(exc)
    if url is not None:
        rendered = url.render_as_string(hide_password=False)
        message = message.replace(rendered, "<数据库地址已隐藏>")
        if url.password:
            message = message.replace(url.password, "<密码已隐藏>")
    return message


def main() -> int:
    args = parse_args()
    postgres_url: URL | None = None
    try:
        with open_source_read_only(args.source) as source:
            counts = source_counts(source)
            print(f"本地数据库：{args.source.expanduser().resolve()}")
            print_counts("本地待迁移记录数", counts)
            if args.dry_run:
                print("\n只读检查完成；没有连接或修改 Render 数据库。")
                return 0

            postgres_url = destination_url(args)
            print(
                "\n目标："
                + postgres_url.render_as_string(hide_password=True)
            )
            print("保护策略：目标库只要存在 OfferFlow 数据就会自动停止。")
            if not args.yes:
                confirmation = input("输入 MIGRATE 开始迁移：").strip()
                if confirmation != "MIGRATE":
                    print("已取消；没有修改 Render 数据库。")
                    return 1
            migrate(source, postgres_url)
        return 0
    except (FileNotFoundError, RuntimeError, ValueError, sqlite3.Error) as exc:
        print(f"\n迁移失败：{sanitized_error(exc, postgres_url)}", file=sys.stderr)
        return 1
    except Exception as exc:  # Keep credentials out of unexpected driver errors.
        print(f"\n迁移失败：{sanitized_error(exc, postgres_url)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
