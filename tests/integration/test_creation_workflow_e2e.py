import os
import sys
import unittest

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(PROJECT_ROOT)

from runtime.eval_engine import call_llm, load_prompt

class CreationWorkflow:
    def __init__(self):
        self.jd_prompt = load_prompt("jd_analysis")
        self.resume_prompt = load_prompt("resume_analysis")
        self.matching_prompt = load_prompt("job_matching")
        self.planning_prompt = load_prompt("workflow_planning")

    def run(self, jd_text: str, resume_text: str):
        # Step 1: JD Analysis
        print("\n[Workflow Engine] Step 1: Running JD Analysis...")
        jd_input = {"jd_text": jd_text}
        jd_output, _, _ = call_llm(self.jd_prompt, jd_input)
        
        # Error handling & Interrupt
        if jd_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 JD Analysis aborted with error: {jd_output.get('error_code')}")
            return {"status": "error", "failed_at": "jd_analysis", "error_code": jd_output.get("error_code")}
            
        jd_result = jd_output.get("jd_analysis_result")
        if not jd_result:
            print("[Workflow Engine] 🚨 Missing 'jd_analysis_result' in Schema!")
            return {"status": "error", "failed_at": "jd_analysis", "error_code": "SCHEMA_VALIDATION_FAILED"}

        # Step 2: Resume Analysis
        print("[Workflow Engine] Step 2: Running Resume Analysis...")
        resume_input = {"resume_text": resume_text}
        resume_output, _, _ = call_llm(self.resume_prompt, resume_input)
        
        if resume_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Resume Analysis aborted with error: {resume_output.get('error_code')}")
            return {"status": "error", "failed_at": "resume_analysis", "error_code": resume_output.get("error_code")}
            
        resume_result = resume_output.get("resume_analysis_result")
        if not resume_result:
            print("[Workflow Engine] 🚨 Missing 'resume_analysis_result' in Schema!")
            return {"status": "error", "failed_at": "resume_analysis", "error_code": "SCHEMA_VALIDATION_FAILED"}

        # Step 3: Job Matching
        print("[Workflow Engine] Step 3: Running Job Matching...")
        # Orchestration: passing outputs of Step 1 & 2 as inputs
        matching_input = {
            "jd_analysis_result": jd_result,
            "resume_analysis_result": resume_result
        }
        matching_output, _, _ = call_llm(self.matching_prompt, matching_input)
        
        if matching_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Job Matching aborted with error: {matching_output.get('error_code')}")
            return {"status": "error", "failed_at": "job_matching", "error_code": matching_output.get("error_code")}

        matching_result = matching_output.get("job_matching_result")
        if not matching_result:
            print("[Workflow Engine] 🚨 Missing 'job_matching_result' in Schema!")
            return {"status": "error", "failed_at": "job_matching", "error_code": "SCHEMA_VALIDATION_FAILED"}
            
        # Execute Tool Call for Job Matching (e.g., Save_Job_Matching_Result)
        tool_calls = matching_output.get("tool_calls", [])
        for tool in tool_calls:
            print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")

        # Step 4: Workflow Planning
        print("[Workflow Engine] Step 4: Running Workflow Planning...")
        planning_input = {
            "job_case_status": "Applied",
            "timeline_events": [
                {
                  "timestamp": "2026-07-19T10:00:00Z",
                  "event_type": "Resume_Submitted",
                  "description": "User applied to the job."
                }
            ],
            "job_matching_result": matching_result
        }
        planning_output, _, _ = call_llm(self.planning_prompt, planning_input)
        
        if planning_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Workflow Planning aborted with error: {planning_output.get('error_code')}")
            return {"status": "error", "failed_at": "workflow_planning", "error_code": planning_output.get("error_code")}
            
        # Execute Tool Calls for Planning
        tool_calls = planning_output.get("tool_calls", [])
        for tool in tool_calls:
            print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")
            
        print("[Workflow Engine] ✅ Creation Workflow Completed Successfully!")
        return {"status": "success", "data": planning_output}

class TestCreationWorkflowE2E(unittest.TestCase):
    def setUp(self):
        self.workflow = CreationWorkflow()
        
    def test_case_a_happy_path(self):
        print("\n=============================================")
        print("=== Running Case A: Happy Path ===")
        jd = "需要后端工程师，熟悉Java，三年经验，高并发，Redis。"
        resume = "张三，Java后端工程师，4年经验，熟练使用Redis解决高并发问题。"
        result = self.workflow.run(jd, resume)
        self.assertEqual(result["status"], "success", "Workflow should complete successfully.")

    def test_case_b_broken_jd(self):
        print("\n=============================================")
        print("=== Running Case B: Broken Path (JD Error) ===")
        jd = "你好，今天天气不错。"
        resume = "张三，Java后端工程师。"
        result = self.workflow.run(jd, resume)
        self.assertEqual(result["status"], "error", "Workflow should abort with error.")
        self.assertEqual(result["failed_at"], "jd_analysis", "Workflow should abort at JD Analysis.")
        self.assertEqual(result["error_code"], "INVALID_JD_TEXT", "Error code should be INVALID_JD_TEXT.")
        
    def test_case_c_broken_resume(self):
        print("\n=============================================")
        print("=== Running Case C: Broken Path (Resume Error) ===")
        jd = "需要后端工程师，熟悉Java，三年经验，高并发，Redis。"
        resume = ""
        result = self.workflow.run(jd, resume)
        self.assertEqual(result["status"], "error", "Workflow should abort with error.")
        self.assertEqual(result["failed_at"], "resume_analysis", "Workflow should abort at Resume Analysis.")
        self.assertEqual(result["error_code"], "INVALID_RESUME_TEXT", "Error code should be INVALID_RESUME_TEXT.")

if __name__ == '__main__':
    unittest.main(verbosity=2)
