import json
import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from runtime.api.models import AIRun, Base, ChatMessage, FeedbackEvent, JobCase
from runtime.services.badcase_service import BadcaseService


class BadcaseServiceTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.job = JobCase(company="测试公司", role="项目运营", workflow_data={})
        self.db.add(self.job)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_groups_multiple_feedback_events_by_run_and_loads_card_output(self):
        run = AIRun(
            job_case_id=self.job.id,
            workflow_name="InterviewPrep",
            status="success",
            input_summary="生成一面题目",
            run_data={"card_type": "InterviewPrep"},
            started_at=datetime(2026, 7, 31, 10, 0),
        )
        self.db.add(run)
        self.db.flush()
        self.db.add_all([
            FeedbackEvent(job_case_id=self.job.id, card_type="InterviewPrep", feedback="不相关", feedback_type="badcase_candidate", event_data={"ai_run_id": run.id, "feedback_category": "relevance"}),
            FeedbackEvent(job_case_id=self.job.id, card_type="InterviewPrep", feedback="太简单", feedback_type="badcase_candidate", event_data={"ai_run_id": run.id, "feedback_category": "difficulty"}),
            ChatMessage(job_case_id=self.job.id, role="agent", content=json.dumps({"card": {"content": "完整输出", "data": {"ai_run_id": run.id}}}, ensure_ascii=False)),
        ])
        self.db.commit()

        result = BadcaseService.list_badcases(self.db)

        self.assertEqual(result["summary"]["total"], 1)
        self.assertEqual(len(result["items"][0]["feedbacks"]), 2)
        self.assertIn("完整输出", result["items"][0]["original_output"])
        self.assertEqual(result["items"][0]["agent_key"], "interview")
        self.assertEqual(result["items"][0]["agent_display_name"], "面试准备智能体")
        self.assertEqual(result["summary"]["by_agent"]["interview"]["total"], 1)

    def test_accepted_feedback_is_ignored_and_failed_run_is_included(self):
        accepted_run = AIRun(job_case_id=self.job.id, workflow_name="JDAnalysis", status="success", run_data={}, started_at=datetime(2026, 7, 31, 9, 0))
        failed_run = AIRun(job_case_id=self.job.id, workflow_name="JobMatching", status="failed", error_message="schema error", run_data={}, started_at=datetime(2026, 7, 31, 11, 0))
        self.db.add_all([accepted_run, failed_run])
        self.db.flush()
        self.db.add(FeedbackEvent(job_case_id=self.job.id, feedback="有帮助", feedback_type="quality", event_data={"ai_run_id": accepted_run.id, "feedback_category": "user_accepted"}))
        self.db.commit()

        result = BadcaseService.list_badcases(self.db)

        self.assertEqual(result["summary"]["total"], 1)
        self.assertEqual(result["items"][0]["ai_run_id"], failed_run.id)
        self.assertEqual(result["items"][0]["primary_category"], "system_error")
        self.assertEqual(result["items"][0]["agent_name"], "Case Manager Agent")


if __name__ == "__main__":
    unittest.main()
