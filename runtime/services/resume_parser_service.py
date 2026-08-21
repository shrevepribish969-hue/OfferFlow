import asyncio
import copy
import json
import logging
import re
from typing import Any, Awaitable, Callable

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "1.2"


class ResumeParseError(Exception):
    def __init__(self, error_code: str, message: str, detail: str | None = None):
        super().__init__(message)
        self.error_code = error_code
        self.detail = detail or message


def empty_resume_schema() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "personal_info": {
            "name": "",
            "contact": "",
            "job_intention": "",
            "availability": "",
            "preferred_locations": [],
            "summary": "",
        },
        "personal_strengths": [],
        "education": [],
        "work_experience": [],
        "project_experience": [],
        "campus_experience": [],
        "skills": [],
        "awards_certificates": [],
        "custom_sections": [],
        "document_notes": [],
    }


RESUME_PARSER_PROMPT = """
You are an expert resume parser. Extract and classify the raw resume text into structured JSON.

Core rules:
1. Extract and classify only. Do not polish, summarize, rewrite, optimize, or invent content.
2. Preserve the user's original wording inside descriptions and list items.
3. Do not fabricate company, role, date, project, skill, school, metric, certificate, or award.
4. Return ONLY valid JSON matching the schema. Use empty strings or empty arrays when content is missing.
5. Empty section titles must stay empty. Do not merge an empty section with the next section.
6. One description item must not contain multiple obvious section titles.

Classification rules:
1. Job intention, availability, and preferred cities must go to personal_info.job_intention,
   personal_info.availability, and personal_info.preferred_locations. Do not put them in summary.
2. Sections named 个人优势, 自我评价, 个人总结, 核心优势 go to personal_strengths as original bullet/list items.
3. Student union, club, class duty, campus media, school activity, and volunteer activity go to campus_experience.
4. Awards, certificates, contests, language tests, professional certificates go to awards_certificates.
5. Template instructions, replacement reminders, placeholders, examples, and disclaimers go to document_notes.
6. Less common titled sections go to custom_sections and preserve original section_title.
7. If type is uncertain, preserve the content in custom_sections instead of guessing.

Target schema:
{
  "schema_version": "1.2",
  "personal_info": {
    "name": "",
    "contact": "",
    "job_intention": "",
    "availability": "",
    "preferred_locations": [],
    "summary": ""
  },
  "personal_strengths": [],
  "education": [
    {"school": "", "degree": "", "date": "", "major": ""}
  ],
  "work_experience": [
    {"company": "", "role": "", "date": "", "descriptions": []}
  ],
  "project_experience": [
    {"project": "", "role": "", "date": "", "descriptions": []}
  ],
  "campus_experience": [
    {"organization": "", "role": "", "date": "", "descriptions": []}
  ],
  "skills": [],
  "awards_certificates": [],
  "custom_sections": [
    {
      "section_title": "",
      "section_type": "",
      "items": [
        {"title": "", "organization": "", "role": "", "date": "", "descriptions": []}
      ]
    }
  ],
  "document_notes": []
}
"""


SECTION_TITLE_RE = re.compile(
    r"(?m)^(个人信息|求职意向|个人优势|自我评价|个人总结|核心优势|教育经历|教育背景|工作经历|实习经历|项目经历|校园经历|校园实践|社团经历|学生工作|志愿经历|技能证书|技能|证书|荣誉奖项|奖项|其他)\s*$"
)
TEMPLATE_NOTE_RE = re.compile(r"(请替换|可删除|可补充|示例|模板|免责声明|按实际情况|your-link|name@example\.com)")
UNKNOWN_FALLBACK_RE = re.compile(r"Unknown Company|Unknown")


def _as_string(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            result.append(item.strip())
    return result


def _as_locations(value: Any) -> list[str]:
    if isinstance(value, str):
        return [part.strip() for part in re.split(r"[/,，、|｜]", value) if part.strip()]
    return _as_string_list(value)


def _normalize_description_item(item: Any, title_key: str) -> dict[str, Any]:
    item = item if isinstance(item, dict) else {}
    normalized = {
        title_key: _as_string(item.get(title_key)),
        "role": _as_string(item.get("role")),
        "date": _as_string(item.get("date")),
        "descriptions": _as_string_list(item.get("descriptions")),
    }
    if title_key == "company":
        normalized["company"] = _as_string(item.get("company"))
    if title_key == "project":
        normalized["project"] = _as_string(item.get("project"))
    if title_key == "organization":
        normalized["organization"] = _as_string(item.get("organization"))
    return normalized


def _normalize_custom_sections(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    sections: list[dict[str, Any]] = []
    for section in value:
        if not isinstance(section, dict):
            continue
        items = []
        for item in section.get("items", []):
            if not isinstance(item, dict):
                continue
            items.append({
                "title": _as_string(item.get("title")),
                "organization": _as_string(item.get("organization")),
                "role": _as_string(item.get("role")),
                "date": _as_string(item.get("date")),
                "descriptions": _as_string_list(item.get("descriptions")),
            })
        sections.append({
            "section_title": _as_string(section.get("section_title")),
            "section_type": _as_string(section.get("section_type")),
            "items": items,
        })
    return sections


def normalize_resume_schema(raw_resume: Any) -> dict[str, Any]:
    if isinstance(raw_resume, str):
        try:
            raw_resume = json.loads(raw_resume)
        except json.JSONDecodeError:
            normalized = empty_resume_schema()
            if raw_resume.strip():
                normalized["custom_sections"] = [{
                    "section_title": "原始简历",
                    "section_type": "legacy_plain_text",
                    "items": [{
                        "title": "",
                        "organization": "",
                        "role": "",
                        "date": "",
                        "descriptions": [raw_resume],
                    }],
                }]
            return normalized

    raw_resume = raw_resume if isinstance(raw_resume, dict) else {}
    normalized = empty_resume_schema()
    normalized["schema_version"] = SCHEMA_VERSION

    personal_info = raw_resume.get("personal_info") if isinstance(raw_resume.get("personal_info"), dict) else {}
    normalized["personal_info"] = {
        "name": _as_string(personal_info.get("name")),
        "contact": _as_string(personal_info.get("contact")),
        "job_intention": _as_string(personal_info.get("job_intention")),
        "availability": _as_string(personal_info.get("availability")),
        "preferred_locations": _as_locations(personal_info.get("preferred_locations")),
        "summary": _as_string(personal_info.get("summary")),
    }

    normalized["personal_strengths"] = _as_string_list(raw_resume.get("personal_strengths"))
    normalized["education"] = [
        {
            "school": _as_string(item.get("school")) if isinstance(item, dict) else "",
            "degree": _as_string(item.get("degree")) if isinstance(item, dict) else "",
            "date": _as_string(item.get("date")) if isinstance(item, dict) else "",
            "major": _as_string(item.get("major")) if isinstance(item, dict) else "",
        }
        for item in raw_resume.get("education", [])
        if isinstance(item, dict)
    ] if isinstance(raw_resume.get("education"), list) else []
    normalized["work_experience"] = [
        _normalize_description_item(item, "company")
        for item in raw_resume.get("work_experience", [])
        if isinstance(item, dict)
    ] if isinstance(raw_resume.get("work_experience"), list) else []
    normalized["project_experience"] = [
        _normalize_description_item(item, "project")
        for item in raw_resume.get("project_experience", [])
        if isinstance(item, dict)
    ] if isinstance(raw_resume.get("project_experience"), list) else []
    normalized["campus_experience"] = [
        _normalize_description_item(item, "organization")
        for item in raw_resume.get("campus_experience", [])
        if isinstance(item, dict)
    ] if isinstance(raw_resume.get("campus_experience"), list) else []
    normalized["skills"] = _as_string_list(raw_resume.get("skills"))
    normalized["awards_certificates"] = _as_string_list(raw_resume.get("awards_certificates"))
    normalized["custom_sections"] = _normalize_custom_sections(raw_resume.get("custom_sections"))
    normalized["document_notes"] = _as_string_list(raw_resume.get("document_notes"))

    legacy_others = _as_string_list(raw_resume.get("others"))
    if legacy_others:
        normalized["custom_sections"].append({
            "section_title": "其他",
            "section_type": "legacy_others",
            "items": [{
                "title": "",
                "organization": "",
                "role": "",
                "date": "",
                "descriptions": legacy_others,
            }],
        })

    _extract_structured_personal_info(normalized)
    _move_template_notes(normalized)
    return normalized


def _extract_structured_personal_info(resume: dict[str, Any]) -> None:
    info = resume["personal_info"]
    summary = info.get("summary", "")
    if not summary:
        return
    kept_lines = []
    for line in [part.strip() for part in re.split(r"[\n；;]", summary) if part.strip()]:
        if line.startswith("求职意向") and not info["job_intention"]:
            info["job_intention"] = line.split("：", 1)[-1].split(":", 1)[-1].strip()
        elif line.startswith("到岗时间") and not info["availability"]:
            info["availability"] = line.split("：", 1)[-1].split(":", 1)[-1].strip()
        elif line.startswith("期望地点") or line.startswith("期望城市"):
            if not info["preferred_locations"]:
                value = line.split("：", 1)[-1].split(":", 1)[-1].strip()
                info["preferred_locations"] = _as_locations(value)
        else:
            kept_lines.append(line)
    info["summary"] = "\n".join(kept_lines)


def _move_template_notes(resume: dict[str, Any]) -> None:
    for key in ("personal_strengths", "skills", "awards_certificates", "document_notes"):
        retained = []
        for item in resume.get(key, []):
            if TEMPLATE_NOTE_RE.search(item):
                if item not in resume["document_notes"]:
                    resume["document_notes"].append(item)
            else:
                retained.append(item)
        if key != "document_notes":
            resume[key] = retained

    for section_key in ("work_experience", "project_experience", "campus_experience"):
        for item in resume.get(section_key, []):
            retained = []
            for desc in item.get("descriptions", []):
                if TEMPLATE_NOTE_RE.search(desc):
                    if desc not in resume["document_notes"]:
                        resume["document_notes"].append(desc)
                else:
                    retained.append(desc)
            item["descriptions"] = retained


def validate_resume_schema(resume: dict[str, Any], raw_text: str = "") -> None:
    if not isinstance(resume, dict):
        raise ResumeParseError("INVALID_RESUME_SCHEMA", "Parsed resume is not a JSON object.")
    required_keys = set(empty_resume_schema().keys())
    missing = required_keys - set(resume.keys())
    if missing:
        raise ResumeParseError("INVALID_RESUME_SCHEMA", f"Missing resume fields: {', '.join(sorted(missing))}")

    serialized = json.dumps(resume, ensure_ascii=False)
    if UNKNOWN_FALLBACK_RE.search(serialized):
        raise ResumeParseError("LOW_QUALITY_PARSE", "Parsed resume contains fallback Unknown values.")

    evidence_count = sum(len(resume.get(key, [])) for key in (
        "education",
        "work_experience",
        "project_experience",
        "campus_experience",
        "skills",
        "awards_certificates",
        "personal_strengths",
        "custom_sections",
    ))
    has_identity = bool(resume.get("personal_info", {}).get("name") or resume.get("personal_info", {}).get("contact"))
    if raw_text.strip() and not (has_identity or evidence_count):
        raise ResumeParseError("LOW_QUALITY_PARSE", "Parsed resume has no usable candidate evidence.")

    for section_key in ("work_experience", "project_experience", "campus_experience"):
        for item in resume.get(section_key, []):
            for desc in item.get("descriptions", []):
                if _contains_multiple_section_titles(desc):
                    raise ResumeParseError(
                        "LOW_QUALITY_PARSE",
                        "A description contains multiple section titles, indicating merged sections.",
                    )


def _contains_multiple_section_titles(text: str) -> bool:
    return len(SECTION_TITLE_RE.findall(text)) >= 2


def quality_check_resume(resume: dict[str, Any], raw_text: str = "") -> dict[str, Any]:
    normalized = normalize_resume_schema(copy.deepcopy(resume))
    validate_resume_schema(normalized, raw_text)
    return normalized


def extract_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ResumeParseError("INVALID_MODEL_JSON", "Model response did not contain a JSON object.")
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise ResumeParseError("INVALID_MODEL_JSON", "Model response JSON could not be parsed.", str(exc)) from exc


async def parse_resume_to_json(
    raw_text: str,
    *,
    api_key: str,
    base_url: str,
    model_name: str,
    llm_call: Callable[[str, str], Awaitable[str]] | None = None,
) -> str:
    if not raw_text.strip():
        raise ResumeParseError("EMPTY_RESUME_TEXT", "The uploaded file did not contain readable resume text.")

    async def default_llm_call(system_prompt: str, user_text: str) -> str:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=90.0, max_retries=0)
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text[:12000]},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content.strip()

    caller = llm_call or default_llm_call
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            raw_response = await caller(RESUME_PARSER_PROMPT, raw_text)
            parsed = extract_json_object(raw_response)
            normalized = quality_check_resume(parsed, raw_text)
            return json.dumps(normalized, ensure_ascii=False)
        except ResumeParseError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt == 0:
                logger.warning("Resume parser model call failed; retrying once: %s", exc.__class__.__name__)
                await asyncio.sleep(1)
                continue
            logger.warning("Resume parser model call failed after retry: %s", exc.__class__.__name__)
            raise ResumeParseError("MODEL_CALL_FAILED", "Resume parser model call failed.", exc.__class__.__name__) from exc

    raise ResumeParseError("MODEL_CALL_FAILED", "Resume parser model call failed.", str(last_exc))
