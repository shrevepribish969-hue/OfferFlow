from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import asyncio

from . import models
from .database import get_db
from .workflow_engine import SkillExecutor

router = APIRouter()

class LeadClipRequest(BaseModel):
    source_url: Optional[str] = None
    jd_content: str

class PromoteRequest(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None

@router.post("/clip")
async def clip_lead(req: LeadClipRequest, db: Session = Depends(get_db)):
    """
    Endpoint for the Web Clipper to send raw JD text (which might contain multiple jobs).
    It kicks off an asynchronous background task to analyze the text and extract all jobs.
    """
    if not req.jd_content or len(req.jd_content) < 10:
        raise HTTPException(status_code=400, detail="JD content too short")
        
    pending_lead = models.JobLead(
        source_url=req.source_url or "",
        jd_content=req.jd_content,
        status="unscreened",
        analysis_reason="AI 正在识别岗位信息…",
    )
    db.add(pending_lead)
    db.commit()
    db.refresh(pending_lead)

    # Trigger background analysis and update the visible placeholder when done.
    asyncio.create_task(
        SkillExecutor.execute_lead_screening_background(
            req.source_url or "", req.jd_content, pending_lead.id
        )
    )
    
    return {
        "status": "success",
        "lead_id": pending_lead.id,
        "message": "Raw text captured. Background AI screening started for all jobs found.",
    }

@router.post("/{lead_id}/retry")
async def retry_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(models.JobLead).filter(models.JobLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if not lead.jd_content:
        raise HTTPException(status_code=400, detail="Lead has no JD content")

    lead.status = "unscreened"
    lead.analysis_reason = "AI 正在重新识别岗位信息…"
    db.commit()

    asyncio.create_task(
        SkillExecutor.execute_lead_screening_background(
            lead.source_url or "", lead.jd_content, lead.id
        )
    )
    return {"status": "success", "lead_id": lead.id}

@router.get("/")
def get_leads(db: Session = Depends(get_db)):
    """
    Get all active leads for the dashboard, sorted by match_score descending.
    Null scores (unscreened or errors) will appear at the bottom.
    """
    leads = db.query(models.JobLead)\
        .filter(models.JobLead.status != "rejected")\
        .order_by(models.JobLead.match_score.desc().nullslast(), models.JobLead.created_at.desc())\
        .all()
    return leads

@router.post("/{lead_id}/promote")
def promote_lead(lead_id: int, req: PromoteRequest, db: Session = Depends(get_db)):
    """
    Promote a lead to a full JobCase.
    """
    lead = db.query(models.JobLead).filter(models.JobLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    if lead.status == "promoted":
        raise HTTPException(status_code=400, detail="Lead already promoted")
        
    # Create new JobCase
    new_job = models.JobCase(
        company=req.company or lead.company or "未知公司",
        role=req.role or lead.role or "未知岗位",
        jd_content=lead.jd_content,
        match_score=lead.match_score,
        status="简历优化中",
        workflow_data={"source_url": lead.source_url} if lead.source_url else {}
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    
    # Update lead status
    lead.status = "promoted"
    lead.promoted_job_case_id = new_job.id
    db.commit()
    
    return {"status": "success", "job_case_id": new_job.id}

@router.delete("/{lead_id}")
def reject_lead(lead_id: int, db: Session = Depends(get_db)):
    """
    Reject (hide) a lead.
    """
    lead = db.query(models.JobLead).filter(models.JobLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    lead.status = "rejected"
    db.commit()
    return {"status": "success"}
