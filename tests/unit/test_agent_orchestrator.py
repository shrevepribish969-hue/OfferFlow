import unittest
from datetime import datetime

from runtime.services.agent_orchestrator import (
    build_match_conversation_summary,
    execution_intro,
    jd_conversation_reply,
    missing_context_reply,
    opening_suggestions,
    parse_application_update,
    welcome_message,
)


class AgentOrchestratorTests(unittest.TestCase):
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
        update = parse_application_update(message, datetime(2026, 8, 27, 10, 0))
        self.assertTrue(update["applied"])
        self.assertEqual(update["apply_time"], "2026-08-26")
        self.assertEqual(update["reminder_time"], "2026-08-28")

    def test_future_application_plan_does_not_mark_job_as_applied(self):
        update = parse_application_update(
            "提醒我明天投递这个岗位",
            datetime(2026, 8, 27, 10, 0),
        )
        self.assertFalse(update["applied"])
        self.assertEqual(update["reminder_time"], "2026-08-28")

    def test_case_opening_summarizes_job_without_presenting_a_workflow_card(self):
        analysis = {
            "job_level": "应届生",
            "job_family": "产品",
            "skills": [
                {"name": "产品思维"},
                {"name": "数据分析"},
                {"name": "AI 产品"},
                {"name": "微博生态"},
            ],
        }
        message = welcome_message("新浪&微博", "集团产品管培生", True, analysis)
        self.assertIn("新浪&微博 · 集团产品管培生", message)
        self.assertNotIn("**", message)
        self.assertIn("产品思维、数据分析、AI 产品", message)
        self.assertIn("你下一步更想解决什么", message)
        self.assertNotIn("JD 解析", message)

        reply = jd_conversation_reply("新浪&微博", "集团产品管培生", analysis)
        self.assertIn("直接优化简历", reply)
        self.assertNotIn("技能清单", reply)

    def test_match_result_has_a_conversational_summary_before_artifact(self):
        summary = build_match_conversation_summary({
            "score": 85,
            "must_skill_match": ["产品思维", "数据分析"],
            "missing_skills": ["微博生态经验"],
            "reason": "整体能力结构与岗位要求较接近。",
        })
        self.assertIn("综合匹配度约为 85%", summary)
        self.assertIn("产品思维、数据分析", summary)
        self.assertIn("微博生态经验", summary)

    def test_applied_case_suggestions_are_concrete_actions(self):
        suggestions = opening_suggestions(True)
        self.assertEqual(suggestions, ["查看投递记录", "修改提醒时间", "准备面试"])
        self.assertNotIn("继续问我", suggestions)


if __name__ == "__main__":
    unittest.main()
