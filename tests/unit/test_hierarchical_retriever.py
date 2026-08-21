import unittest

from runtime.services.hierarchical_retriever import HierarchicalRetriever


class StubSemanticRetriever(HierarchicalRetriever):
    def _semantic_scores(self, query_text: str, top_n: int):
        self.last_query = query_text
        return {2: 1.0}


class HierarchicalRetrieverTest(unittest.TestCase):
    def setUp(self):
        self.questions = [
            {
                "question": "如何设计产品指标体系？",
                "question_hash": "metrics",
                "duplicate_count": 3,
                "companies": ["腾讯"],
                "primary_role": "产品经理",
                "category": "数据分析",
                "sources": [{"document": "面经.pdf", "page": 12}],
            },
            {
                "question": "如何处理一次跨部门协作冲突？",
                "question_hash": "collaboration",
                "duplicate_count": 1,
                "companies": ["美团"],
                "primary_role": "运营",
                "category": "项目",
                "sources": [{"document": "面经.pdf", "page": 20}],
            },
            {
                "question": "如何评估一个 AI Agent 产品？",
                "question_hash": "agent",
                "duplicate_count": 1,
                "companies": ["字节跳动"],
                "primary_role": "AI 产品经理",
                "category": "产品设计",
                "sources": [{"document": "AI面经.pdf", "page": 8}],
            },
        ]

    def test_uses_current_jd_skills_schema_and_preserves_sources(self):
        retriever = HierarchicalRetriever(enable_semantic=False)
        retriever.kb_data = self.questions

        result = retriever.retrieve(
            {"skills": [{"name": "数据分析", "importance": "must"}]},
            target_company="腾讯",
            target_role="产品经理",
            top_k=1,
        )

        self.assertEqual(result[0]["question_hash"], "metrics")
        self.assertEqual(result[0]["sources"][0]["page"], 12)
        self.assertIn("metadata_company", result[0]["_retrieval_layers"])
        self.assertTrue(result[0]["_retrieval_reasons"])
        self.assertGreater(result[0]["_retrieval_score"], 0)

    def test_semantic_results_join_the_hybrid_ranking(self):
        retriever = StubSemanticRetriever(enable_semantic=True)
        retriever.kb_data = self.questions

        result = retriever.retrieve(
            {"skills": [{"name": "智能体评估", "importance": "must"}]},
            target_company="",
            target_role="",
            top_k=2,
        )

        semantic_question = next(item for item in result if item["question_hash"] == "agent")
        self.assertIn("semantic", semantic_question["_retrieval_layers"])
        self.assertIn("智能体评估", retriever.last_query)

    def test_sparse_query_falls_back_to_frequent_questions(self):
        retriever = HierarchicalRetriever(enable_semantic=False)
        retriever.kb_data = self.questions

        result = retriever.retrieve({}, "", "", top_k=2)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["question_hash"], "metrics")
        self.assertEqual(result[0]["_retrieval_layers"], ["frequency_fallback"])


if __name__ == "__main__":
    unittest.main()
