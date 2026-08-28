"""Conversation-first routing helpers for the unified job-search assistant."""

from __future__ import annotations

import re
from datetime import datetime, timedelta


WORKFLOW_LABELS = {
    "JDAnalysis": "岗位分析 Agent",
    "JobMatching": "岗位匹配 Agent",
    "ResumeOptimization": "简历优化 Agent",
    "ContentGeneration": "简历生成 Agent",
    "InterviewPrep": "面试准备 Agent",
    "InterviewEvaluation": "面试复盘 Agent",
    "GreetingGeneration": "沟通话术 Agent",
    "Reflection": "复盘记忆 Agent",
    "UpdateJobCase": "求职进度 Agent",
}


def execution_intro(workflow: str, context: dict | None = None) -> str:
    context = context or {}
    if workflow == "ResumeOptimization":
        if not context.get("has_jd_analysis"):
            return (
                "明白，我们可以跳过匹配评分，直接优化简历。"
                "我会先在后台提取这份 JD 的关键要求，再开始定向优化；"
                "不会额外生成你没有要求的匹配报告。"
            )
        return "明白，我会直接结合这份 JD 给出可逐条确认的简历修改建议。"
    if workflow == "InterviewPrep":
        return "好的，我会结合岗位信息和你的真实经历准备本轮面试内容。"
    if workflow == "JobMatching":
        return "好的，我会对照岗位要求与基础简历，分析你的优势、差距和投递价值。"
    if workflow == "JDAnalysis":
        return "好的，我来提取这个岗位的职责、硬性要求和关键能力。"
    if workflow == "GreetingGeneration":
        return "好的，我会基于岗位重点和你的真实优势生成可直接修改的沟通话术。"
    if workflow == "ContentGeneration":
        return "好的，我会把已确认的修改整理成最终简历版本。"
    if workflow == "InterviewEvaluation":
        return "明白，我会分析这份面试记录；结论会先给你确认，再决定是否沉淀为长期记忆。"
    if workflow == "UpdateJobCase":
        return "明白，我来记录投递时间和跟进提醒，并把它加入你的任务日程。"
    return "明白，我来处理这项任务。"


def opening_suggestions(applied: bool) -> list[str]:
    """Return only concrete actions; avoid vague prompts with no visible outcome."""
    if applied:
        return ["查看投递记录", "修改提醒时间", "准备面试"]
    return ["判断是否值得投", "直接优化简历", "准备面试", "我已经投递了"]


def missing_context_reply(workflow: str, context: dict | None = None) -> str | None:
    context = context or {}
    if workflow in {"ResumeOptimization", "JobMatching", "ContentGeneration"} and not context.get("has_base_resume"):
        return "可以。开始前只缺一项：请先在“设置”中上传你的基础简历，上传后回来告诉我继续即可。"
    if workflow in {"JDAnalysis", "ResumeOptimization", "JobMatching", "GreetingGeneration"} and not context.get("has_jd_content"):
        return "可以。开始前只缺一项：请把完整 JD 粘贴给我，我会直接按你刚才的目标继续，不要求补做其他步骤。"
    return None


def welcome_message(
    company: str | None,
    role: str | None,
    has_jd: bool,
    analysis: dict | None = None,
) -> str:
    """Build a concise, conversational case opening instead of a JD artifact."""
    target = " · ".join(part for part in (company, role) if part) or "这个岗位"
    analysis = analysis if isinstance(analysis, dict) else {}
    skills = analysis.get("skills") if isinstance(analysis.get("skills"), list) else []
    skill_names = [
        item.get("name", "").strip()
        for item in skills
        if isinstance(item, dict) and item.get("name")
    ][:3]
    job_level = str(analysis.get("job_level") or "").strip()
    job_family = str(analysis.get("job_family") or "").strip()

    lines = [f"我目前获取到你想分析的岗位是「{target}」。"]
    if analysis:
        role_description = "".join(part for part in (job_level, job_family) if part)
        focus = "、".join(skill_names)
        if role_description and focus:
            lines.append(f"我先简单看了一下：这是一个偏{role_description}的岗位，重点关注{focus}。")
        elif focus:
            lines.append(f"我先简单看了一下：岗位重点关注{focus}。")
        else:
            lines.append("我已经读取了岗位信息，可以直接围绕你的目标继续。")
    elif has_jd:
        lines.append("我已经拿到完整岗位信息，可以边和你聊、边根据你的目标继续处理。")
    else:
        lines.append("目前还没有完整岗位信息；你可以粘贴 JD，也可以先告诉我你最想解决的问题。")

    lines.append(
        "你下一步更想解决什么？比如判断是否值得投、直接优化简历、准备面试，"
        "或者记录已经发生的投递进度。你也可以直接用自己的话告诉我。"
    )
    return "\n\n".join(lines)


def jd_conversation_reply(company: str | None, role: str | None, analysis: dict | None) -> str:
    """Turn a completed JD analysis into a chat response, not a workflow card."""
    opening = welcome_message(company, role, True, analysis)
    question = "你希望我接下来判断岗位匹配度、直接优化简历，还是先准备面试？"
    paragraphs = opening.split("\n\n")
    if paragraphs:
        paragraphs[-1] = question
    return "\n\n".join(paragraphs)


def build_match_conversation_summary(match_result: dict | None) -> str:
    """Summarize a matching artifact as a short conversational conclusion."""
    result = match_result if isinstance(match_result, dict) else {}
    score_breakdown = result.get("score_breakdown") if isinstance(result.get("score_breakdown"), dict) else {}
    score = result.get("score") if result.get("score") is not None else score_breakdown.get("total")
    reason = str(result.get("reason") or "").strip()

    def names(items: object) -> list[str]:
        if not isinstance(items, list):
            return []
        values: list[str] = []
        for item in items:
            if isinstance(item, str) and item.strip():
                values.append(item.strip())
            elif isinstance(item, dict):
                value = item.get("name") or item.get("skill") or item.get("requirement")
                if value:
                    values.append(str(value).strip())
        return values

    strengths = names(result.get("must_skill_match"))[:3]
    gaps = names(result.get("missing_skills"))[:3]
    score_text = f"综合匹配度约为 {score}%" if isinstance(score, (int, float)) else "岗位匹配分析已经完成"
    parts = [f"初步结论：{score_text}。"]
    if strengths:
        parts.append(f"比较明确的优势是{'、'.join(strengths)}。")
    if gaps:
        parts.append(f"目前需要重点补强的是{'、'.join(gaps)}。")
    if reason:
        parts.append(reason)
    return "".join(parts)


def parse_application_update(message: str, now: datetime | None = None) -> dict:
    """Parse common application/reminder expressions without another model call."""
    current = now or datetime.now()
    text = message or ""

    def relative_date(keyword: str, offset: int) -> str | None:
        return (current.date() + timedelta(days=offset)).isoformat() if keyword in text else None

    apply_time = (
        relative_date("昨天", -1)
        or relative_date("今天", 0)
        or relative_date("前天", -2)
    )
    reminder_time = (
        relative_date("后天", 2)
        or relative_date("明天", 1)
        or relative_date("今天提醒", 0)
    )

    dates = re.findall(r"(?<!\d)(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?", text)
    normalized_dates = [f"{int(year):04d}-{int(month):02d}-{int(day):02d}" for year, month, day in dates]
    if normalized_dates:
        if any(marker in text for marker in ("投递", "申请")) and not apply_time:
            apply_time = normalized_dates[0]
        if any(marker in text for marker in ("提醒", "跟进", "检查进度")):
            reminder_time = normalized_dates[-1]

    url_match = re.search(r"https?://[^\s]+", text)
    future_application = any(marker in text for marker in ("明天投递", "后天投递", "准备投递", "计划投递", "打算投递"))
    applied = not future_application and any(marker in text for marker in ("已投递", "进行了投递", "投递了", "已经申请", "申请了", "已申请"))
    return {
        "applied": applied,
        "link": url_match.group(0).rstrip("，。,.！!") if url_match else "",
        "apply_time": apply_time or "",
        "reminder_time": reminder_time or "",
    }
