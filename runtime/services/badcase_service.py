import json
from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from ..api import models


FEEDBACK_META = {
    "不准确": ("accuracy_error", "accuracy"),
    "太空泛": ("too_generic", "specificity"),
    "有编造风险": ("fabrication_risk", "faithfulness"),
    "有不真实表述": ("fabrication_risk", "faithfulness"),
    "不相关": ("irrelevant", "relevance"),
    "太简单": ("too_simple", "difficulty"),
    "太正式": ("too_formal", "tone"),
    "太随意": ("too_casual", "tone"),
}

CATEGORY_LABELS = {
    "accuracy": "事实或判断不准确",
    "specificity": "内容过于空泛",
    "faithfulness": "存在编造风险",
    "relevance": "与任务不相关",
    "difficulty": "深度或难度不足",
    "tone": "表达语气不合适",
    "system_error": "运行失败",
    "other": "其他问题",
}

SUGGESTED_ACTIONS = {
    "accuracy": "核对输入事实与判断依据，增加结构化校验。",
    "specificity": "要求输出引用具体证据、动作和结果，减少模板化表达。",
    "faithfulness": "禁止补写无证据经历或指标，并标记证据等级。",
    "relevance": "重新检查 JD、用户意图与输出覆盖维度。",
    "difficulty": "增加岗位关键能力、边界条件和连续追问。",
    "tone": "调整目标场景、受众和表达风格约束。",
    "system_error": "检查运行错误、输入完整性和降级路径。",
    "other": "结合用户备注复查输入、Prompt 与输出。",
}

WORKFLOW_AGENTS = {
    "JDAnalysis": ("case_manager", "Case Manager Agent"),
    "JobMatching": ("case_manager", "Case Manager Agent"),
    "ResumeOptimization": ("resume", "Resume Agent"),
    "InterviewPrep": ("interview", "Interview Agent"),
    "InterviewEvaluation": ("interview", "Interview Agent"),
    "GreetingGeneration": ("communication", "Communication Agent"),
    "ContentGeneration": ("communication", "Communication Agent"),
    "Reflection": ("reflection", "Reflection Agent"),
}

AGENT_KEYS = {
    "Case Manager Agent": "case_manager",
    "Resume Agent": "resume",
    "Interview Agent": "interview",
    "Communication Agent": "communication",
    "Reflection Agent": "reflection",
}

AGENT_DISPLAY_NAMES = {
    "case_manager": "求职流程智能体",
    "resume": "简历优化智能体",
    "interview": "面试准备智能体",
    "communication": "沟通话术智能体",
    "reflection": "复盘记忆智能体",
    "unknown": "未识别智能体",
}


class BadcaseService:
    @staticmethod
    def _card_outputs(db: Session) -> dict[int, dict[str, Any]]:
        outputs: dict[int, dict[str, Any]] = {}
        messages = db.query(models.ChatMessage).filter(models.ChatMessage.role == "agent").all()
        for message in messages:
            try:
                payload = json.loads(message.content or "")
            except (TypeError, json.JSONDecodeError):
                continue
            card = payload.get("card") if isinstance(payload, dict) else None
            data = card.get("data", {}) if isinstance(card, dict) else {}
            run_id = data.get("ai_run_id") if isinstance(data, dict) else None
            if run_id is not None:
                outputs[int(run_id)] = card
        return outputs

    @staticmethod
    def _find_run(event: models.FeedbackEvent, runs: list[models.AIRun]) -> models.AIRun | None:
        event_data = event.event_data or {}
        explicit_id = event_data.get("ai_run_id")
        if explicit_id is not None:
            return next((run for run in runs if str(run.id) == str(explicit_id)), None)
        candidates = [run for run in runs if run.job_case_id == event.job_case_id]
        if event.card_type:
            typed = [run for run in candidates if (run.run_data or {}).get("card_type") == event.card_type]
            candidates = typed or candidates
        return max(candidates, key=lambda run: run.started_at or run.id, default=None)

    @staticmethod
    def _feedback_payload(event: models.FeedbackEvent) -> dict[str, Any]:
        data = event.event_data or {}
        fallback_code, fallback_category = FEEDBACK_META.get(event.feedback, ("unknown_feedback", "other"))
        return {
            "id": event.id,
            "label": event.feedback,
            "code": data.get("feedback_code") or fallback_code,
            "category": data.get("feedback_category") or fallback_category,
            "note": event.note,
            "created_at": event.created_at.isoformat() if event.created_at else None,
        }

    @staticmethod
    def list_badcases(db: Session) -> dict[str, Any]:
        runs = db.query(models.AIRun).order_by(models.AIRun.started_at.desc()).all()
        events = db.query(models.FeedbackEvent).order_by(models.FeedbackEvent.created_at.desc()).all()
        jobs = {job.id: job for job in db.query(models.JobCase).all()}
        card_outputs = BadcaseService._card_outputs(db)

        groups: dict[str, dict[str, Any]] = {}
        for event in events:
            data = event.event_data or {}
            category = data.get("feedback_category") or FEEDBACK_META.get(event.feedback, (None, "other"))[1]
            normalized_type = data.get("normalized_feedback_type") or event.feedback_type
            if normalized_type != "badcase_candidate" and category == "user_accepted":
                continue
            run = BadcaseService._find_run(event, runs)
            key = f"run:{run.id}" if run else f"feedback:{event.id}"
            if key not in groups:
                groups[key] = BadcaseService._build_item(run, event.job_case_id, jobs, card_outputs)
            groups[key]["feedbacks"].append(BadcaseService._feedback_payload(event))

        for run in runs:
            if run.status != "failed" or f"run:{run.id}" in groups:
                continue
            item = BadcaseService._build_item(run, run.job_case_id, jobs, card_outputs)
            item["feedbacks"].append({
                "id": None,
                "label": "运行失败",
                "code": "system_error",
                "category": "system_error",
                "note": run.error_message,
                "created_at": run.completed_at.isoformat() if run.completed_at else None,
            })
            groups[f"run:{run.id}"] = item

        items = list(groups.values())
        for item in items:
            categories = [feedback["category"] for feedback in item["feedbacks"]]
            primary = categories[0] if categories else "other"
            item["primary_category"] = primary
            item["problem_label"] = CATEGORY_LABELS.get(primary, CATEGORY_LABELS["other"])
            item["severity"] = "high" if any(category in {"accuracy", "faithfulness", "system_error"} for category in categories) else "medium"
            item["suggested_action"] = SUGGESTED_ACTIONS.get(primary, SUGGESTED_ACTIONS["other"])

        items.sort(key=lambda item: item.get("created_at") or "", reverse=True)
        category_counts = Counter(item["primary_category"] for item in items)
        agent_summary: dict[str, dict[str, Any]] = {}
        for item in items:
            agent = agent_summary.setdefault(item["agent_key"], {
                "agent_key": item["agent_key"],
                "agent_name": item["agent_name"],
                "agent_display_name": item["agent_display_name"],
                "total": 0,
                "high_severity": 0,
                "by_category": {},
            })
            agent["total"] += 1
            agent["high_severity"] += int(item["severity"] == "high")
            category = item["primary_category"]
            agent["by_category"][category] = agent["by_category"].get(category, 0) + 1
        return {
            "summary": {
                "total": len(items),
                "high_severity": sum(item["severity"] == "high" for item in items),
                "by_category": dict(category_counts),
                "by_agent": agent_summary,
            },
            "items": items,
        }

    @staticmethod
    def _build_item(
        run: models.AIRun | None,
        job_case_id: int,
        jobs: dict[int, models.JobCase],
        card_outputs: dict[int, dict[str, Any]],
    ) -> dict[str, Any]:
        job = jobs.get(job_case_id)
        card = card_outputs.get(run.id) if run else None
        output = json.dumps(card, ensure_ascii=False, indent=2) if card else (run.output_summary if run else "")
        workflow_name = run.workflow_name if run else "Unknown"
        fallback_key, fallback_name = WORKFLOW_AGENTS.get(workflow_name, ("unknown", "Unknown Agent"))
        agent_name = run.agent_name if run and run.agent_name else fallback_name
        agent_key = AGENT_KEYS.get(agent_name, fallback_key)
        return {
            "key": f"run:{run.id}" if run else f"job:{job_case_id}",
            "ai_run_id": run.id if run else None,
            "job_case_id": job_case_id,
            "company": job.company if job else None,
            "role": job.role if job else None,
            "workflow_name": workflow_name,
            "agent_key": agent_key,
            "agent_name": agent_name,
            "agent_display_name": AGENT_DISPLAY_NAMES.get(agent_key, "未识别智能体"),
            "model_name": run.model_name if run else None,
            "run_status": run.status if run else "unknown",
            "original_input": run.input_summary if run else "未关联到 AI 运行记录",
            "original_output": output,
            "error_message": run.error_message if run else None,
            "latency_ms": run.latency_ms if run else None,
            "created_at": (run.started_at.isoformat() if run and run.started_at else None),
            "review_status": "needs_review",
            "feedbacks": [],
        }
