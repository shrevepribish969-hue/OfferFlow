from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from .database import Base

class JobCase(Base):
    __tablename__ = "job_cases"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String, index=True)
    role = Column(String, index=True)
    status = Column(String, default="简历优化中")
    match_score = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Store JD content
    jd_content = Column(Text, nullable=True)
    
    # JSON strings to store context links/tags
    context_files = Column(JSON, default=list) # [{"name": "JD.pdf", "type": "jd"}, ...]
    memory_tags = Column(JSON, default=list) # ["AI 产品", ...]
    workflow_data = Column(JSON, default=dict) # Store intermediate LLM outputs

class UserProfile(Base):
    __tablename__ = "user_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    base_resume = Column(Text, nullable=True)
    user_memory = Column(JSON, default=dict) # Store reflections and global learnings
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    job_case_id = Column(Integer, index=True)
    role = Column(String) # 'user' or 'agent'
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class StoryCard(Base):
    __tablename__ = "story_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True) # References UserProfile
    project_name = Column(String, index=True)
    summary = Column(Text)
    competency_tags = Column(JSON, default=list) # e.g. ["Prompt Engineering", "Product Design"]
    star_details = Column(JSON, default=dict) # e.g. {"Situation": "...", "Task": "...", "Action": "...", "Result": "..."}
    performance_score = Column(Integer, default=0) # For Story Feedback mechanism
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())




class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id = Column(Integer, primary_key=True, index=True)
    job_case_id = Column(Integer, index=True, nullable=False)
    version_number = Column(Integer, nullable=False)
    status = Column(String, default="proposed")

    # Snapshot of master resume at time of optimization
    base_resume_snapshot = Column(Text, nullable=True)
    optimization_patches = Column(JSON, default=list)
    optimization_summary = Column(Text, nullable=True)

    # Result of content generation (apply patches + merge)
    merged_resume = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())



class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    job_case_id = Column(Integer, index=True, nullable=False)
    round_number = Column(Integer, nullable=False)
    status = Column(String, default="prepared")

    prep_pack = Column(JSON, default=dict)
    evaluation = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Reflection(Base):
    __tablename__ = "reflections"

    id = Column(Integer, primary_key=True, index=True)
    job_case_id = Column(Integer, index=True, nullable=False)
    interview_id = Column(Integer, nullable=True)

    content = Column(JSON, default=dict)
    memory_snapshot = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())



class MemoryItem(Base):
    __tablename__ = "memory_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, default=1)
    source_type = Column(String, nullable=False)       # reflection | manual | skill | profile
    source_id = Column(Integer, nullable=True)

    category = Column(String, nullable=False)          # weakness | strength | preference | skill_insight | story
    content = Column(Text, nullable=False)
    confidence = Column(Float, default=0.5)

    scope = Column(String, default="global")           # global | job_case:<id> | skill:<name>
    is_confirmed = Column(Integer, default=0)          # 0=unconfirmed, 1=confirmed, -1=rejected
    is_active = Column(Integer, default=1)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id = Column(Integer, primary_key=True, index=True)
    job_case_id = Column(Integer, index=True, nullable=False)
    event_type = Column(String, index=True, nullable=False)
    event_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class JobLead(Base):
    __tablename__ = "job_leads"
    
    id = Column(Integer, primary_key=True, index=True)
    company = Column(String, nullable=True)
    role = Column(String, nullable=True)
    source_url = Column(String, nullable=True)     
    jd_content = Column(Text, nullable=True)       
    
    status = Column(String, default="unscreened") 
    
    match_score = Column(Integer, nullable=True)   
    analysis_reason = Column(Text, nullable=True)  
    
    promoted_job_case_id = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
