
"""Agent definitions and workflow router for OfferFlow."""

import re


class AgentDef:
    """Defines an agent's identity, scope, and owned workflows."""

    def __init__(
        self,
        name: str,
        description: str,
        allowed_workflows: list[str],
        read_scope: list[str],
        write_scope: list[str],
    ):
        self.name = name
        self.description = description
        self.allowed_workflows = allowed_workflows
        self.read_scope = read_scope
        self.write_scope = write_scope


# ===== Agent Registry =====
# Each agent owns a set of workflows and declares what it can read/write.
# The SkillExecutor remains the actual executor; agents are routing + scope targets.

AGENTS: dict[str, AgentDef] = {
    "case_manager": AgentDef(
        name="Case Manager Agent",
        description="Manages job case lifecycle: JD analysis, matching, status changes.",
        allowed_workflows=["JDAnalysis", "JobMatching", "UpdateJobCase"],
        read_scope=["JobCase", "UserProfile"],
        write_scope=["JobCase.status", "JobCase.workflow_data", "JobCase.match_score"],
    ),
    "resume": AgentDef(
        name="Resume Agent",
        description="Optimizes resumes and generates job-specific content.",
        allowed_workflows=["ResumeOptimization", "ContentGeneration"],
        read_scope=["JobCase", "UserProfile", "ResumeVersion"],
        write_scope=["JobCase.workflow_data", "ResumeVersion.merged_resume"],
    ),
    "interview": AgentDef(
        name="Interview Agent",
        description="Prepares for and evaluates interviews.",
        allowed_workflows=["InterviewPrep", "InterviewEvaluation"],
        read_scope=["JobCase", "UserProfile", "StoryCard", "Interview"],
        write_scope=["JobCase.workflow_data", "Interview.prep_pack", "Interview.evaluation"],
    ),
    "communication": AgentDef(
        name="Communication Agent",
        description="Drafts greetings, follow-ups, and other communications.",
        allowed_workflows=["GreetingGeneration"],
        read_scope=["JobCase", "UserProfile"],
        write_scope=["JobCase.workflow_data"],
    ),
    "reflection": AgentDef(
        name="Reflection Agent",
        description="Reflects on interviews and updates user memory.",
        allowed_workflows=["Reflection"],
        read_scope=["JobCase", "UserProfile", "Interview", "Reflection"],
        write_scope=["JobCase.workflow_data", "UserProfile.user_memory",
                      "Reflection.content", "MemoryItem"],
    ),
}


class WorkflowRouter:
    """Routes a workflow name to the owning agent."""

    @staticmethod
    def route(workflow: str) -> AgentDef | None:
        for agent in AGENTS.values():
            if workflow in agent.allowed_workflows:
                return agent
        return None

    @staticmethod
    def validate(workflow: str) -> bool:
        return WorkflowRouter.route(workflow) is not None


WORKFLOW_CAPABILITIES: dict[str, dict[str, object]] = {
    "JDAnalysis": {
        "description": "理解岗位职责、硬性要求和核心能力；仅在用户明确需要岗位解读时调用",
        "required_context": ["jd_content"],
        "artifact": False,
    },
    "JobMatching": {
        "description": "判断用户与岗位是否匹配、是否值得投，并分析优势和差距",
        "required_context": ["jd_content", "base_resume"],
        "artifact": True,
    },
    "ResumeOptimization": {
        "description": "根据目标岗位直接优化用户简历；不要求先执行岗位匹配",
        "required_context": ["jd_content", "base_resume"],
        "artifact": True,
    },
    "ContentGeneration": {
        "description": "将用户确认过的简历修改整理为最终简历版本",
        "required_context": ["base_resume"],
        "artifact": True,
    },
    "InterviewPrep": {
        "description": "结合岗位和用户经历准备一面、二面或 HR 面",
        "required_context": ["jd_content"],
        "artifact": True,
    },
    "InterviewEvaluation": {
        "description": "分析面试记录或逐字稿，给出评估和改进建议",
        "required_context": ["interview_transcript"],
        "artifact": True,
    },
    "GreetingGeneration": {
        "description": "生成招聘平台打招呼语、投递沟通或跟进话术",
        "required_context": ["jd_content"],
        "artifact": False,
    },
    "UpdateJobCase": {
        "description": "记录投递、面试、提醒等求职进度并更新日程",
        "required_context": [],
        "artifact": True,
    },
    "Reflection": {
        "description": "将已确认的面试复盘沉淀为长期求职记忆",
        "required_context": ["interview_evaluation"],
        "artifact": False,
    },
}


def get_agent_catalog() -> list[dict[str, object]]:
    """Expose capabilities to the Supervisor without teaching it keywords."""
    catalog: list[dict[str, object]] = []
    for agent_id, agent in AGENTS.items():
        capabilities = []
        for workflow in agent.allowed_workflows:
            capability = WORKFLOW_CAPABILITIES.get(workflow, {})
            capabilities.append({"workflow": workflow, **capability})
        catalog.append({
            "agent_id": agent_id,
            "name": agent.name,
            "description": agent.description,
            "capabilities": capabilities,
        })
    return catalog


def normalize_supervisor_decision(payload: object, user_message: str = "") -> dict[str, object]:
    """Validate model output against the live registry before dispatch."""
    parsed = payload if isinstance(payload, dict) else {}
    mode = str(parsed.get("mode") or parsed.get("intent") or "RESPOND").upper()
    delegation = parsed.get("delegation") if isinstance(parsed.get("delegation"), dict) else {}
    workflow = delegation.get("workflow") or parsed.get("workflow")
    can_delegate = mode in {"EXECUTE", "DELEGATE"} and isinstance(workflow, str) and WorkflowRouter.validate(workflow)
    if not can_delegate:
        workflow = None
    reply = str(parsed.get("reply") or "你可以继续告诉我你最想解决的问题。")
    for agent in AGENTS.values():
        reply = reply.replace(f"我会请 {agent.name}", "我会")
        reply = reply.replace(f"我会调用 {agent.name}", "我会")
        reply = reply.replace(agent.name, "内部能力")
    reply = re.sub(r"我会(?:请|调用)\s*[^，。；\n]{0,24}?Agent\s*", "我会", reply, flags=re.IGNORECASE)
    return {
        "intent": "EXECUTE" if can_delegate else "GUIDE",
        "reply": reply,
        "workflow": workflow,
        "objective": delegation.get("objective") or parsed.get("objective") or user_message,
        "missing_context": parsed.get("missing_context") if isinstance(parsed.get("missing_context"), list) else [],
        "supervisor_mode": mode,
    }



# ===== Event-driven Workflow Triggers (Phase 9) =====
# When a workflow completes successfully, the next workflow may auto-trigger.
# Key: source workflow name
# Value: target workflow name and SkillExecutor method

TRIGGER_MAP: dict[str, dict[str, str]] = {
    # Removed auto-trigger from JDAnalysis to JobMatching to allow manual user control
}
