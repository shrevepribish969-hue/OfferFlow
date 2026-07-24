import os
import json
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv
from . import models

# Load Environment
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

def load_prompt(prompt_name: str) -> str:
    base_path = os.path.join(PROJECT_ROOT, "prompts", "260713Prompt_Base.md")
    skill_path = os.path.join(PROJECT_ROOT, "prompts", prompt_name)
    
    with open(base_path, "r", encoding="utf-8") as f:
        base_content = f.read()
    
    with open(skill_path, "r", encoding="utf-8") as f:
        skill_content = f.read()
        
    return base_content + "\n\n" + skill_content

class SkillExecutor:
    @staticmethod
    async def _call_llm(system_prompt: str, user_payload: dict) -> dict:
        client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
        msg_str = json.dumps(user_payload, ensure_ascii=False)
        try:
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": msg_str}
                ],
                temperature=0.2
            )
            raw = response.choices[0].message.content
            text = raw.strip()
            
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                text = json_match.group(0)
                
            return json.loads(text)
        except Exception as e:
            err = SkillExecutor._format_error("skill_executor", "1.0", "LLM_CALL_FAILED", str(e), False)
            err["error"] = True
            return err

    @staticmethod
    def _format_success(skill_name: str, skill_version: str, result: dict) -> dict:
        return {
            "status": "success",
            "skill_name": skill_name,
            "skill_version": skill_version,
            "result": result
        }

    @staticmethod
    def _format_error(skill_name: str, skill_version: str, error_code: str, error_message: str, recoverable: bool = True) -> dict:
        return {
            "status": "error",
            "skill_name": skill_name,
            "skill_version": skill_version,
            "error_code": error_code,
            "error_message": error_message,
            "recoverable": recoverable
        }

    @staticmethod
    def append_timeline_event(db_session, job_case_id: int, event_type: str, event_data: dict = None):
        """Append a timeline event after a workflow completes successfully."""
        from . import models
        event = models.TimelineEvent(
            job_case_id=job_case_id,
            event_type=event_type,
            event_data=event_data or {}
        )
        db_session.add(event)
        db_session.commit()


    @staticmethod
    async def execute_jd_analysis(job: models.JobCase, db_session) -> dict:
        """Executes the real JD Analysis prompt."""
        if not job.jd_content:
            return SkillExecutor._format_error("jd_analysis", "1.0", "EMPTY_INPUT", "No JD content found. Please paste the job description first.")
            
        system_prompt = load_prompt("260713Prompt_JD_Analysis.md")

        user_payload = {
            "jd_raw_text": job.jd_content
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        # Merge into workflow_data
        if "error" not in result:
            # SQLAlchemy JSON mutation quirk: need to reassign to register change
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["jd_analysis_result"] = result.get("jd_analysis_result", {})
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "JDAnalyzed", {"skill_version": "1.0"})
            
        
        return SkillExecutor._format_success('jd_analysis', '1.0', result)

    @staticmethod
    async def execute_resume_optimization(job: models.JobCase, db_session) -> dict:
        """Executes the real Resume Optimization prompt."""
        # 1. Fetch user base resume
        profile = db_session.query(models.UserProfile).first()
        if not profile or not profile.base_resume:
            return SkillExecutor._format_error("resume_optimization", "1.0", "MISSING_RESUME", "No base resume found.")
            
        # 2. Check if JD Analysis exists
        w_data = job.workflow_data or {}
        jd_result = w_data.get("jd_analysis_result")
        if not jd_result:
            # Auto-run JD Analysis if missing!
            jd_resp = await SkillExecutor.execute_jd_analysis(job, db_session)
            if jd_resp.get("status") == "error":
                return SkillExecutor._format_error("resume_optimization", "1.0", "PRECONDITION_FAILED", "Auto-run JD analysis failed.")
            w_data = job.workflow_data or {}
            jd_result = w_data.get("jd_analysis_result")
            if not jd_result:
                return SkillExecutor._format_error("resume_optimization", "1.0", "PRECONDITION_FAILED", "Prerequisite JD analysis did not return expected results.")
            
        import json
        try:
            resume_json = json.loads(profile.base_resume)
        except:
            resume_json = profile.base_resume
            
        system_prompt = load_prompt("260713Prompt_Resume_Optimization.md")
        
        user_payload = {
            "jd_analysis_result": jd_result,
            "job_matching_result": w_data.get("job_matching_result", {}), # Optional for now
            "resume_json": resume_json
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        # Merge into workflow_data
        if "error" not in result:
            res_opt = result.get("resume_optimization_result", {})
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["optimization_patches"] = res_opt.get("optimization_patches", [])
            w_data["optimization_summary"] = res_opt.get("optimization_summary", "")
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "ResumeOptimized", {"skill_version": "1.0"})
            # Phase 4: Save as first-class ResumeVersion
            profile = db_session.query(models.UserProfile).first()
            existing_count = db_session.query(models.ResumeVersion).filter(
                models.ResumeVersion.job_case_id == job.id
            ).count()
            rv = models.ResumeVersion(
                job_case_id=job.id,
                version_number=existing_count + 1,
                base_resume_snapshot=profile.base_resume if profile else None,
                optimization_patches=res_opt.get("optimization_patches", []),
                optimization_summary=res_opt.get("optimization_summary", ""),
            )
            db_session.add(rv)
            SkillExecutor.append_timeline_event(db_session, job.id, "ResumeVersionCreated", {"version_number": existing_count + 1})

            
        
        return SkillExecutor._format_success('resume_optimization', '1.0', result)

    @staticmethod
    async def execute_interview_prep(job: models.JobCase, db_session, user_input: str = "", round_id: str = None) -> dict:
        w_data = job.workflow_data or {}
        jd_result = w_data.get("jd_analysis_result", {})
        
        # 1. Five-Layer Hierarchical Retrieval (RAG)
        from runtime.services.hierarchical_retriever import HierarchicalRetriever
        retriever = HierarchicalRetriever()
        top_questions = retriever.retrieve(
            jd_analysis_result=jd_result, 
            target_company=job.company, 
            target_role=job.role, 
            top_k=5
        )
        
        # 2. Fetch User Global Story Bank
        user = db_session.query(models.UserProfile).first()
        user_id = user.id if user else 1
        story_cards = db_session.query(models.StoryCard).filter(models.StoryCard.user_id == user_id).all()
        
        # 3. Programmatic Story Mapping
        def calculate_story_score(story: models.StoryCard, q_competency: str) -> int:
            score = 0
            q_comp_lower = (q_competency or "").lower()
            if not q_comp_lower:
                return 0
            for tag in story.competency_tags:
                tag_lower = str(tag).lower()
                if tag_lower in q_comp_lower or q_comp_lower in tag_lower:
                    score += 50
                # Fallback to dictionary matching
                from runtime.services.hierarchical_retriever import COMPETENCY_DICTIONARY
                for k, v_list in COMPETENCY_DICTIONARY.items():
                    if (tag_lower in k.lower() or any(tag_lower in v.lower() for v in v_list)) and \
                       (q_comp_lower in k.lower() or any(q_comp_lower in v.lower() for v in v_list)):
                        score += 30
            # Also consider global performance score (Story Feedback loop)
            score += (story.performance_score or 0) * 5
            return score

        # Format for prompt and Attach recommended story to each question
        formatted_questions = []
        for q in top_questions:
            comps = q.get("companies", ["General"])
            # Format companies as a comma separated string to represent knowledge base reality
            c_name = ", ".join(comps)
            
            best_story = None
            best_score = -1
            other_stories = []
            
            for sc in story_cards:
                score = calculate_story_score(sc, q.get("competency", ""))
                if score > best_score:
                    if best_story:
                        other_stories.append(best_story.project_name)
                    best_score = score
                    best_story = sc
                else:
                    other_stories.append(sc.project_name)
            
            best_match_story = None
            if best_story and best_score > 0:
                best_match_story = {
                    "project_name": best_story.project_name,
                    "summary": best_story.summary
                }

            formatted_questions.append({
                "question": q.get("question"),
                "source": {"company": c_name, "frequency": q.get("duplicate_count", 1)},
                "competency": q.get("competency", ""),
                "best_match_story": best_match_story,
                "other_stories": other_stories
            })

        # 4. Construct Full Interview Context & Call LLM
        system_prompt = load_prompt("260713Prompt_Interview_Prep.md")
        
        # Load user global memory for Weakness injection
        profile = db_session.query(models.UserProfile).filter(models.UserProfile.id == user_id).first()
        weakness_memory = profile.user_memory.get("weaknesses", []) if profile and profile.user_memory else []

        round_map = {"1": "一面", "2": "二面", "hr": "HR面"}
        round_label = round_map.get(str(round_id).lower(), "一面")

        user_payload = {
            "interview_context": {
                "round_label": round_label,
                "user_input": user_input,
                "jd_analysis_result": jd_result,
                "top_questions_with_stories": formatted_questions,
                "weakness_memory": weakness_memory,
                "resume_json": profile.base_resume if profile else "{}"
            }
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        if "error" not in result:
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["interview_prep_result"] = result
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "InterviewPrepGenerated", {"skill_version": "1.0"})
            # Phase 5: Create Interview record
            existing_count = db_session.query(models.Interview).filter(
                models.Interview.job_case_id == job.id
            ).count()
            interview = models.Interview(
                job_case_id=job.id,
                round_number=existing_count + 1,
                status="prepared",
                prep_pack=result,
            )
            db_session.add(interview)

            
        
        return SkillExecutor._format_success('interview_prep', '1.0', result)

    @staticmethod
    async def execute_job_matching(job: models.JobCase, db_session) -> dict:
        profile = db_session.query(models.UserProfile).first()
        resume_text = profile.base_resume if profile else ""
        
        system_prompt = load_prompt("260713Prompt_Job_Matching.md")
        
        w_data = dict(job.workflow_data) if job.workflow_data else {}
        # Fetch jd_analysis_result if available, else fallback to raw text (for backwards compatibility if needed)
        jd_analysis = w_data.get("jd_analysis_result", {})
        
        # Prepare payload according to the new prompt requirements
        import json
        try:
            resume_json = json.loads(resume_text) if resume_text else {}
        except:
            resume_json = {"raw_text": resume_text}
            
        user_payload = {
            "jd_analysis_result": jd_analysis,
            "resume_analysis_result": resume_json
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        if "error" not in result:
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            res = result.get("job_matching_result", {})
            
            # --- Programmatic Scoring Logic ---
            score_breakdown = {
                "total": 0,
                "education": 0,
                "experience": 0,
                "must_skills": 0,
                "preferred_skills": 0
            }
            
            # 1. Education (10 points)
            if res.get("education_match"):
                score_breakdown["education"] = 10
                
            # 2. Experience (20 points)
            if res.get("experience_match"):
                score_breakdown["experience"] = 20
                
            # 3. Must Skills (40 points)
            jd_skills = jd_analysis.get("skills", [])
            must_skills_in_jd = [s for s in jd_skills if s.get("importance") == "must"]
            total_must = len(must_skills_in_jd)
            matched_must = len(res.get("must_skill_match", []))
            
            if total_must > 0:
                score_breakdown["must_skills"] = min(40, int(40 * (matched_must / total_must)))
            else:
                score_breakdown["must_skills"] = 40
                
            # 4. Preferred Skills (30 points)
            preferred_skills_in_jd = [s for s in jd_skills if s.get("importance") == "preferred"]
            total_preferred = len(preferred_skills_in_jd)
            matched_preferred = len(res.get("preferred_skill_match", []))
            
            if total_preferred > 0:
                score_breakdown["preferred_skills"] = min(30, int(30 * (matched_preferred / total_preferred)))
            else:
                score_breakdown["preferred_skills"] = 30
                
            # 5. Calculate Total
            score_breakdown["total"] = (
                score_breakdown["education"] + 
                score_breakdown["experience"] + 
                score_breakdown["must_skills"] + 
                score_breakdown["preferred_skills"]
            )
            
            res["score_breakdown"] = score_breakdown
            result["job_matching_result"] = res
            
            w_data["job_matching_result"] = result
            job.workflow_data = w_data
            job.match_score = score_breakdown["total"]
            
            SkillExecutor.append_timeline_event(db_session, job.id, "JobMatched", {"skill_version": "1.0"})
            
        return SkillExecutor._format_success('job_matching', '1.0', result)

    @staticmethod
    async def execute_content_generation(job: models.JobCase, db_session, accepted_indices: list = None) -> dict:
        w_data = job.workflow_data or {}
        
        # 1. Load the original base resume
        profile = db_session.query(models.UserProfile).first()
        base_resume_str = profile.base_resume if profile else "{}"
        
        # 2. Apply patches if they exist safely on JSON object
        import json
        try:
            resume_json = json.loads(base_resume_str)
        except:
            resume_json = {}
            
        patches = w_data.get("optimization_patches", [])
        
        # Filter patches based on user selection (default to rejecting all unaccepted)
        if accepted_indices is not None:
            filtered_patches = [patches[i] for i in range(len(patches)) if i in accepted_indices]
        else:
            # Fallback to no patches if the list wasn't provided but generation was triggered
            filtered_patches = []
            
        if filtered_patches and isinstance(resume_json, dict):
            def apply_patches_to_dict(d, patch_list):
                if isinstance(d, dict):
                    for k, v in d.items():
                        if isinstance(v, str):
                            for p in patch_list:
                                orig = p.get("original", "")
                                sugg = p.get("suggestion", "")
                                if orig and sugg and orig in v:
                                    d[k] = v.replace(orig, sugg)
                                    v = d[k] # update local ref in case of multiple replacements on same string
                        else:
                            apply_patches_to_dict(v, patch_list)
                elif isinstance(d, list):
                    for i in range(len(d)):
                        if isinstance(d[i], str):
                            for p in patch_list:
                                orig = p.get("original", "")
                                sugg = p.get("suggestion", "")
                                if orig and sugg and orig in d[i]:
                                    d[i] = d[i].replace(orig, sugg)
                        else:
                            apply_patches_to_dict(d[i], patch_list)
                            apply_patches_to_dict(d[i], patch_list)
                            
            apply_patches_to_dict(resume_json, filtered_patches)
            
        result = {
            "content_generation_result": {
                "resume_json": resume_json
            }
        }
        
        w_data = dict(job.workflow_data) if job.workflow_data else {}
        w_data["content_generation_result"] = result
        w_data["resume_json"] = resume_json # Also save it at the top level for consistency
        job.workflow_data = w_data
        # Phase 4: Update latest ResumeVersion with merged resume
        latest_rv = db_session.query(models.ResumeVersion).filter(
            models.ResumeVersion.job_case_id == job.id
        ).order_by(models.ResumeVersion.version_number.desc()).first()
        if latest_rv:
            latest_rv.merged_resume = resume_json
        else:
            # Create a ResumeVersion even without prior optimization
            rv = models.ResumeVersion(
                job_case_id=job.id,
                version_number=1,
                status="accepted",
                merged_resume=resume_json,
            )
            db_session.add(rv)

        SkillExecutor.append_timeline_event(db_session, job.id, "CommunicationDrafted", {"skill_version": "1.0"})
            
        
        return SkillExecutor._format_success('content_generation', '1.0', result)

    @staticmethod
    async def execute_greeting_generation(job: models.JobCase, db_session) -> dict:
        w_data = job.workflow_data or {}
        jd_content = job.jd_content or ""
        
        profile = db_session.query(models.UserProfile).first()
        resume_json = profile.base_resume if profile else "{}"
        
        jd_analysis_result = w_data.get("jd_analysis_result", {})
        job_matching_result = w_data.get("job_matching_result", {})
        
        system_prompt = load_prompt("260713Prompt_Greeting_Generation.md")
        user_payload = {
            "jd_content": jd_content,
            "resume_json": resume_json,
            "jd_analysis_result": jd_analysis_result,
            "job_matching_result": job_matching_result
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        if "error" not in result:
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["greeting_generation_result"] = result
            job.workflow_data = w_data
        SkillExecutor.append_timeline_event(db_session, job.id, "CommunicationDrafted", {"skill_version": "1.0"})
            
        
        return SkillExecutor._format_success('greeting_generation', '1.0', result)

    @staticmethod
    async def execute_interview_eval(job: models.JobCase, user_input: str, db_session) -> dict:
        w_data = job.workflow_data or {}
        jd_result = w_data.get("jd_analysis_result", {})
        prep_result = w_data.get("interview_prep_result", {})
        
        system_prompt = load_prompt("260713Prompt_Interview_Eval.md")
        user_payload = {
            "interview_recording": user_input,
            "jd_analysis_result": jd_result,
            "interview_prep_result": prep_result
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        if "error" not in result:
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            # Append evaluation history
            evals = w_data.get("interview_evaluations", [])
            evals.append(result.get("interview_evaluation_result", {}))
            w_data["interview_evaluations"] = evals
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "InterviewEvaluated", {"skill_version": "1.0"})
            # Phase 5: Update Interview record with evaluation
            latest_interview = db_session.query(models.Interview).filter(
                models.Interview.job_case_id == job.id
            ).order_by(models.Interview.round_number.desc()).first()
            if latest_interview:
                latest_interview.evaluation = result.get("interview_evaluation_result", {})
                latest_interview.status = "evaluated"

            
        
        return SkillExecutor._format_success('interview_evaluation', '1.0', result)

    @staticmethod
    async def execute_reflection(job: models.JobCase, db_session) -> dict:
        profile = db_session.query(models.UserProfile).first()
        if not profile:
            return SkillExecutor._format_error("reflection", "1.0", "EMPTY_INPUT", "User profile not found.")
            
        w_data = job.workflow_data or {}
        evals = w_data.get("interview_evaluations", [])
        if not evals:
            return SkillExecutor._format_error("reflection", "1.0", "EMPTY_INPUT", "No interview evaluations found to reflect upon.")
            
        latest_eval = evals[-1]
        global_memory = profile.user_memory or {}
        
        system_prompt = load_prompt("260713Prompt_Reflection.md")
        user_payload = {
            "interview_evaluation_result": latest_eval,
            "existing_global_memory": global_memory
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        if "error" not in result:
            reflection_res = result.get("reflection_result", {})
            new_memory = reflection_res.get("updated_global_memory", {})
            profile.user_memory = new_memory
            
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["latest_reflection"] = reflection_res
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "ReflectionCreated", {"skill_version": "1.0"})
            # Phase 5: Create Reflection record
            latest_interview = db_session.query(models.Interview).filter(
                models.Interview.job_case_id == job.id
            ).order_by(models.Interview.round_number.desc()).first()
            ref = models.Reflection(
                job_case_id=job.id,
                interview_id=latest_interview.id if latest_interview else None,
                content=reflection_res,
                memory_snapshot=new_memory,
            )
            db_session.add(ref)
            # Phase 7: Extract MemoryItems from reflection
            from ..services.memory_service import MemoryService
            MemoryService.store_from_reflection(ref, new_memory, db_session)

            
        return SkillExecutor._format_success("reflection", "1.0", result)





