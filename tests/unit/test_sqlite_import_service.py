import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from runtime.api import models
from runtime.services.sqlite_import_service import (
    SQLiteImportError,
    import_sqlite_bytes,
)


class SQLiteImportServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def source_payload(self) -> bytes:
        path = self.root / "source.db"
        engine = create_engine(f"sqlite:///{path}")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        with Session() as session:
            session.add(models.JobCase(id=7, company="测试公司", role="产品经理"))
            session.add(models.UserProfile(id=1, base_resume="{}", user_memory={}))
            session.commit()
        engine.dispose()
        return path.read_bytes()

    def target_session(self):
        engine = create_engine(f"sqlite:///{self.root / 'target.db'}")
        models.Base.metadata.create_all(engine)
        return engine, sessionmaker(bind=engine)()

    def test_imports_all_rows_into_empty_database(self):
        engine, session = self.target_session()
        try:
            counts = import_sqlite_bytes(session, self.source_payload())
            self.assertEqual(counts["job_cases"], 1)
            self.assertEqual(counts["user_profiles"], 1)
            self.assertEqual(session.get(models.JobCase, 7).company, "测试公司")
        finally:
            session.close()
            engine.dispose()

    def test_refuses_nonempty_destination_without_overwriting(self):
        engine, session = self.target_session()
        try:
            session.add(models.JobCase(id=99, company="云端数据", role="保留"))
            session.commit()
            with self.assertRaisesRegex(SQLiteImportError, "云端已有数据"):
                import_sqlite_bytes(session, self.source_payload())
            count = session.execute(
                select(func.count()).select_from(models.JobCase)
            ).scalar_one()
            self.assertEqual(count, 1)
            self.assertEqual(session.get(models.JobCase, 99).company, "云端数据")
        finally:
            session.close()
            engine.dispose()

    def test_rejects_non_sqlite_file(self):
        engine, session = self.target_session()
        try:
            with self.assertRaisesRegex(SQLiteImportError, "有效的 SQLite"):
                import_sqlite_bytes(session, b"not a database")
        finally:
            session.close()
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
