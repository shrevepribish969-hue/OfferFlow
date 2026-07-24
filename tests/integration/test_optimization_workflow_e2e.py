import os
import sys
import unittest

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(PROJECT_ROOT)

from runtime.eval_engine import call_llm, load_prompt

class OptimizationWorkflow:
    def __init__(self):
        self.opt_prompt = load_prompt("resume_optimization")
        self.gen_prompt = load_prompt("content_generation")

    def run(self, jd_result: dict, matching_result: dict, user_goal: str = None):
        # Step 1: Resume Optimization
        print("\n[Workflow Engine] Step 1: Running Resume Optimization...")
        opt_input = {
            "jd_analysis_result": jd_result,
            "job_matching_result": matching_result
        }
        
        opt_output, _, _ = call_llm(self.opt_prompt, opt_input)
        
        # Error handling & Interrupt
        if opt_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Resume Optimization aborted with error: {opt_output.get('error_code')}")
            return {"status": "error", "failed_at": "resume_optimization", "error_code": opt_output.get("error_code")}
            
        opt_result = opt_output.get("resume_optimization_result")
        if not opt_result:
            print("[Workflow Engine] 🚨 Missing 'resume_optimization_result' in Schema!")
            return {"status": "error", "failed_at": "resume_optimization", "error_code": "MISSING_RESULT"}

        # Execute Tool Calls
        tool_calls = opt_output.get("tool_calls", [])
        for tool in tool_calls:
            print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")

        # Step 2: Content Generation (Optional, conditionally triggered)
        if user_goal:
            print(f"[Workflow Engine] Step 2: User intent detected '{user_goal}'. Running Content Generation...")
            gen_input = {
                "jd_analysis_result": jd_result,
                "job_matching_result": matching_result,
                "user_generation_goal": user_goal,
                "generation_constraints": ["字数限制200字以内", "语气正式客观"]
            }
            gen_output, _, _ = call_llm(self.gen_prompt, gen_input)
            
            if gen_output.get("status") == "error":
                print(f"[Workflow Engine] 🚨 Content Generation aborted with error: {gen_output.get('error_code')}")
                return {"status": "error", "failed_at": "content_generation", "error_code": gen_output.get("error_code")}
                
            gen_result_box = gen_output.get("content_generation_result", {})
            gen_result = gen_result_box.get("generated_content")
            if not gen_result:
                print("[Workflow Engine] 🚨 Missing 'generated_content' in Schema!")
                return {"status": "error", "failed_at": "content_generation", "error_code": "MISSING_RESULT"}
                
            # Execute Tool Calls
            tool_calls = gen_output.get("tool_calls", [])
            for tool in tool_calls:
                print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")
        else:
            print("[Workflow Engine] Skip Step 2: No content generation intent detected.")
            
        print("[Workflow Engine] ✅ Optimization Workflow Completed Successfully!")
        return {"status": "success"}

class TestOptimizationWorkflowE2E(unittest.TestCase):
    def setUp(self):
        self.workflow = OptimizationWorkflow()
        self.mock_jd = {
            "role": "后端工程师",
            "skills": [
                {"name": "高并发", "importance": "must"},
                {"name": "Redis", "importance": "must"}
            ]
        }
        self.mock_matching = {
            "education_match": True,
            "experience_match": True,
            "must_skill_match": ["Python", "FastAPI"],
            "preferred_skill_match": [],
            "missing_skills": ["高并发"],
            "risks": ["缺少高并发场景经验"],
            "reason": "缺乏高并发相关经验"
        }
        
    def test_case_a_full_path(self):
        print("\n=============================================")
        print("=== Running Case A: Full Path (Optimize + Generate) ===")
        result = self.workflow.run(self.mock_jd, self.mock_matching, user_goal="请帮我写一封简短的求职信给HR")
        self.assertEqual(result["status"], "success")

    def test_case_b_opt_only_path(self):
        print("\n=============================================")
        print("=== Running Case B: Opt Only Path (No Generation) ===")
        result = self.workflow.run(self.mock_jd, self.mock_matching)
        self.assertEqual(result["status"], "success")
        
    def test_case_c_broken_matching(self):
        print("\n=============================================")
        print("=== Running Case C: Broken Path (Empty Matching) ===")
        # Missing essential input data should trigger schema validation error or model fallback
        result = self.workflow.run(self.mock_jd, {})
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["failed_at"], "resume_optimization")
        self.assertEqual(result["error_code"], "INVALID_RESUME_JSON")

if __name__ == '__main__':
    unittest.main(verbosity=2)
