import unittest
from datetime import datetime

from runtime.services.agent_orchestrator import (
    execution_intro,
    infer_explicit_workflow,
    missing_context_reply,
    parse_application_update,
)


class AgentOrchestratorTests(unittest.TestCase):
    def test_direct_resume_request_skips_matching(self):
        message = "这个岗位我一定会投，不用匹配，直接帮我优化简历"
        self.assertEqual(infer_explicit_workflow(message), "ResumeOptimization")

    def test_result_question_remains_conversational(self):
        self.assertIsNone(infer_explicit_workflow("为什么我的匹配分这么低？"))

    def test_skip_question_does_not_execute_before_confirmation(self):
        self.assertIsNone(infer_explicit_workflow("我可以跳过匹配直接优化简历吗？"))

    def test_can_route_independent_interview_request(self):
        self.assertEqual(infer_explicit_workflow("直接帮我准备一面"), "InterviewPrep")

    def test_resume_intro_explains_silent_prerequisite(self):
        reply = execution_intro("ResumeOptimization", {"has_jd_analysis": False})
        self.assertIn("跳过匹配", reply)
        self.assertIn("后台提取", reply)

    def test_missing_resume_asks_only_for_resume(self):
        reply = missing_context_reply(
            "ResumeOptimization",
            {"has_base_resume": False, "has_jd_content": True},
        )
        self.assertIn("只缺一项", reply)
        self.assertIn("基础简历", reply)

    def test_application_reminder_routes_and_parses_relative_dates(self):
        message = "我在昨天进行了投递，帮我记录并且在明天提醒我检查进度"
        self.assertEqual(infer_explicit_workflow(message), "UpdateJobCase")
        update = parse_application_update(message, datetime(2026, 8, 27, 10, 0))
        self.assertTrue(update["applied"])
        self.assertEqual(update["apply_time"], "2026-08-26")
        self.assertEqual(update["reminder_time"], "2026-08-28")


if __name__ == "__main__":
    unittest.main()
