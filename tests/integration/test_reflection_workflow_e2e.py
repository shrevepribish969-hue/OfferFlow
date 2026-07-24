import os
import sys
import unittest

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(PROJECT_ROOT)

from runtime.eval_engine import call_llm, load_prompt

class ReflectionWorkflow:
    def __init__(self):
        self.eval_prompt = load_prompt("interview_evaluation")
        self.reflection_prompt = load_prompt("reflection")

    def run(self, transcript: list, prep_result: dict, jd_result: dict, trigger_error: bool = False):
        # Step 1: Interview Evaluation
        print("\n[Workflow Engine] Step 1: Running Interview Evaluation...")
        
        eval_input = {
            "user_answers": transcript,
            "interview_prep_result": prep_result
        }
        
        # Inject deliberate error for testing Broken Path
        if trigger_error:
            eval_input["user_answers"] = []
            
        eval_output, _, _ = call_llm(self.eval_prompt, eval_input)
        
        # Error handling & Interrupt
        if eval_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Interview Evaluation aborted with error: {eval_output.get('error_code')}")
            return {"status": "error", "failed_at": "interview_evaluation", "error_code": eval_output.get("error_code")}

        eval_result = eval_output.get("interview_eval_result")
        if not eval_result:
            print("[Workflow Engine] 🚨 Missing 'interview_eval_result' in Schema!")
            return {"status": "error", "failed_at": "interview_evaluation", "error_code": "MISSING_RESULT"}

        # Step 2: Reflection
        print("[Workflow Engine] Step 2: Running Post-Interview Reflection...")
        refl_input = {
            "interview_eval_result": eval_result,
            "jd_analysis_result": jd_result
        }
        
        refl_output, _, _ = call_llm(self.reflection_prompt, refl_input)
        
        if refl_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Reflection aborted with error: {refl_output.get('error_code')}")
            return {"status": "error", "failed_at": "reflection", "error_code": refl_output.get("error_code")}
            
        refl_result = refl_output.get("reflection_result")
        if not refl_result:
            print("[Workflow Engine] 🚨 Missing 'reflection_result' in Schema!")
            return {"status": "error", "failed_at": "reflection", "error_code": "MISSING_RESULT"}
            
        # Execute Tool Calls
        tool_calls = refl_output.get("tool_calls", [])
        for tool in tool_calls:
            print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")
            
        print("[Workflow Engine] ✅ Reflection Workflow Completed Successfully!")
        return {"status": "success"}

class TestReflectionWorkflowE2E(unittest.TestCase):
    def setUp(self):
        self.workflow = ReflectionWorkflow()
        self.mock_transcript = [
            {
                "question_id": "q1",
                "user_response_transcript": "我用了负载均衡，没用缓存。"
            }
        ]
        self.mock_prep = {
            "questions": [
                {
                    "question_id": "q1",
                    "question_text": "高并发架构设计",
                    "good_answer_criteria": ["提到Redis", "提到负载均衡"]
                }
            ]
        }
        self.mock_jd = {
            "role": "后端架构师",
            "skills": [
                {"name": "高并发系统设计", "importance": "must"}
            ]
        }
        
    def test_case_a_happy_path(self):
        print("\n=============================================")
        print("=== Running Case A: Happy Path (Eval + Reflect) ===")
        result = self.workflow.run(self.mock_transcript, self.mock_prep, self.mock_jd)
        self.assertEqual(result["status"], "success")

    def test_case_b_broken_path(self):
        print("\n=============================================")
        print("=== Running Case B: Broken Path (Empty Transcript) ===")
        result = self.workflow.run(self.mock_transcript, self.mock_prep, self.mock_jd, trigger_error=True)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["failed_at"], "interview_evaluation")
        self.assertEqual(result["error_code"], "MISSING_RECORD")

if __name__ == '__main__':
    unittest.main(verbosity=2)
