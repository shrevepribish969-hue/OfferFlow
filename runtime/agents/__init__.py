
"""Agent definitions and workflow router for OfferFlow."""


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



# ===== Event-driven Workflow Triggers (Phase 9) =====
# When a workflow completes successfully, the next workflow may auto-trigger.
# Key: source workflow name
# Value: target workflow name and SkillExecutor method

TRIGGER_MAP: dict[str, dict[str, str]] = {
    # Removed auto-trigger from JDAnalysis to JobMatching to allow manual user control
}
