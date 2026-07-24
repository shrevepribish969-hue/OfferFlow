
import json
import re
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from ..api import models
from ..api.workflow_engine import SkillExecutor

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
_API_KEY = os.getenv("DEEPSEEK_API_KEY")
_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
_MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")


class JobService:
    @staticmethod
    async def create_job(jd_content: str, db: Session) -> models.JobCase:
        client = AsyncOpenAI(api_key=_API_KEY, base_url=_BASE_URL)
        prompt = (
            "Extract the Company Name and Role Title from the following Job Description (JD). "
            "If missing, guess or write 'Unknown'. "
            "Output JSON format: {'company': '...', 'role': '...'}"
        )
        try:
            response = await client.chat.completions.create(
                model=_MODEL_NAME,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": jd_content[:2000]}
                ],
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            text = response.choices[0].message.content.strip()
            json_match = re.search(r"\{.*\}", text, re.DOTALL)
            if json_match:
                text = json_match.group(0)
            parsed = json.loads(text)
            company = parsed.get("company", "Unknown Company")
            role = parsed.get("role", "Unknown Role")
        except Exception:
            company = "Unknown Company"
            role = "Unknown Role"

        new_job = models.JobCase(
            company=company,
            role=role,
            status="init",
            match_score=None,
            jd_content=jd_content
        )
        db.add(new_job)
        db.commit()
        db.refresh(new_job)

        SkillExecutor.append_timeline_event(db, new_job.id, "JobCaseCreated")
        SkillExecutor.append_timeline_event(db, new_job.id, "JDUploaded")

        return new_job
