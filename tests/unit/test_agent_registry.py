import unittest

from runtime.agents import get_agent_catalog, normalize_supervisor_decision


class AgentRegistryTests(unittest.TestCase):
    def test_catalog_exposes_semantic_capabilities_not_keywords(self):
        catalog = get_agent_catalog()
        matching = next(
            capability
            for agent in catalog
            for capability in agent["capabilities"]
            if capability["workflow"] == "JobMatching"
        )
        self.assertIn("是否值得投", matching["description"])
        self.assertEqual(matching["required_context"], ["jd_content", "base_resume"])
        self.assertNotIn("keywords", matching)

    def test_supervisor_delegation_is_validated_against_registry(self):
        decision = normalize_supervisor_decision({
            "mode": "DELEGATE",
            "reply": "我会请岗位匹配 Agent 处理。",
            "delegation": {
                "workflow": "JobMatching",
                "objective": "判断这个岗位是否值得投",
            },
        })
        self.assertEqual(decision["intent"], "EXECUTE")
        self.assertEqual(decision["workflow"], "JobMatching")
        self.assertNotIn("Agent", decision["reply"])

        invalid = normalize_supervisor_decision({
            "mode": "DELEGATE",
            "delegation": {"workflow": "InventedAgent"},
        })
        self.assertEqual(invalid["intent"], "GUIDE")
        self.assertIsNone(invalid["workflow"])

    def test_supervisor_can_respond_without_delegating(self):
        decision = normalize_supervisor_decision({
            "mode": "RESPOND",
            "reply": "这个分数主要受经历相关度影响。",
            "delegation": None,
        })
        self.assertEqual(decision["intent"], "GUIDE")
        self.assertIsNone(decision["workflow"])


if __name__ == "__main__":
    unittest.main()
