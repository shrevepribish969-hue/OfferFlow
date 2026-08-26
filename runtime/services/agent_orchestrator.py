"""Conversation-first routing helpers for the Case Manager Agent."""

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


def infer_explicit_workflow(message: str) -> str | None:
    """Route clear action requests while leaving questions to the LLM brain."""
    text = re.sub(r"\s+", "", message or "").lower()
    if not text:
        return None

    # Questions about existing results should remain conversational.
    if any(marker in text for marker in ("为什么", "怎么理解", "什么意思", "原因是什么", "解释一下")):
        return None
    is_confirmation_question = text.endswith(("吗", "吗?", "吗？")) or text.startswith(("是否", "能否", "可不可以"))
    if is_confirmation_question and not any(verb in text for verb in ("帮我", "给我", "请", "开始")):
        return None

    routes = (
        ("InterviewEvaluation", ("复盘面试", "分析面试记录", "分析逐字稿", "面试复盘", "面试打分")),
        ("InterviewPrep", ("准备面试", "准备一面", "准备二面", "准备hr面", "面试准备", "预测面试", "生成面试题", "模拟面试")),
        ("GreetingGeneration", ("打招呼", "沟通话术", "投递话术", "boss话术", "私信文案")),
        ("ContentGeneration", ("生成最终简历", "生成终版简历", "导出简历", "排版简历")),
        ("ResumeOptimization", ("优化简历", "修改简历", "改简历", "润色简历", "定向简历")),
        ("JobMatching", ("匹配度分析", "分析匹配度", "计算匹配度", "评估匹配", "匹配我的简历")),
        ("JDAnalysis", ("分析jd", "解析jd", "分析岗位", "提取岗位要求", "提取jd", "岗位分析")),
        ("Reflection", ("沉淀复盘", "写入记忆", "总结复盘")),
        ("UpdateJobCase", ("记录投递", "已经投递", "已投递", "进行了投递", "提醒我检查进度", "提醒我跟进")),
    )
    for workflow, phrases in routes:
        if any(phrase in text for phrase in phrases):
            return workflow
    return None


def execution_intro(workflow: str, context: dict | None = None) -> str:
    context = context or {}
    label = WORKFLOW_LABELS.get(workflow, "专业 Agent")
    if workflow == "ResumeOptimization":
        if not context.get("has_jd_analysis"):
            return (
                "明白，我们可以跳过匹配评分，直接优化简历。"
                "我会先在后台提取这份 JD 的关键要求，再调用简历优化 Agent；"
                "不会额外生成你没有要求的匹配报告。"
            )
        return "明白，我会直接调用简历优化 Agent，结合这份 JD 给出可逐条确认的修改建议。"
    if workflow == "InterviewPrep":
        return "好的，我会调用面试准备 Agent，结合岗位信息和你的真实经历生成本轮准备内容。"
    if workflow == "JobMatching":
        return "好的，我会调用岗位匹配 Agent，对照 JD 与你的基础简历分析优势和差距。"
    if workflow == "JDAnalysis":
        return "好的，我会先调用岗位分析 Agent，提取职责、硬性要求和关键能力。"
    if workflow == "GreetingGeneration":
        return "好的，我会调用沟通话术 Agent，基于岗位重点和你的真实优势生成可直接修改的话术。"
    if workflow == "ContentGeneration":
        return "好的，我会调用简历生成 Agent，把已确认的修改整理成最终版本。"
    if workflow == "InterviewEvaluation":
        return "明白，我会调用面试复盘 Agent 分析记录；结论会先给你确认，再决定是否沉淀为长期记忆。"
    if workflow == "UpdateJobCase":
        return "明白，我会调用求职进度 Agent 记录投递时间和跟进提醒，并把它加入你的任务日程。"
    return f"明白，我会调用{label}处理这项任务。"


def missing_context_reply(workflow: str, context: dict | None = None) -> str | None:
    context = context or {}
    if workflow in {"ResumeOptimization", "JobMatching", "ContentGeneration"} and not context.get("has_base_resume"):
        return "可以。开始前只缺一项：请先在“设置”中上传你的基础简历，上传后回来告诉我继续即可。"
    if workflow in {"JDAnalysis", "ResumeOptimization", "JobMatching", "GreetingGeneration"} and not context.get("has_jd_content"):
        return "可以。开始前只缺一项：请把完整 JD 粘贴给我，我会直接按你刚才的目标继续，不要求补做其他步骤。"
    return None


def welcome_message(company: str | None, role: str | None, has_jd: bool) -> str:
    target = " · ".join(part for part in (company, role) if part) or "这个岗位"
    context = "我已经读取了岗位信息" if has_jd else "目前还没有完整 JD"
    return (
        f"我们来处理 **{target}**。{context}。\n\n"
        "你想先做什么？可以直接告诉我，例如：\n"
        "- “这个岗位我一定会投，跳过匹配，直接优化简历”\n"
        "- “先帮我判断值不值得投”\n"
        "- “直接准备一面”\n\n"
        "流程不是固定的，我会根据你的目标调用合适的 Agent。"
    )


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
    return {
        "applied": any(marker in text for marker in ("投递", "申请了", "已申请")),
        "link": url_match.group(0).rstrip("，。,.！!") if url_match else "",
        "apply_time": apply_time or "",
        "reminder_time": reminder_time or "",
    }
