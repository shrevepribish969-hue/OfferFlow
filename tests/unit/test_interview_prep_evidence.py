import unittest

from runtime.api.workflow_engine import SkillExecutor


class InterviewPrepEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.examples = [{
            "rag_question_id": "real-1",
            "question": "你如何推进跨部门项目？",
            "source": {"company": "示例公司", "documents": [{"document": "面经.pdf", "page": 3}]},
            "retrieval": {"score": 80, "reasons": ["匹配岗位"]},
        }]

    def test_attaches_only_explicit_rag_id(self):
        result = {"questions": [
            {"question_text": "为什么选择这个岗位？", "question_origin": "jd", "rag_question_id": None},
            {"question_text": "你如何推进跨部门项目？", "question_origin": "rag", "rag_question_id": "real-1"},
        ]}

        SkillExecutor._attach_rag_evidence(result, self.examples)

        self.assertNotIn("rag_evidence", result["questions"][0])
        self.assertEqual(result["questions"][1]["rag_evidence"]["question_id"], "real-1")

    def test_unknown_id_cannot_claim_a_source(self):
        question = {"rag_question_id": "invented", "rag_evidence": {"stale": True}}
        result = {"questions": [question]}

        SkillExecutor._attach_rag_evidence(result, self.examples)

        self.assertNotIn("rag_evidence", question)

    def test_normalizes_v57_optional_fields(self):
        result = {"questions": [{
            "question_text": "为什么选择这个岗位？",
            "recommended_example": {"answer": "示范回答"},
        }]}

        normalized = SkillExecutor._normalize_interview_prep_result(result)
        question = normalized["questions"][0]

        self.assertEqual(question["question_id"], "Q1")
        self.assertEqual(question["priority"], "must_prepare")
        self.assertIsNone(question["rag_question_id"])
        self.assertEqual(question["recommended_example"]["display_mode"], "collapsed_by_default")
        self.assertEqual(question["recommended_example"]["answer"], "示范回答")

    def test_legacy_answer_remains_available_as_collapsed_example(self):
        result = {"questions": [{
            "question_text": "介绍一个项目",
            "suggested_answer_star": "旧版STAR回答",
        }]}

        question = SkillExecutor._normalize_interview_prep_result(result)["questions"][0]

        self.assertEqual(question["recommended_example"]["answer"], "旧版STAR回答")
        self.assertEqual(question["recommended_example"]["display_mode"], "collapsed_by_default")


if __name__ == "__main__":
    unittest.main()
