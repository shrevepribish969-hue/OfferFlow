import os
import unittest
from unittest.mock import patch

from runtime.api.workflow_engine import SkillExecutor, model_settings


class WorkflowEngineConfigTests(unittest.IsolatedAsyncioTestCase):
    def test_model_settings_supports_openai_key_fallback(self):
        with patch.dict(
            os.environ,
            {
                "DEEPSEEK_API_KEY": "",
                "OPENAI_API_KEY": "fallback-key",
                "DEEPSEEK_BASE_URL": "https://example.invalid/v1",
                "MODEL_NAME": "example-model",
            },
            clear=False,
        ):
            self.assertEqual(
                model_settings(),
                ("fallback-key", "https://example.invalid/v1", "example-model"),
            )

    async def test_missing_key_returns_safe_error_without_creating_client(self):
        with patch.dict(
            os.environ,
            {"DEEPSEEK_API_KEY": "", "OPENAI_API_KEY": ""},
            clear=False,
        ), patch("runtime.api.workflow_engine.AsyncOpenAI") as client:
            result = await SkillExecutor._call_llm("prompt", {"input": "value"})

        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error_code"], "MODEL_API_KEY_MISSING")
        self.assertNotIn("api_key client option", result["error_message"])
        client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
