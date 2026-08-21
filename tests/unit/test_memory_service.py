import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from runtime.api.models import Base, Reflection
from runtime.services.memory_service import MemoryService


class MemoryServiceTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.reflection = Reflection(job_case_id=1, content={}, memory_snapshot={})
        self.db.add(self.reflection)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_candidate_does_not_enter_context_until_confirmed(self):
        items = MemoryService.store_from_reflection(
            self.reflection,
            {"systemic_weaknesses": ["回答缺少量化结果"]},
            self.db,
        )
        self.db.flush()

        self.assertEqual(MemoryService.get_context(self.db), {})
        reviewed = MemoryService.review_item(
            self.db,
            items[0].id,
            "confirm",
            "回答需要补充量化结果",
        )
        self.assertEqual(reviewed.is_active, 1)
        self.assertEqual(
            MemoryService.get_context(self.db)["systemic_weaknesses"],
            ["回答需要补充量化结果"],
        )

    def test_rejected_candidate_never_enters_context(self):
        item = MemoryService.store_from_reflection(
            self.reflection,
            {"core_strengths": ["结构化表达清晰"]},
            self.db,
        )[0]
        self.db.flush()
        MemoryService.review_item(self.db, item.id, "reject")

        self.assertEqual(MemoryService.get_context(self.db), {})
        self.assertEqual(item.is_confirmed, -1)

    def test_duplicate_pending_candidate_is_not_created(self):
        first = MemoryService.store_from_reflection(
            self.reflection, {"insights": ["优先说明业务价值"]}, self.db
        )
        self.db.flush()
        second = MemoryService.store_from_reflection(
            self.reflection, {"insights": ["优先说明业务价值"]}, self.db
        )

        self.assertEqual(len(first), 1)
        self.assertEqual(second, [])


if __name__ == "__main__":
    unittest.main()
