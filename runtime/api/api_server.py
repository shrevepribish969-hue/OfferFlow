from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
import uvicorn
import asyncio
import json
import os
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv

from . import models
from .database import engine, get_db
from .leads_router import router as leads_router

from pydantic import BaseModel

class JobCreate(BaseModel):
    jd_content: str

class ProfileUpdate(BaseModel):
    base_resume: str

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(leads_router, prefix="/api/leads", tags=["leads"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/jobs")
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.JobCase).order_by(models.JobCase.updated_at.desc()).all()
    return jobs

@app.get("/api/export")
def export_data(db: Session = Depends(get_db)):
    jobs = db.query(models.JobCase).all()
    profile = db.query(models.UserProfile).first()
    messages = db.query(models.ChatMessage).all()
    stories = db.query(models.StoryCard).all()
    
    # Parse base_resume if it's a valid JSON string
    base_resume_parsed = {}
    if profile and profile.base_resume:
        try:
            base_resume_parsed = json.loads(profile.base_resume)
        except:
            base_resume_parsed = profile.base_resume

    export_data = {
        "profile": {
            "base_resume": base_resume_parsed,
            "user_memory": profile.user_memory if profile else {}
        } if profile else None,
        "jobs": [
            {
                "id": job.id,
                "company": job.company,
                "role": job.role,
                "status": job.status,
                "match_score": job.match_score,
                "jd_content": job.jd_content,
                "workflow_data": job.workflow_data,
                "context_files": job.context_files,
                "memory_tags": job.memory_tags,
                "created_at": job.created_at.isoformat() if hasattr(job, 'created_at') and job.created_at else None,
                "updated_at": job.updated_at.isoformat() if hasattr(job, 'updated_at') and job.updated_at else None,
            } for job in jobs
        ],
        "messages": [
            {
                "id": msg.id,
                "job_case_id": msg.job_case_id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() if hasattr(msg, 'created_at') and msg.created_at else None,
            } for msg in messages
        ],
        "stories": [
            {
                "id": story.id,
                "project_name": story.project_name,
                "summary": story.summary,
                "competency_tags": story.competency_tags,
                "star_details": story.star_details,
                "performance_score": story.performance_score,
            } for story in stories
        ]
    }
    return export_data

@app.post("/api/export_local")
def export_local(db: Session = Depends(get_db)):
    data = export_data(db)
    import datetime
    import os
    
    filename = f"offerflow_export_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    # Fallback if PROJECT_ROOT is not in scope here
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    filepath = os.path.join(root_dir, filename)
    
    with open(filepath, "w", encoding="utf-8") as f:
        import json
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    return {"status": "success", "file_path": filepath}

@app.get("/api/user/profile")
def get_profile(db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).first()
    if not profile:
        profile = models.UserProfile(base_resume="")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return {"base_resume": profile.base_resume}

class ApplyUpdate(BaseModel):
    applied: bool
    link: str = ""
    apply_time: str = ""
    reminder_time: str = ""

@app.put("/api/jobs/{job_id}/apply")
def update_apply(job_id: int, data: ApplyUpdate, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job: raise HTTPException(404)
    w_data = dict(job.workflow_data) if job.workflow_data else {}
    w_data["apply_status"] = data.model_dump() if hasattr(data, 'model_dump') else data.dict()
    job.workflow_data = w_data
    if data.applied:
        job.status = "已投递"
    db.commit()
    return {"status": "success"}

class OfferUpdate(BaseModel):
    result: str
    thoughts: str = ""

@app.put("/api/jobs/{job_id}/offer")
def update_offer(job_id: int, data: OfferUpdate, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job: raise HTTPException(404)
    w_data = dict(job.workflow_data) if job.workflow_data else {}
    w_data["offer_status"] = data.model_dump() if hasattr(data, 'model_dump') else data.dict()
    job.workflow_data = w_data
    job.status = data.result
    db.commit()
    return {"status": "success"}

async def parse_resume_to_json(raw_text: str) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    prompt = """
You are an expert resume parser. Your task is to faithfully extract all information from the provided raw resume text and convert it into a highly structured JSON format.
CRITICAL RULES:
1. DO NOT rewrite, summarize, or optimize any content. You must transcribe the original text exactly as it is.
2. DO NOT change the user's original structure. For example, if they listed an internship under work experience, keep it in work_experience. Do not move things between sections arbitrarily.
3. IMPORTANT: You must return ONLY valid JSON matching the exact schema below. Do not omit any sections; use empty arrays/strings if data is missing.

SCHEMA:
{
  "personal_info": {
    "name": "string",
    "contact": "string",
    "summary": "string"
  },
  "education": [
    {
      "school": "string",
      "degree": "string",
      "date": "string",
      "major": "string"
    }
  ],
  "work_experience": [
    {
      "company": "string",
      "role": "string",
      "date": "string",
      "descriptions": ["string", "string"]
    }
  ],
  "project_experience": [
    {
      "project": "string",
      "role": "string",
      "date": "string",
      "descriptions": ["string", "string"]
    }
  ],
  "skills": ["string"],
  "others": ["string"]
}
"""
    try:
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": raw_text[:4000]}
            ],
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        text = response.choices[0].message.content.strip()
        import re
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            text = json_match.group(0)
        import json
        json.loads(text) # validate
        return text
    except Exception as e:
        print("Failed to parse resume to JSON:", e)
        import json
        return json.dumps({
            "personal_info": {"name": "Unknown", "contact": "", "summary": ""},
            "education": [],
            "work_experience": [{"company": "Unknown Company", "role": "", "date": "", "descriptions": [raw_text]}],
            "project_experience": [],
            "skills": [],
            "others": []
        }, ensure_ascii=False)

@app.post("/api/user/resume_upload")
async def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = ""
    filename = file.filename.lower()
    
    try:
        if filename.endswith(".pdf"):
            import fitz
            pdf_bytes = await file.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page in doc:
                content += page.get_text()
        elif filename.endswith(".docx"):
            import docx
            import io
            docx_bytes = await file.read()
            doc = docx.Document(io.BytesIO(docx_bytes))
            for para in doc.paragraphs:
                content += para.text + "\n"
        elif filename.endswith(".txt") or filename.endswith(".md"):
            content = (await file.read()).decode("utf-8")
        else:
            return {"error": "Unsupported file format. Please upload PDF, Word (docx), TXT, or MD files."}
            
        
        json_content = await parse_resume_to_json(content)
            
        profile = db.query(models.UserProfile).first()
        if not profile:
            profile = models.UserProfile(base_resume=json_content)
            db.add(profile)
        else:
            profile.base_resume = json_content
        db.commit()
        db.refresh(profile)
        
        # Trigger Story Bank extraction in the background
        from runtime.services.story_service import StoryService
        import asyncio
        asyncio.create_task(StoryService.parse_resume_to_stories(db, profile.id))
        
        return {"message": "Resume parsed successfully.", "extracted_text": json_content}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"File processing error: {str(e)}"}

@app.post("/api/user/profile")
async def update_profile(prof: ProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).first()
    
    # Check if the incoming string is valid JSON
    content_to_save = prof.base_resume
    import json
    try:
        json.loads(content_to_save)
    except:
        # Not JSON, parse it
        content_to_save = await parse_resume_to_json(content_to_save)
        
    if not profile:
        profile = models.UserProfile(base_resume=content_to_save)
        db.add(profile)
    else:
        profile.base_resume = content_to_save
    db.commit()
    db.refresh(profile)
    
    # Trigger Story Bank extraction
    from runtime.services.story_service import StoryService
    import asyncio
    asyncio.create_task(StoryService.parse_resume_to_stories(db, profile.id))
    
    return {"message": "Profile updated", "base_resume": profile.base_resume}

@app.post("/api/jobs")
async def create_job(job: JobCreate, db: Session = Depends(get_db)):
    from ..services.job_service import JobService
    await JobService.create_job(job.jd_content, db)
    # Re-query to avoid serialization issues with detached ORM objects
    new_job = db.query(models.JobCase).order_by(models.JobCase.id.desc()).first()
    return new_job

@app.get("/api/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    return db.query(models.JobCase).filter(models.JobCase.id == job_id).first()

@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Also delete associated chat messages to avoid foreign key constraint errors
    db.query(models.ChatMessage).filter(models.ChatMessage.job_case_id == job_id).delete()
    
    db.delete(job)
    db.commit()
    return {"status": "success", "message": "Job deleted successfully"}

class StatusUpdate(BaseModel):
    status: str

@app.put("/api/jobs/{job_id}/status")
def update_job_status(job_id: int, req: StatusUpdate, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = req.status
    db.commit()
    db.refresh(job)
    return {"status": "success", "new_status": job.status}

class FeedbackCreate(BaseModel):
    message_id: str | None = None
    card_type: str | None = None
    feedback: str
    feedback_type: str = "quality"
    note: str | None = None
    event_data: dict = {}

def _feedback_target_matches(event: models.FeedbackEvent, req: FeedbackCreate) -> bool:
    req_data = req.event_data or {}
    event_data = event.event_data or {}
    req_ai_run_id = req_data.get("ai_run_id")
    event_ai_run_id = event_data.get("ai_run_id")

    if req_ai_run_id is not None:
        return str(event_ai_run_id) == str(req_ai_run_id)
    if req.message_id:
        return event.message_id == req.message_id
    if req.card_type:
        return event.card_type == req.card_type
    return False

@app.get("/api/jobs/{job_id}/feedback")
def get_job_feedback(job_id: int, db: Session = Depends(get_db)):
    events = db.query(models.FeedbackEvent).filter(
        models.FeedbackEvent.job_case_id == job_id
    ).order_by(models.FeedbackEvent.created_at.desc()).all()
    return [
        {
            "id": event.id,
            "job_case_id": event.job_case_id,
            "message_id": event.message_id,
            "card_type": event.card_type,
            "feedback": event.feedback,
            "feedback_type": event.feedback_type,
            "note": event.note,
            "event_data": event.event_data,
            "created_at": event.created_at.isoformat() if event.created_at else None,
        }
        for event in events
    ]

@app.post("/api/jobs/{job_id}/feedback")
def create_job_feedback(job_id: int, req: FeedbackCreate, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing_events = db.query(models.FeedbackEvent).filter(
        models.FeedbackEvent.job_case_id == job_id
    ).order_by(models.FeedbackEvent.created_at.desc()).all()
    event = next((item for item in existing_events if _feedback_target_matches(item, req)), None)
    result_status = "updated" if event else "created"

    if event:
        event.message_id = req.message_id
        event.card_type = req.card_type
        event.feedback = req.feedback
        event.feedback_type = req.feedback_type
        event.note = req.note
        event.event_data = req.event_data or {}
    else:
        event = models.FeedbackEvent(
            job_case_id=job_id,
            message_id=req.message_id,
            card_type=req.card_type,
            feedback=req.feedback,
            feedback_type=req.feedback_type,
            note=req.note,
            event_data=req.event_data or {},
        )
        db.add(event)

    db.commit()
    db.refresh(event)
    return {
        "id": event.id,
        "status": result_status,
        "feedback": event.feedback,
        "card_type": event.card_type,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }

@app.get("/api/jobs/{job_id}/ai_runs")
def get_job_ai_runs(job_id: int, db: Session = Depends(get_db)):
    runs = db.query(models.AIRun).filter(
        models.AIRun.job_case_id == job_id
    ).order_by(models.AIRun.started_at.desc()).all()
    return [
        {
            "id": run.id,
            "job_case_id": run.job_case_id,
            "workflow_name": run.workflow_name,
            "agent_name": run.agent_name,
            "status": run.status,
            "model_name": run.model_name,
            "input_summary": run.input_summary,
            "output_summary": run.output_summary,
            "error_message": run.error_message,
            "latency_ms": run.latency_ms,
            "run_data": run.run_data,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }
        for run in runs
    ]

from fastapi.responses import StreamingResponse
import asyncio
import json

from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    message: str
    is_system_trigger: bool = False
    system_workflow: Optional[str] = None
    round_id: Optional[str] = None


@app.get("/api/jobs/{job_id}/resume_versions")
def get_resume_versions(job_id: int, db: Session = Depends(get_db)):
    versions = db.query(models.ResumeVersion).filter(
        models.ResumeVersion.job_case_id == job_id
    ).order_by(models.ResumeVersion.version_number.desc()).all()
    return versions


class ResumeVersionStatusUpdate(BaseModel):
    status: str


@app.put("/api/jobs/{job_id}/resume_versions/{version_id}/status")
def update_resume_version_status(job_id: int, version_id: int, req: ResumeVersionStatusUpdate, db: Session = Depends(get_db)):
    rv = db.query(models.ResumeVersion).filter(
        models.ResumeVersion.id == version_id,
        models.ResumeVersion.job_case_id == job_id
    ).first()
    if not rv:
        raise HTTPException(status_code=404, detail="ResumeVersion not found")
    rv.status = req.status
    db.commit()
    return {"status": "success", "new_status": rv.status}



@app.get("/api/jobs/{job_id}/interviews")
def get_interviews(job_id: int, db: Session = Depends(get_db)):
    interviews = db.query(models.Interview).filter(
        models.Interview.job_case_id == job_id
    ).order_by(models.Interview.round_number.desc()).all()
    return interviews


@app.get("/api/jobs/{job_id}/reflections")
def get_reflections(job_id: int, db: Session = Depends(get_db)):
    reflections = db.query(models.Reflection).filter(
        models.Reflection.job_case_id == job_id
    ).order_by(models.Reflection.created_at.desc()).all()
    return reflections



@app.get("/api/memory")
def get_memory(db: Session = Depends(get_db)):
    from ..services.memory_service import MemoryService
    context = MemoryService.get_context(db)
    return context


class PatchRequest(BaseModel):
    module: str
    target_name: str
    original: str
    suggestion: str

@app.post("/api/jobs/{job_id}/apply_patch")
def apply_patch(job_id: int, request: PatchRequest, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    w_data = dict(job.workflow_data) if job.workflow_data else {}
    resume_json = w_data.get("resume_json")
    if not resume_json:
        profile = db.query(models.UserProfile).first()
        resume_json = json.loads(profile.base_resume) if profile and profile.base_resume else {}
        
    res_str = json.dumps(resume_json, ensure_ascii=False)
    # Simple string replace for the patch
    res_str = res_str.replace(request.original, request.suggestion)
    resume_json = json.loads(res_str)
    
    w_data["resume_json"] = resume_json
    job.workflow_data = w_data
    db.commit()
    return {"status": "success", "updated_resume": resume_json}

import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
ROUTER_PROMPT_PATH = os.path.join(PROJECT_ROOT, "prompts", "260713Prompt_Agent_Brain.md")
try:
    with open(ROUTER_PROMPT_PATH, "r", encoding="utf-8") as f:
        ROUTER_PROMPT = f.read()
except Exception:
    ROUTER_PROMPT = "You are an Agent Brain. Reply in JSON."

def start_ai_run(db: Session, job_id: int, workflow_name: str, agent_name: str | None, input_summary: str = ""):
    run = models.AIRun(
        job_case_id=job_id,
        workflow_name=workflow_name or "Unknown",
        agent_name=agent_name,
        status="running",
        model_name=MODEL_NAME,
        input_summary=input_summary[:1000] if input_summary else "",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run

def finish_ai_run(db: Session, run_id: int | None, status: str, output_summary: str = "", error_message: str = "", run_data: dict | None = None):
    if not run_id:
        return None
    from datetime import datetime, timezone
    run = db.query(models.AIRun).filter(models.AIRun.id == run_id).first()
    if not run:
        return None
    completed_at = datetime.now(timezone.utc)
    run.status = status
    run.output_summary = output_summary[:1000] if output_summary else ""
    run.error_message = error_message[:1000] if error_message else None
    run.run_data = run_data or run.run_data or {}
    run.completed_at = completed_at
    if run.started_at:
        started_at = run.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        run.latency_ms = int((completed_at - started_at).total_seconds() * 1000)
    db.commit()
    db.refresh(run)
    return run

def build_ai_run_summary(workflow_name: str, card_content: str, card_data: dict) -> str:
    if isinstance(card_content, str) and card_content.startswith("Error:"):
        return card_content

    if workflow_name == "ResumeOptimization":
        patches = card_data.get("optimization_patches") or []
        if patches:
            return f"已生成 {len(patches)} 条简历定向优化建议"
        return "已生成简历定向优化建议，请在中间工作区查看"

    if workflow_name == "JobMatching":
        match_data = card_data.get("match_data") or {}
        score = match_data.get("score")
        if score != "?":
            return f"已完成岗位匹配分析，匹配分 {score}"
        return "已完成岗位匹配分析"

    if workflow_name == "JDAnalysis":
        return "已完成岗位 JD 结构化分析"
    if workflow_name == "ContentGeneration":
        return "已生成最终内容版本"
    if workflow_name == "InterviewPrep":
        return "已生成面试准备内容"
    if workflow_name == "InterviewEvaluation":
        return "已完成面试评估与复盘"
    if workflow_name == "GreetingGeneration":
        return "已生成投递沟通话术"

    return card_content or "AI 任务已完成"

class AgentBrain:
    @staticmethod
    async def process(msg: str, context: dict = None) -> dict:
        client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
        
        # Inject context if provided
        if context:
            user_msg = json.dumps({"System_DB_Context": context, "User_Message": msg}, ensure_ascii=False)
        else:
            user_msg = msg
            
        try:
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": ROUTER_PROMPT},
                    {"role": "user", "content": user_msg}
                ],
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content
            text = raw.strip()
            
            import re
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                text = json_match.group(0)
                
            parsed = json.loads(text)
            
            return {
                "intent": parsed.get("intent", "GUIDE"),
                "reply": parsed.get("reply", "Thank you for reaching out! I am interested."),
                "workflow": parsed.get("workflow"),
                "missing_context": parsed.get("missing_context", [])
            }
        except Exception as e:
            return {
                "intent": "GUIDE",
                "reply": f"Thank you for your message! I have reviewed the JD.",
                "workflow": None,
                "missing_context": []
            }

@app.get("/api/jobs/{job_id}/chat")
def get_chat_history(job_id: int, db: Session = Depends(get_db)):
    messages = db.query(models.ChatMessage).filter(models.ChatMessage.job_case_id == job_id).order_by(models.ChatMessage.created_at.asc()).all()
    # The frontend expects a specific structure.
    # User messages: { role: 'user', content: '...' }
    # Agent messages: { role: 'agent', content: '...', cards: [...] }
    # For now, we will return raw messages, and the frontend can parse JSON if role is agent and content is JSON.
    return [
        {
            "id": msg.id,
            "role": msg.role,
            "content": msg.content
        } for msg in messages
    ]

@app.post("/api/jobs/{job_id}/chat")
async def chat_with_agent(job_id: int, req: ChatRequest, db: Session = Depends(get_db)):
    try:
        job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
        
        if not req.is_system_trigger:
            # Save User Message
            user_msg = models.ChatMessage(job_case_id=job_id, role="user", content=req.message)
            db.add(user_msg)
            db.commit()

    except Exception:
        import traceback
        traceback.print_exc()

    # Fetch profile for context
    profile = db.query(models.UserProfile).first()
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    has_base_resume = bool(profile and profile.base_resume)
    
    if req.message in ["start_job_search", "start_boss_search", "去BOSS直聘搜索", "生成打招呼语"]:
        req.system_workflow = "GreetingGeneration"
        req.is_system_trigger = True
    elif req.message in ["匹配度分析", "开始匹配度分析"]:
        req.system_workflow = "JobMatching"
        req.is_system_trigger = True
    elif req.message in ["开始优化简历", "优化简历"]:
        req.system_workflow = "ResumeOptimization"
        req.is_system_trigger = True
    elif req.message in ["开始生成简历", "生成最终版简历文档"]:
        req.system_workflow = "ContentGeneration"
        req.is_system_trigger = True
    elif req.message in ["面试准备", "开始面试准备", "生成面试预测题", "帮我生成预测题"]:
        req.system_workflow = "InterviewPrep"
        req.is_system_trigger = True
    elif req.message in ["开始复盘"]:
        req.system_workflow = "Reflection"
        req.is_system_trigger = True

    if req.system_workflow:
        intent = "EXECUTE"
        workflow = req.system_workflow
        reply = ""
    else:
        # Process with AgentBrain, pass context
        brain_context = {
            "has_base_resume": has_base_resume,
            "has_jd_content": bool(job and job.jd_content),
            "past_workflow_results": job.workflow_data if job else {}
        }
        brain_result = await AgentBrain.process(req.message, context=brain_context)
        intent = brain_result["intent"]
        reply = brain_result["reply"]
        workflow = brain_result["workflow"]
        
    # Heuristic: If user pastes a long text with JD keywords, update jd_content and invalidate caches
    if job and not req.is_system_trigger and len(req.message) > 50 and any(kw in req.message for kw in ["岗位", "职位", "任职", "要求", "职责"]):
        job.jd_content = req.message
        if job.workflow_data:
            w_data = dict(job.workflow_data)
            w_data.pop("jd_analysis_result", None)
            w_data.pop("job_matching_result", None)
            job.workflow_data = w_data
        db.commit()
    
    async def event_generator():
        brain_log = f"Agent Brain: {intent} - Workflow: {workflow}"

        # --- State 1: GUIDE (Interaction & Clarification) ---
        if intent == "GUIDE":
            suggestions = ["分析新岗位", "生成打招呼语"]
            yield f"data: {json.dumps({'type': 'text', 'content': reply, 'data': {'suggestions': suggestions}})}\n\n"
            return

        suggestions = []
        # Phase 8: Validate workflow via agent router
        from ..agents import WorkflowRouter
        agent = WorkflowRouter.route(workflow)
        if not agent:
            fallback_reply = "Unknown workflow: " + workflow
            failed_run = start_ai_run(db, job_id, workflow or "Unknown", None, req.message or "")
            finish_ai_run(db, failed_run.id, "failed", fallback_reply, fallback_reply, {"intent": intent})
            yield "data: " + json.dumps({"type": "text", "content": fallback_reply, "data": {"suggestions": suggestions}}) + "\n\n"
            return

        agent_name = agent.name
        ai_run = start_ai_run(db, job_id, workflow, agent_name, req.message or "")

        if workflow == "ResumeOptimization":
            main_title = "Optimizing resume for JD..."
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Analyzing JD...', 'Parsing resume...', 'Matching STAR...', 'Generating...'], 'logs': [brain_log, 'Skill: Loaded ResumeOptimizer', 'Executing Real LLM Call...']}})}\n\n"
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                result = await SkillExecutor.execute_resume_optimization(job, db)
                db.commit()
                
                if "error" in result:
                    card_content = f"Error: {result['error']}"
                    card_data = {}
                else:
                    opt_res = result.get("result", {}).get("resume_optimization_result", {})
                    summary = opt_res.get("optimization_summary", "Summary unavailable")
                    card_content = f"Optimization: {summary}"
                    # Provide patches instead of markdown
                    patches = opt_res.get("optimization_patches", [])
                    card_data = {
                        "preview": json.dumps(patches, ensure_ascii=False),
                        "optimization_patches": patches,
                        "progress": 100,
                        "sidebar_summary": f"Summary: {summary}"
                    }
                    suggestions = ["开始生成简历", "面试准备", "生成打招呼语"]
            else:
                card_content = "Task completed."
                card_data = {}
                
            card_type = "ResumeOptimizer"
            steps = []
            dev_logs = []
        elif workflow == "InterviewPrep":
            main_title = "Preparing interview..."
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Analyzing requirements', 'Preparing stories', 'Structuring answers', 'Mock interview'], 'logs': [brain_log, 'Skill: Loaded InterviewPrep', 'Executing Real LLM Call...']}})}\n\n"
            await asyncio.sleep(0.5)
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                result = await SkillExecutor.execute_interview_prep(job, db, req.message, round_id=req.round_id)
                if "error" not in result:
                    job.status = "面试中"
                    db.commit()
                    prep_res = result.get("result", {}).get("interview_prep_result", {})
                    card_content = "面试预测题已生成完毕"
                    card_data = {"preview": json.dumps(prep_res, ensure_ascii=False), "file_name": "interview_prep.json", "progress": 100, "sidebar_summary": "Generation summary", "round_id": req.round_id}
                else:
                    card_content = f"Offer stage error: {result['error']}"
                    card_data = {}
            else:
                card_content = "Task completed."
                card_data = {}
                
            card_type = "InterviewPrep"
            steps = []
            dev_logs = []
        elif workflow == "InterviewEvaluation":
            main_title = "Evaluating interview results..."
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Evaluating answers', 'Scoring competencies', 'Reflection'], 'logs': [brain_log, 'Skill: Loaded InterviewEvaluation', 'Executing Real LLM Call...']}})}\n\n"
            await asyncio.sleep(0.5)
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                # 1. Evaluate Interview
                eval_result = await SkillExecutor.execute_interview_eval(job, req.message, db, round_id=req.round_id)
                db.commit()
                
                if "error" in eval_result or eval_result.get("status") == "error":
                    error_msg = eval_result.get("error") or eval_result.get("message") or "Unknown evaluation error"
                    card_content = f"Error: {error_msg}"
                    card_data = {}
                else:
                    # 2. Reflect and Update Memory
                    ref_result = await SkillExecutor.execute_reflection(job, db)
                    db.commit()
                    
                    eval_res = eval_result.get("result", {}).get("interview_evaluation_result", {})
                    card_content = "面试评估及复盘已完成"
                    card_data = {"preview": json.dumps(eval_res, ensure_ascii=False), "file_name": "evaluation.json", "progress": 100, "sidebar_summary": "Generation summary", "round_id": req.round_id}
            else:
                card_content = "Task completed."
                card_data = {}
                
            card_type = "InterviewEvaluation"
            steps = []
            dev_logs = []
        elif workflow == "JobMatching":
            main_title = "Matching job requirements..."
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Analyzing JD', 'Matching resume', 'Calculating score'], 'logs': [brain_log, 'Skill: Loaded JobMatching', 'Executing Real LLM Call...']}})}\n\n"
            await asyncio.sleep(0.5)
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                result = await SkillExecutor.execute_job_matching(job, db)
                
                if "error" in result:
                    card_content = f"Error: {result['error']}"
                    card_data = {}
                else:
                    match_res = result.get("result", {}).get("job_matching_result", {})
                    
                    score_breakdown = match_res.get("score_breakdown", {})
                    score = score_breakdown.get("total", "?")
                    
                    is_rec = isinstance(score, int) and score >= 70
                    summary = "推荐投递" if is_rec else "不推荐投递"
                    
                    must = match_res.get("must_skill_match", [])
                    missing = match_res.get("missing_skills", [])
                    reason = match_res.get("reason", "")
                    
                    must_str = "、".join(must) if must else "无"
                    missing_str = "、".join(missing) if missing else "无"
                    
                    # Persist the match score
                    if isinstance(score, (int, float)):
                        job.match_score = int(score)
                        db.commit()

                    card_content = "匹配度分析完成"
                    
                    card_data = {
                        "progress": 100, 
                        "sidebar_summary": f"Score: {score}% | Matched: {len(must)} | Missing: {len(missing)}",
                        "match_data": {
                            "score": score,
                            "matching_skills": must,
                            "gap_skills": missing,
                            "reason": reason
                        }
                    }
            else:
                card_content = "Task completed."
                card_data = {}
                
            card_type = "MatchAnalysis"
            steps = []
            dev_logs = []
        elif workflow == "JDAnalysis":
            main_title = "Analyzing job description..."
            
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Analyzing communication', 'Extracting requirements', 'Summarizing'], 'logs': [brain_log, 'Skill: Loaded JDAnalysis', 'Executing Real LLM Call...']}})}\n\n"
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                result = await SkillExecutor.execute_jd_analysis(job, db)
                db.commit()
                
                if "error" in result:
                    card_content = f"Error: {result['error']}"
                    card_data = {}
                else:
                    jd_res = result.get("result", {}).get("jd_analysis_result", {})
                    role = jd_res.get("role", "Unknown Role")
                    skills = jd_res.get("skills", [])
                    core_skill = skills[0].get("name", "") if skills else "Unknown"
                    job_summary = jd_res.get("job_summary", "")
                    card_content = f"""【岗位名称】{role}
【岗位摘要】{job_summary}
【核心技能】{core_skill}
【技能清单】
"""
                    for s in skills:
                        card_content += f"- {s.get("name", "")} ({s.get("type", "")})\n"
                    card_type = "ExecutionSummary"
                    card_data = {"details": [{"label": "岗位分析结果", "value": card_content}]}
                    suggestions = ["匹配度分析", "生成打招呼语"]
            else:
                card_content = "Task completed."
                card_data = {}
                
            card_type = "ExecutionSummary"
            steps = []
            dev_logs = []
        elif workflow == "ContentGeneration":
            main_title = "Generating application content..."
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Analyzing context', 'Drafting content', 'Reviewing', 'Finalizing'], 'logs': [brain_log, 'Skill: Loaded ContentGeneration', 'Rendering local template...']}})}\n\n"
            await asyncio.sleep(0.5)
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                accepted_indices = None
                try:
                    msg_data = json.loads(chat_message.message)
                    if isinstance(msg_data, dict) and "accepted_indices" in msg_data:
                        accepted_indices = msg_data["accepted_indices"]
                except Exception:
                    pass
                result = await SkillExecutor.execute_content_generation(job, db, accepted_indices)
                db.commit()
                
                if "error" in result:
                    card_content = f"Error: {result['error']}"
                    card_data = {}
                else:
                    res_json = result.get("result", {}).get("content_generation_result", {}).get("resume_json", {})
                    card_content = "内容生成完成"
                    card_data = {
                        "preview": json.dumps(res_json, ensure_ascii=False),
                        "is_resume_json": True,
                        "progress": 100,
                        "sidebar_summary": "Generation summary"
                    }
                    suggestions = ["导出PDF", "生成打招呼语"]
            else:
                card_content = "Task completed."
                card_data = {}
            card_type = "ContentGeneration"
            steps = []
            dev_logs = []
        elif workflow == "GreetingGeneration":
            main_title = "Generating greeting for Boss..."
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['Analyzing recipient', 'Preparing JD', 'Drafting', 'Finalizing'], 'logs': [brain_log, 'Skill: Loaded GreetingGeneration', 'Generating greeting text...']}})}\n\n"
            await asyncio.sleep(0.5)
            
            from .workflow_engine import SkillExecutor
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                result = await SkillExecutor.execute_greeting_generation(job, db)
                db.commit()
                
                if "error" in result:
                    card_content = f"Error: {result['error']}"
                    card_data = {}
                else:
                    greet_res = result.get("result", {}).get("greeting_generation_result", {})
                    greeting_message = greet_res.get("greeting_message", "")
                    card_content = "Greeting generated for Boss"
                    card_data = {
                        "preview": greeting_message,
                        "progress": 100,
                        "sidebar_summary": "Greeting generated",
                        "details": [
                            {"label": "生成的打招呼语", "value": greeting_message}
                        ]
                    }
                    suggestions = ["优化简历"]
            else:
                card_content = "Task completed."
                card_data = {}
                
            card_type = "GreetingGeneration"
            steps = []
            dev_logs = []
        elif workflow == "UpdateJobCase":
            main_title = "Creating Job Case..."
            steps = ["分析JD", "Create workflow", "Track offer"]
            dev_logs = [brain_log, "Database: Updating status to OFFER"]
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                job.status = "Offer received"
                db.commit()
            card_type = "ExecutionSummary"
            card_content = "Offer received via direct application"
            card_data = {"actions_taken": ["Job Case created"], "sidebar_summary": "Job Case created successfully."}
        else:
            # Fallback if workflow is unknown but execute was triggered
            fallback_reply = f"Processing: {workflow or 'unknown'}"
            suggestions = ["分析新岗位", "生成打招呼语"]
            yield f"data: {json.dumps({'type': 'text', 'content': fallback_reply, 'data': {'suggestions': suggestions}})}\n\n"
            return

        # Yield Main Status
        yield f"data: {json.dumps({'type': 'main_status', 'content': main_title})}\n\n"
        await asyncio.sleep(0.5)

        # Yield Dev Logs
        for log in dev_logs[:2]:
            yield f"data: {json.dumps({'type': 'dev_log', 'content': log})}\n\n"
        
        # Second Layer: Steps
        for i, step in enumerate(steps):
            yield f"data: {json.dumps({'type': 'sub_status', 'content': step, 'status': 'running'})}\n\n"
            await asyncio.sleep(0.8)
            yield f"data: {json.dumps({'type': 'sub_status', 'content': step, 'status': 'done'})}\n\n"
            if i + 2 < len(dev_logs):
                yield f"data: {json.dumps({'type': 'dev_log', 'content': dev_logs[i+2]})}\n\n"

        yield "data: " + json.dumps({"type": "main_status", "content": "Processing..."}) + "\n\n"
            
        # Final Card
        # Phase 8: Attach agent metadata
        is_error_card = isinstance(card_content, str) and card_content.startswith("Error:")
        ai_run_summary = build_ai_run_summary(workflow, card_content, card_data)
        completed_run = finish_ai_run(
            db,
            ai_run.id,
            "failed" if is_error_card else "success",
            ai_run_summary,
            card_content if is_error_card else "",
            {
                "card_type": card_type,
                "suggestion_count": len(suggestions),
                "artifact_count": len(card_data.get("optimization_patches", [])) if isinstance(card_data.get("optimization_patches"), list) else None,
                "sidebar_summary": card_data.get("sidebar_summary"),
            },
        )
        card_data["agent"] = agent_name
        card_data["ai_run_id"] = completed_run.id if completed_run else ai_run.id
        card = {
            "type": "card",
            "card_type": card_type,
            "content": card_content,
            "data": card_data
        }
        # Provide conversation guidance inline within the card
        if not suggestions:

            if workflow == "JDAnalysis":
                suggestions = ["匹配度分析", "提取核心考点"]
            elif workflow == "JobMatching":
                suggestions = ["开始优化简历", "分析不足之处"]
            elif workflow == "ResumeOptimization":
                suggestions = ["开始生成简历", "面试准备", "生成打招呼语"]
            elif workflow == "InterviewPrep":
                suggestions = ["导出面试题"]
            elif workflow == "InterviewEvaluation":
                suggestions = ["开始复盘"]
            
        card["data"]["suggestions"] = suggestions
        yield f"data: {json.dumps(card)}\n\n"
            
        # Save Agent Message to DB
        saved_content = json.dumps({"card": card}, ensure_ascii=False)
        agent_msg = models.ChatMessage(job_case_id=job_id, role="agent", content=saved_content)
        db.add(agent_msg)
        db.commit()

        # Phase 9: Auto-trigger downstream workflow
        from ..agents import TRIGGER_MAP as _TRIGGER_MAP
        _next = _TRIGGER_MAP.get(workflow)
        if _next and job:
            from .workflow_engine import SkillExecutor as _Executor
            _next_job = db.query(models.JobCase).filter(models.JobCase.id == job.id).first()
            if _next_job:
                _exec_fn = getattr(_Executor, _next["exec_method"], None)
                if _exec_fn:
                    asyncio.create_task(_exec_fn(_next_job, db))

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    uvicorn.run("runtime.api.api_server:app", host="0.0.0.0", port=8000, reload=True)

