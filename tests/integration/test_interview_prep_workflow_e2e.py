import os
import sys
import unittest

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(PROJECT_ROOT)

from runtime.eval_engine import call_llm, load_prompt

class InterviewPrepWorkflow:
    def __init__(self):
        self.planning_prompt = load_prompt("workflow_planning")
        self.prep_prompt = load_prompt("interview_preparation")

    def run(self, jd_result: dict, resume_result: dict, matching_result: dict, user_memory: dict, trigger_error: bool = False):
        # Step 1: Workflow Planning
        print("\n[Workflow Engine] Step 1: Running Workflow Planning (Scheduling Prep)...")
        planning_input = {
            "job_case_status": "Interview_Scheduled",
            "timeline_events": [
                {
                  "timestamp": "2026-07-20T10:00:00Z",
                  "event_type": "Stage_Changed",
                  "description": "Moved to Interview_Scheduled"
                }
            ],
            "job_matching_result": matching_result
        }
        
        # Inject deliberate error for testing Broken Path
        if trigger_error:
            planning_input["job_case_status"] = ""
            
        planning_output, _, _ = call_llm(self.planning_prompt, planning_input)
        
        # Error handling & Interrupt
        if planning_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Workflow Planning aborted with error: {planning_output.get('error_code')}")
            return {"status": "error", "failed_at": "workflow_planning", "error_code": planning_output.get("error_code")}

        # Execute Tool Calls
        tool_calls = planning_output.get("tool_calls", [])
        for tool in tool_calls:
            print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")

        # Step 2: Interview Preparation
        print("[Workflow Engine] Step 2: Running Interview Preparation...")
        prep_input = {
            "jd_analysis_result": jd_result,
            "resume_analysis_result": resume_result,
            "user_memory": user_memory
        }
        
        prep_output, _, _ = call_llm(self.prep_prompt, prep_input)
        
        if prep_output.get("status") == "error":
            print(f"[Workflow Engine] 🚨 Interview Preparation aborted with error: {prep_output.get('error_code')}")
            return {"status": "error", "failed_at": "interview_preparation", "error_code": prep_output.get("error_code")}
            
        prep_result_box = prep_output.get("interview_prep_result", {})
        prep_result = prep_result_box.get("questions")
        if not prep_result:
            print("[Workflow Engine] 🚨 Missing 'questions' in Schema!")
            return {"status": "error", "failed_at": "interview_preparation", "error_code": "MISSING_RESULT"}
            
        # Execute Tool Calls
        tool_calls = prep_output.get("tool_calls", [])
        for tool in tool_calls:
            print(f"[Workflow Engine] 🔧 Executing Tool: {tool.get('action')}")
            
        print("[Workflow Engine] ✅ Interview Prep Workflow Completed Successfully!")
        return {"status": "success"}

class TestInterviewPrepWorkflowE2E(unittest.TestCase):
    def setUp(self):
        self.workflow = InterviewPrepWorkflow()
        self.mock_jd = {
            "role": "后端架构师",
            "skills": [
                {"name": "高并发系统设计", "importance": "must"}
            ]
        }
        self.mock_resume = {
            "skills": ["Java", "Spring Boot"],
            "projects": ["开发了订单系统"]
        }
        self.mock_matching = {
            "education_match": True,
            "experience_match": True,
            "must_skill_match": [],
            "preferred_skill_match": [],
            "missing_skills": ["高并发"],
            "risks": ["缺少高并发"],
            "reason": "缺少高并发经验"
        }
        self.mock_memory = {
            "knowledge_tags": ["系统架构", "缓存一致性"],
            "insights": ["缺乏对高并发场景下缓存一致性问题的系统性理解"]
        }
        
    def test_case_a_happy_path(self):
        print("\n=============================================")
        print("=== Running Case A: Happy Path (Planning + Prep) ===")
        result = self.workflow.run(self.mock_jd, self.mock_resume, self.mock_matching, self.mock_memory)
        self.assertEqual(result["status"], "success")

    def test_case_b_broken_path(self):
        print("\n=============================================")
        print("=== Running Case B: Broken Path (Planning Error) ===")
        result = self.workflow.run(self.mock_jd, self.mock_resume, self.mock_matching, self.mock_memory, trigger_error=True)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["failed_at"], "workflow_planning")
        self.assertEqual(result["error_code"], "UNKNOWN_STATUS")

if __name__ == '__main__':
    unittest.main(verbosity=2)
