from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn
import asyncio
import base64
import json
import os
import re
import secrets
import sqlite3
from openai import AsyncOpenAI
from dotenv import load_dotenv

from . import models
from .database import engine, get_db
from .leads_router import router as leads_router
from ..services.resume_parser_service import (
    ResumeParseError,
    normalize_resume_schema,
    parse_resume_to_json,
    quality_check_resume,
)
from ..services.sqlite_import_service import (
    MAX_SQLITE_UPLOAD_BYTES,
    SQLiteImportError,
    import_sqlite_bytes,
)
from ..services.agent_orchestrator import (
    build_match_conversation_summary,
    execution_intro,
    jd_conversation_reply,
    missing_context_reply,
    opening_suggestions,
    parse_application_update,
    welcome_message,
)

from pydantic import BaseModel

class JobCreate(BaseModel):
    jd_content: str

class ProfileUpdate(BaseModel):
    base_resume: str

class MemoryReviewRequest(BaseModel):
    action: str
    content: str | None = None

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(leads_router, prefix="/api/leads", tags=["leads"])

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _has_valid_basic_auth(request: Request) -> bool:
    expected_password = os.getenv("APP_PASSWORD", "")
    if not expected_password:
        # Local development remains password-free. Render deployments fail
        # closed if the shared secret was not provisioned.
        return not os.getenv("RENDER")

    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:]).decode("utf-8")
        username, password = decoded.split(":", 1)
    except (ValueError, UnicodeDecodeError):
        return False

    expected_username = os.getenv("APP_USERNAME", "offerflow")
    return secrets.compare_digest(username, expected_username) and secrets.compare_digest(
        password, expected_password
    )


@app.middleware("http")
async def require_personal_access(request: Request, call_next):
    # The public demo is deliberately isolated from the personal workspace.
    # It only exposes rows marked as demo data (see the routes near the end of
    # this module), so it can be shared without sharing the owner's account.
    if request.url.path == "/health" or request.url.path.startswith("/api/demo") or request.method == "OPTIONS":
        return await call_next(request)
    if not _has_valid_basic_auth(request):
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": 'Basic realm="OfferFlow"'},
        )
    return await call_next(request)


@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/jobs")
def get_jobs(db: Session = Depends(get_db)):
    jobs = [
        job for job in db.query(models.JobCase).order_by(models.JobCase.updated_at.desc()).all()
        if not (job.workflow_data or {}).get("demo")
    ]
    # Older promoted leads kept the original URL on JobLead, so expose it
    # through workflow_data without requiring a destructive database migration.
    lead_links = {
        lead.promoted_job_case_id: lead.source_url
        for lead in db.query(models.JobLead).filter(models.JobLead.promoted_job_case_id.isnot(None)).all()
        if lead.source_url
    }
    for job in jobs:
        if lead_links.get(job.id) and not (job.workflow_data or {}).get("source_url"):
            job.workflow_data = {**(job.workflow_data or {}), "source_url": lead_links[job.id]}
    return jobs

@app.get("/api/export")
def export_data(db: Session = Depends(get_db)):
    jobs = [job for job in db.query(models.JobCase).all() if not (job.workflow_data or {}).get("demo")]
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


@app.post("/api/admin/import_sqlite")
async def import_sqlite_database(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    filename = (file.filename or "").lower()
    if not filename.endswith((".db", ".sqlite", ".sqlite3")):
        raise HTTPException(status_code=400, detail="请选择 .db、.sqlite 或 .sqlite3 文件")

    payload = await file.read(MAX_SQLITE_UPLOAD_BYTES + 1)
    await file.close()
    if len(payload) > MAX_SQLITE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="数据库文件不能超过 15 MB")

    try:
        counts = import_sqlite_bytes(db, payload)
    except SQLiteImportError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=400, detail="SQLite 数据库损坏或无法读取") from exc

    return {
        "status": "success",
        "message": "数据库导入成功，所有表均已校验",
        "counts": counts,
        "total": sum(counts.values()),
    }

@app.get("/api/user/profile")
def get_profile(db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).first()
    if not profile:
        return {"base_resume": ""}
    if not profile.base_resume:
        return {"base_resume": ""}
    try:
        normalized = normalize_resume_schema(profile.base_resume)
        return {"base_resume": json.dumps(normalized, ensure_ascii=False)}
    except Exception:
        return {"base_resume": profile.base_resume}

@app.get("/api/debug/deepseek_ping")
async def debug_deepseek_ping():
    """Check whether the running backend process can reach the model API."""
    key = os.getenv("DEEPSEEK_API_KEY") or ""
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model = os.getenv("MODEL_NAME", "deepseek-chat")
    proxy_env = {
        "HTTP_PROXY": bool(os.getenv("HTTP_PROXY")),
        "HTTPS_PROXY": bool(os.getenv("HTTPS_PROXY")),
        "http_proxy": bool(os.getenv("http_proxy")),
        "https_proxy": bool(os.getenv("https_proxy")),
    }
    if not key:
        return {
            "ok": False,
            "error_type": "MissingApiKey",
            "error": "DEEPSEEK_API_KEY is not set in the running backend process.",
            "base_url": base_url,
            "model": model,
            "proxy_env": proxy_env,
        }

    try:
        client = AsyncOpenAI(api_key=key, base_url=base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "只回复 JSON: {\"ok\": true}"}],
            temperature=0,
            response_format={"type": "json_object"},
            timeout=20,
        )
        return {
            "ok": True,
            "base_url": base_url,
            "model": model,
            "proxy_env": proxy_env,
            "response": response.choices[0].message.content,
        }
    except Exception as e:
        return {
            "ok": False,
            "error_type": type(e).__name__,
            "error": str(e),
            "base_url": base_url,
            "model": model,
            "proxy_env": proxy_env,
        }

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
            
        json_content = await parse_resume_to_json(
            content,
            api_key=API_KEY,
            base_url=BASE_URL,
            model_name=MODEL_NAME,
        )
            
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
    except ResumeParseError as e:
        raise HTTPException(
            status_code=502 if e.error_code == "MODEL_CALL_FAILED" else 422,
            detail={"error_code": e.error_code, "message": str(e)},
        ) from e
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail={"error_code": "FILE_PROCESSING_ERROR", "message": str(e)}) from e

@app.post("/api/user/profile")
async def update_profile(prof: ProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).first()
    
    # Check if the incoming string is valid JSON
    content_to_save = prof.base_resume
    try:
        parsed = json.loads(content_to_save)
        content_to_save = json.dumps(quality_check_resume(parsed, content_to_save), ensure_ascii=False)
    except json.JSONDecodeError:
        content_to_save = await parse_resume_to_json(
            content_to_save,
            api_key=API_KEY,
            base_url=BASE_URL,
            model_name=MODEL_NAME,
        )
    except ResumeParseError as e:
        raise HTTPException(status_code=422, detail={"error_code": e.error_code, "message": str(e)}) from e
        
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
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job or (job.workflow_data or {}).get("demo"):
        raise HTTPException(status_code=404, detail="Job not found")
    if not (job.workflow_data or {}).get("source_url"):
        lead = db.query(models.JobLead).filter(models.JobLead.promoted_job_case_id == job_id).first()
        if lead and lead.source_url:
            job.workflow_data = {**(job.workflow_data or {}), "source_url": lead.source_url}
    return job

@app.get("/api/jobs/{job_id}/opening")
def get_job_opening(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    workflow_data = job.workflow_data or {}
    analysis = workflow_data.get("jd_analysis_result") or {}
    apply_status = workflow_data.get("apply_status") or {}
    suggestions = opening_suggestions(bool(apply_status.get("applied")))
    return {
        "message": welcome_message(job.company, job.role, bool(job.jd_content), analysis),
        "suggestions": suggestions,
    }

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

def _normalize_feedback_event_data(req: FeedbackCreate) -> dict:
    event_data = dict(req.event_data or {})
    if event_data.get("feedback_code") and event_data.get("feedback_category"):
        return event_data

    mapping = {
        "有帮助": ("helpful", "user_accepted", "quality"),
        "可以使用": ("ready_to_use", "user_accepted", "quality"),
        "不准确": ("accuracy_error", "accuracy", "badcase_candidate"),
        "太空泛": ("too_generic", "specificity", "badcase_candidate"),
        "有编造风险": ("fabrication_risk", "faithfulness", "badcase_candidate"),
        "有不真实表述": ("fabrication_risk", "faithfulness", "badcase_candidate"),
        "不相关": ("irrelevant", "relevance", "badcase_candidate"),
        "太简单": ("too_simple", "difficulty", "badcase_candidate"),
        "需要追问": ("needs_followup", "coverage", "quality"),
        "太正式": ("too_formal", "tone", "badcase_candidate"),
        "太随意": ("too_casual", "tone", "badcase_candidate"),
    }
    code, category, normalized_type = mapping.get(
        req.feedback,
        ("unknown_feedback", "other", req.feedback_type or "quality"),
    )
    event_data.setdefault("feedback_code", code)
    event_data.setdefault("feedback_category", category)
    event_data.setdefault("feedback_label", req.feedback)
    event_data.setdefault("normalized_feedback_type", normalized_type)
    return event_data

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

    normalized_event_data = _normalize_feedback_event_data(req)

    if event:
        event.message_id = req.message_id
        event.card_type = req.card_type
        event.feedback = req.feedback
        event.feedback_type = req.feedback_type
        event.note = req.note
        event.event_data = normalized_event_data
    else:
        event = models.FeedbackEvent(
            job_case_id=job_id,
            message_id=req.message_id,
            card_type=req.card_type,
            feedback=req.feedback,
            feedback_type=req.feedback_type,
            note=req.note,
            event_data=normalized_event_data,
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


@app.get("/api/badcases")
def get_badcases(db: Session = Depends(get_db)):
    from ..services.badcase_service import BadcaseService
    return BadcaseService.list_badcases(db)

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


@app.get("/api/memory/items")
def get_memory_items(db: Session = Depends(get_db)):
    from ..services.memory_service import MemoryService
    return MemoryService.list_items(db)


@app.patch("/api/memory/items/{item_id}")
def review_memory_item(item_id: int, request: MemoryReviewRequest, db: Session = Depends(get_db)):
    from ..services.memory_service import MemoryService
    try:
        item = MemoryService.review_item(db, item_id, request.action, request.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Memory item not found")
    db.commit()
    db.refresh(item)
    return item


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
    # A disconnected browser or interrupted model request can leave a run in
    # `running` forever. Retrying the same workflow must reclaim that stale run.
    from datetime import datetime, timezone
    stale_runs = db.query(models.AIRun).filter(
        models.AIRun.job_case_id == job_id,
        models.AIRun.workflow_name == (workflow_name or "Unknown"),
        models.AIRun.status == "running",
    ).all()
    reclaimed_at = datetime.now(timezone.utc)
    for stale_run in stale_runs:
        stale_run.status = "failed"
        stale_run.error_message = "任务被新的重试替代，上一请求未正常结束"
        stale_run.completed_at = reclaimed_at
        if stale_run.started_at:
            started_at = stale_run.started_at
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            stale_run.latency_ms = max(0, int((reclaimed_at - started_at).total_seconds() * 1000))

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


async def run_reflection_background(job_id: int):
    """Update reflection memory without delaying the transcript analysis response."""
    from .database import SessionLocal
    from .workflow_engine import SkillExecutor

    bg_db = SessionLocal()
    reflection_run = None
    try:
        job = bg_db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
        if not job:
            return
        reflection_run = start_ai_run(bg_db, job_id, "Reflection", "Reflection Agent", "面试分析完成后后台复盘")
        result = await SkillExecutor.execute_reflection(job, bg_db)
        if "error" in result or result.get("status") == "error":
            detail = result.get("error_message") or result.get("error_code") or "复盘失败"
            finish_ai_run(bg_db, reflection_run.id, "failed", error_message=str(detail))
        else:
            bg_db.commit()
            finish_ai_run(bg_db, reflection_run.id, "success", "已更新面试复盘记忆")
    except Exception as exc:
        bg_db.rollback()
        if reflection_run:
            finish_ai_run(bg_db, reflection_run.id, "failed", error_message=str(exc))
    finally:
        bg_db.close()

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
        from ..agents import get_agent_catalog, normalize_supervisor_decision

        client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
        supervisor_prompt = (
            ROUTER_PROMPT
            + "\n\n# Runtime specialist Agent catalog\n"
            + json.dumps(get_agent_catalog(), ensure_ascii=False)
        )
        
        # Inject context if provided
        if context:
            user_msg = json.dumps({"System_DB_Context": context, "User_Message": msg}, ensure_ascii=False)
        else:
            user_msg = msg
            
        try:
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": supervisor_prompt},
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
                
            return normalize_supervisor_decision(json.loads(text), msg)
        except Exception as e:
            return {
                "intent": "ERROR",
                "reply": "我暂时无法连接推理服务，因此还不能可靠地理解这句话。请稍后重试；我不会假装已经理解，也不会擅自执行错误的操作。",
                "workflow": None,
                "missing_context": [],
                "error_type": type(e).__name__,
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

    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    # Public Demo jobs carry a fake candidate profile in their own scoped
    # workflow data. Never use the owner's profile while serving a demo.
    is_demo = bool(job and (job.workflow_data or {}).get("demo"))
    profile = None if is_demo else db.query(models.UserProfile).first()
    has_base_resume = bool((job.workflow_data or {}).get("demo_resume")) if is_demo else bool(profile and profile.base_resume)
    
    if req.message in ["start_job_search", "start_boss_search"]:
        req.system_workflow = "GreetingGeneration"
        req.is_system_trigger = True

    if req.system_workflow:
        intent = "EXECUTE"
        workflow = req.system_workflow
        workflow_data = job.workflow_data if job and job.workflow_data else {}
        reply = execution_intro(
            workflow,
            {
                "has_jd_analysis": bool(workflow_data.get("jd_analysis_result")),
                "has_job_matching": bool(workflow_data.get("job_matching_result")),
                "has_base_resume": has_base_resume,
            },
        )
    else:
        # Process with AgentBrain, pass context
        recent_messages = db.query(models.ChatMessage).filter(
            models.ChatMessage.job_case_id == job_id
        ).order_by(models.ChatMessage.created_at.desc()).limit(8).all()
        brain_context = {
            "has_base_resume": has_base_resume,
            "has_jd_content": bool(job and job.jd_content),
            "past_workflow_results": job.workflow_data if job else {},
            "recent_conversation": [
                {"role": item.role, "content": item.content[:1200]}
                for item in reversed(recent_messages)
                if not (item.role == "agent" and item.content.startswith('{"card"'))
            ],
        }
        brain_result = await AgentBrain.process(req.message, context=brain_context)
        intent = brain_result["intent"]
        reply = brain_result["reply"]
        workflow = brain_result["workflow"]
        if intent == "EXECUTE" and workflow:
            reply = reply or execution_intro(
                workflow,
                {
                    "has_jd_analysis": bool((job.workflow_data or {}).get("jd_analysis_result")) if job else False,
                    "has_job_matching": bool((job.workflow_data or {}).get("job_matching_result")) if job else False,
                    "has_base_resume": has_base_resume,
                },
            )

    if intent == "ERROR":
        intent = "GUIDE"
        workflow = None
    elif intent == "EXECUTE" and not workflow:
        intent = "GUIDE"
        reply = reply or "我还不能确定你想完成哪件事。你希望我分析岗位、优化简历、准备面试，还是生成投递话术？"

    if intent == "EXECUTE" and workflow:
        missing_reply = missing_context_reply(
            workflow,
            {
                "has_base_resume": has_base_resume,
                "has_jd_content": bool(job and job.jd_content),
            },
        )
        if missing_reply:
            intent = "GUIDE"
            workflow = None
            reply = missing_reply

    # Preserve long transcripts before starting the streaming/model request so
    # an interrupted browser connection never destroys the user's input.
    if job and workflow == "InterviewEvaluation":
        workflow_data = dict(job.workflow_data) if job.workflow_data else {}
        if req.message and req.message != "system_trigger":
            workflow_data["pending_interview_transcript"] = req.message
            job.workflow_data = workflow_data
            db.commit()
        elif workflow_data.get("pending_interview_transcript"):
            req.message = workflow_data["pending_interview_transcript"]
        
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
        display_as_conversation = False
        suppress_execution_trace = False

        # --- State 1: GUIDE (Interaction & Clarification) ---
        if intent == "GUIDE":
            suggestions = ["直接优化简历", "分析岗位要求", "生成投递话术", "准备面试"]
            yield f"data: {json.dumps({'type': 'text', 'content': reply, 'data': {'suggestions': suggestions}})}\n\n"
            if reply:
                db.add(models.ChatMessage(job_case_id=job_id, role="agent", content=reply))
                db.commit()
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
        conversational_intro = reply or execution_intro(workflow, {})
        if conversational_intro:
            yield f"data: {json.dumps({'type': 'text', 'content': conversational_intro, 'data': {'phase': 'plan', 'workflow': workflow, 'agent': agent_name}})}\n\n"
            db.add(models.ChatMessage(job_case_id=job_id, role="agent", content=conversational_intro))
            db.commit()
        ai_run = start_ai_run(db, job_id, workflow, agent_name, req.message or "")

        if workflow == "ResumeOptimization":
            main_title = "正在整理简历修改建议，请稍等…"
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['读取岗位重点', '梳理简历经历', '筛选可强化的证据', '生成修改建议'], 'logs': [brain_log, 'Skill: Loaded ResumeOptimizer', 'Executing Real LLM Call...']}})}\n\n"
            
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
                    card_content = f"我已经整理出 {len(opt_res.get('optimization_patches', []))} 条可逐项确认的简历修改建议。"
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
                if result.get("status") != "error" and "error" not in result:
                    job.status = "面试中"
                    db.commit()
                    prep_res = result.get("result", {}).get("interview_prep_result", {})
                    card_content = "面试预测题已生成完毕"
                    card_data = {"preview": json.dumps(prep_res, ensure_ascii=False), "file_name": "interview_prep.json", "progress": 100, "sidebar_summary": "Generation summary", "round_id": req.round_id}
                else:
                    error_detail = result.get("error_message") or result.get("error_code") or "未知错误"
                    card_content = f"Error: 面试题生成失败：{error_detail}"
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
                eval_task = asyncio.create_task(
                    SkillExecutor.execute_interview_eval(job, req.message, db, round_id=req.round_id)
                )
                elapsed_seconds = 0
                eval_result = None
                while elapsed_seconds < 300:
                    try:
                        eval_result = await asyncio.wait_for(asyncio.shield(eval_task), timeout=10)
                        break
                    except asyncio.TimeoutError:
                        elapsed_seconds += 10
                        yield f"data: {json.dumps({'type': 'progress', 'content': f'正在分析逐字稿（已用时 {elapsed_seconds} 秒）', 'data': {'steps': ['提取问答结构', '评估回答质量', '生成改进建议']}})}\n\n"

                if eval_result is None:
                    eval_task.cancel()
                    eval_result = {
                        "status": "error",
                        "error_code": "INTERVIEW_EVALUATION_TIMEOUT",
                        "error_message": "逐字稿分析超过 5 分钟，请缩短文本后重试",
                    }
                db.commit()
                
                if "error" in eval_result or eval_result.get("status") == "error":
                    error_msg = eval_result.get("error_message") or eval_result.get("error_code") or "Unknown evaluation error"
                    card_content = f"Error: {error_msg}"
                    card_data = {}
                else:
                    # Return the evaluation immediately; memory reflection runs independently.
                    workflow_data = dict(job.workflow_data) if job.workflow_data else {}
                    workflow_data.pop("pending_interview_transcript", None)
                    job.workflow_data = workflow_data
                    db.commit()
                    asyncio.create_task(run_reflection_background(job.id))
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
            main_title = "正在分析岗位匹配度，请稍等…"
            yield f"data: {json.dumps({'type': 'progress', 'content': main_title, 'data': {'steps': ['读取岗位核心要求', '对照你的简历经历', '评估优势与能力差距', '整理匹配结论'], 'logs': [brain_log, 'Skill: Loaded JobMatching', 'Executing Real LLM Call...']}})}\n\n"
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
                    
                    must = match_res.get("must_skill_match", [])
                    missing = match_res.get("missing_skills", [])
                    reason = match_res.get("reason", "")
                    
                    # Persist the match score
                    if isinstance(score, (int, float)):
                        job.match_score = int(score)
                        db.commit()

                    card_content = build_match_conversation_summary(match_res)
                    
                    card_data = {
                        "progress": 100, 
                        "sidebar_summary": f"匹配度 {score}% · 优势 {len(must)} 项 · 待补强 {len(missing)} 项",
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
                    card_content = jd_conversation_reply(job.company, job.role, jd_res)
                    card_data = {"sidebar_summary": "已在对话中完成岗位简析"}
                    suggestions = ["判断是否值得投", "直接优化简历", "准备面试", "生成投递话术"]
                    display_as_conversation = True
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
            # A small record update should read like a normal conversation,
            # not a visible workflow or a generated result artifact.
            main_title = ""
            steps = []
            dev_logs = []
            display_as_conversation = True
            suppress_execution_trace = True
            job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
            if job:
                from datetime import datetime
                from zoneinfo import ZoneInfo

                update = parse_application_update(
                    req.message,
                    datetime.now(ZoneInfo(os.getenv("APP_TIMEZONE", "Asia/Shanghai"))),
                )
                workflow_data = dict(job.workflow_data) if job.workflow_data else {}
                existing = workflow_data.get("apply_status") or {}
                apply_status = {
                    "applied": update["applied"] or bool(existing.get("applied")),
                    "link": update["link"] or existing.get("link", ""),
                    "apply_time": update["apply_time"] or existing.get("apply_time", ""),
                    "reminder_time": update["reminder_time"] or existing.get("reminder_time", ""),
                }
                workflow_data["apply_status"] = apply_status
                job.workflow_data = workflow_data
                if apply_status["applied"]:
                    job.status = "已投递"
                db.add(models.TimelineEvent(
                    job_case_id=job.id,
                    event_type="ApplicationStatusUpdated",
                    event_data=apply_status,
                ))
                db.commit()
                summary_parts = ["已经帮你更新了这条求职记录"]
                if apply_status["apply_time"]:
                    summary_parts.append(f"投递日期是 {apply_status['apply_time']}")
                if apply_status["reminder_time"]:
                    summary_parts.append(f"跟进提醒设在 {apply_status['reminder_time']}")
                card_content = "，".join(summary_parts) + "。"
                if apply_status["link"]:
                    card_content += "投递链接也已经保存，之后可以直接从这里打开。"
                    suggestions = ["查看投递进度", "调整提醒时间", "准备面试"]
                else:
                    card_content += "为了方便后续一键跳转，需要我同时记录投递链接吗？你可以直接把链接发给我。"
                    suggestions = ["补充投递链接", "调整提醒时间", "准备面试"]
                card_data = {
                    "apply_status": apply_status,
                    "sidebar_summary": card_content,
                    "suggestions": suggestions,
                }
            else:
                card_content = "Error: Job Case 不存在"
                card_data = {}
            card_type = "ApplicationStatus"
        else:
            # Fallback if workflow is unknown but execute was triggered
            fallback_reply = f"Processing: {workflow or 'unknown'}"
            suggestions = ["分析新岗位", "生成打招呼语"]
            yield f"data: {json.dumps({'type': 'text', 'content': fallback_reply, 'data': {'suggestions': suggestions}})}\n\n"
            return

        if not suppress_execution_trace:
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
        if display_as_conversation and not is_error_card:
            message_data = {
                "phase": "result",
                "workflow": workflow,
                "agent": agent_name,
                "suggestions": suggestions,
                "ai_run_id": card_data["ai_run_id"],
            }
            yield f"data: {json.dumps({'type': 'text', 'content': card_content, 'data': message_data})}\n\n"
            db.add(models.ChatMessage(job_case_id=job_id, role="agent", content=card_content))
            db.commit()
            return
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


# ---------------------------------------------------------------------------
# Public product demo
# ---------------------------------------------------------------------------
# Demo data lives in the same database for now, but every public route below
# only ever reads records explicitly marked with ``workflow_data.demo``.  This
# keeps a shared link useful without exposing the owner's jobs, resume or chat.
DEMO_MARKER = "offerflow-public-demo-v1"
DEMO_RESUME = {
    "personal_info": {"name": "林知夏", "contact": "138-****-2746 | lin.zhixia@example.com", "job_intention": "AI 产品经理 / 产品策略", "availability": "2027 年 7 月", "preferred_locations": ["北京", "上海", "深圳"], "summary": "信息管理硕士，具备教育科技与 AI 应用产品实习经历，关注用户需求、数据验证与可落地的产品方案。"},
    "personal_strengths": ["产品思维：能从用户场景拆解需求，完成调研、原型和上线复盘。", "数据能力：熟悉 SQL 与指标分析，用数据定位问题并验证迭代效果。", "AI 应用：参与 LLM 内容生成和知识库问答产品，了解 Prompt、RAG 与效果评估。"],
    "education": [{"school": "华中科技大学", "degree": "硕士", "major": "信息管理与信息系统", "date": "2024.09 - 2027.06"}, {"school": "南京邮电大学", "degree": "本科", "major": "电子商务", "date": "2020.09 - 2024.06"}],
    "work_experience": [
        {"company": "启明教育科技有限公司", "role": "产品实习生", "date": "2026.03 - 2026.08", "descriptions": ["课堂分析产品：参与教师端课堂报告模块迭代，梳理备课、授课、复盘场景，输出 PRD、原型与验收清单。", "效果优化：结合用户访谈和埋点数据定位报告阅读完成率偏低问题，协同算法团队调整摘要结构，核心页面停留时长提升 18%。", "数据分析：使用 SQL 统计功能渗透与异常反馈，搭建周度看板支持产品复盘。"]},
        {"company": "智见信息技术有限公司", "role": "产品运营实习生", "date": "2025.07 - 2025.12", "descriptions": ["内容增长：参与知识内容社区的新用户引导和创作者激励策略，完成竞品分析与用户分层。", "实验迭代：协助设计 A/B 测试，跟踪转化漏斗并输出复盘建议，提升新用户次日留存。"]}
    ],
    "project_experience": [{"project": "AI 教学知识库助手", "role": "产品负责人", "date": "2025.10 - 2026.01", "descriptions": ["负责从用户访谈、需求优先级到交互原型的完整设计，组织 5 人团队完成校内试点。", "设计 RAG 问答链路与评价维度，结合人工标注案例优化 Prompt，试用用户满意度达到 4.5/5。"]}],
    "campus_experience": [{"organization": "校研究生会职业发展部", "role": "项目负责人", "date": "2024.09 - 2025.06", "descriptions": ["策划 3 场产品求职分享活动，负责嘉宾沟通、内容策划和活动复盘。"]}],
    "skills": ["产品需求分析", "用户研究", "SQL", "数据分析", "Axure/Figma", "Prompt Engineering", "LLM 应用"],
    "awards_certificates": ["全国大学生电子商务“创新、创意及创业”挑战赛省级一等奖", "大学英语六级（CET-6）"],
}

DEMO_JOB_SEEDS = [
    {
        "company": "讯飞智文", "role": "AI 产品经理（校招）", "status": "简历优化中", "match_score": 86,
        "jd_content": "负责大模型教育产品的需求分析、产品设计和迭代；需要产品思维、数据分析能力，理解 LLM、RAG、Prompt 等 AI 应用能力。",
    },
    {
        "company": "云帆科技", "role": "内容产品运营实习生", "status": "已投递", "match_score": 79,
        "jd_content": "参与内容社区增长与创作者运营，基于用户反馈和数据分析推动产品体验优化；需要良好的沟通、内容理解和数据敏感度。",
    },
    {
        "company": "星河数据", "role": "数据产品实习生", "status": "面试中", "match_score": 83,
        "jd_content": "负责指标体系、数据工具与业务分析产品建设，和算法、研发团队协作落地；熟悉 SQL，能够拆解业务问题。",
    },
    {
        "company": "远山智能", "role": "AI 应用产品经理", "status": "待分析", "match_score": None,
        "jd_content": "负责企业级 AI Agent 产品规划、用户场景调研与产品落地，理解工作流编排、知识库和模型评估。",
    },
    {
        "company": "青橙出行", "role": "增长产品实习生", "status": "简历优化中", "match_score": 74,
        "jd_content": "围绕拉新、留存和转化设计增长策略，搭建实验和指标分析体系，要求数据敏感度与用户洞察能力。",
    },
    {
        "company": "北辰互动", "role": "社区产品经理", "status": "已投递", "match_score": 81,
        "jd_content": "负责兴趣社区的内容分发、创作者工具和互动体验，能够使用数据验证产品策略并推动跨团队协作。",
    },
    {
        "company": "知行教育", "role": "产品策略实习生", "status": "面试中", "match_score": 88,
        "jd_content": "参与教育产品的战略研究、用户访谈、竞品分析与功能设计，要求结构化思考和良好的表达能力。",
    },
    {
        "company": "光年云", "role": "B 端产品实习生", "status": "待投递", "match_score": 77,
        "jd_content": "协助企业服务产品进行需求梳理、原型设计和上线复盘，理解 SaaS 场景与业务流程更佳。",
    },
]


def _is_demo_job(job: models.JobCase | None) -> bool:
    return bool(job and (job.workflow_data or {}).get("demo") is True)


def _get_demo_job_or_404(job_id: int, db: Session) -> models.JobCase:
    job = db.query(models.JobCase).filter(models.JobCase.id == job_id).first()
    if not _is_demo_job(job):
        raise HTTPException(status_code=404, detail="Demo job not found")
    return job


def _ensure_demo_jobs(db: Session) -> list[models.JobCase]:
    jobs = [job for job in db.query(models.JobCase).all() if _is_demo_job(job)]
    for job in jobs:
        workflow_data = dict(job.workflow_data or {})
        if workflow_data.get("demo_resume_version") != 2:
            workflow_data["demo_resume"] = DEMO_RESUME
            workflow_data["demo_resume_version"] = 2
            job.workflow_data = workflow_data
    existing_pairs = {(job.company, job.role) for job in jobs}
    created = any((job.workflow_data or {}).get("demo_resume_version") == 2 for job in jobs)
    for index, seed in enumerate(DEMO_JOB_SEEDS):
        if (seed["company"], seed["role"]) in existing_pairs:
            continue
        workflow_data = {
            "demo": True,
            "demo_marker": DEMO_MARKER,
            "demo_resume": DEMO_RESUME,
            "demo_resume_version": 2,
            "source_url": "https://example.com/offerflow-demo",
            "apply_status": {"applied": index == 1, "link": "", "apply_time": "", "reminder_time": ""},
        }
        job = models.JobCase(**seed, workflow_data=workflow_data, memory_tags=["公开 Demo", "AI 产品"])
        db.add(job)
        created = True
    if created:
        db.commit()
    return [job for job in db.query(models.JobCase).all() if _is_demo_job(job)]


@app.get("/api/demo/jobs")
def get_demo_jobs(db: Session = Depends(get_db)):
    return sorted(_ensure_demo_jobs(db), key=lambda item: item.updated_at or item.created_at, reverse=True)


@app.post("/api/demo/jobs")
def create_demo_job(payload: JobCreate, db: Session = Depends(get_db)):
    jd_content = payload.jd_content.strip()
    if not jd_content:
        raise HTTPException(status_code=400, detail="请先填写岗位描述")
    job = models.JobCase(
        company="我的目标公司",
        role="自定义岗位",
        status="待分析",
        jd_content=jd_content,
        workflow_data={"demo": True, "demo_marker": DEMO_MARKER, "demo_resume": DEMO_RESUME, "demo_resume_version": 2},
        memory_tags=["公开 Demo", "自定义岗位"],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@app.post("/api/demo/reset")
def reset_demo(db: Session = Depends(get_db)):
    jobs = [job for job in db.query(models.JobCase).all() if _is_demo_job(job)]
    ids = [job.id for job in jobs]
    if ids:
        for model in (models.ChatMessage, models.ResumeVersion, models.Interview, models.Reflection, models.TimelineEvent, models.FeedbackEvent, models.AIRun):
            db.query(model).filter(model.job_case_id.in_(ids)).delete(synchronize_session=False)
        db.query(models.JobLead).filter(models.JobLead.promoted_job_case_id.in_(ids)).delete(synchronize_session=False)
        db.query(models.JobCase).filter(models.JobCase.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        # Drop stale ORM identities before recreating the fixed demo seed.
        db.expunge_all()
    return {"status": "success", "jobs": _ensure_demo_jobs(db)}


@app.get("/api/demo/jobs/{job_id}")
def get_demo_job(job_id: int, db: Session = Depends(get_db)):
    return _get_demo_job_or_404(job_id, db)


@app.get("/api/demo/jobs/{job_id}/opening")
def get_demo_opening(job_id: int, db: Session = Depends(get_db)):
    job = _get_demo_job_or_404(job_id, db)
    data = job.workflow_data or {}
    return {"message": welcome_message(job.company, job.role, bool(job.jd_content), data.get("jd_analysis_result") or {}), "suggestions": opening_suggestions(bool((data.get("apply_status") or {}).get("applied")))}


@app.get("/api/demo/jobs/{job_id}/chat")
def get_demo_chat(job_id: int, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return get_chat_history(job_id, db)


@app.post("/api/demo/jobs/{job_id}/chat")
async def demo_chat(job_id: int, req: ChatRequest, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return await chat_with_agent(job_id, req, db)


@app.get("/api/demo/jobs/{job_id}/feedback")
def get_demo_feedback(job_id: int, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return get_job_feedback(job_id, db)


@app.post("/api/demo/jobs/{job_id}/feedback")
def create_demo_feedback(job_id: int, req: FeedbackCreate, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return create_job_feedback(job_id, req, db)


@app.get("/api/demo/jobs/{job_id}/ai_runs")
def get_demo_runs(job_id: int, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return get_job_ai_runs(job_id, db)


@app.put("/api/demo/jobs/{job_id}/apply")
def update_demo_apply(job_id: int, data: ApplyUpdate, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return update_apply(job_id, data, db)


@app.put("/api/demo/jobs/{job_id}/offer")
def update_demo_offer(job_id: int, data: OfferUpdate, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return update_offer(job_id, data, db)


@app.put("/api/demo/jobs/{job_id}/status")
def update_demo_status(job_id: int, req: StatusUpdate, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return update_job_status(job_id, req, db)


@app.delete("/api/demo/jobs/{job_id}")
def delete_demo_job(job_id: int, db: Session = Depends(get_db)):
    _get_demo_job_or_404(job_id, db)
    return delete_job(job_id, db)

if __name__ == "__main__":
    uvicorn.run(
        "runtime.api.api_server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=not bool(os.getenv("RENDER")),
    )

