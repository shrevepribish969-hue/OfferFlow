import os
import json
import re
import asyncio
import logging
from openai import AsyncOpenAI, OpenAI
from dotenv import load_dotenv
from . import models
from ..services.resume_parser_service import normalize_resume_schema

# Load Environment
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

def load_prompt(prompt_name: str) -> str:
    base_path = os.path.join(PROJECT_ROOT, "prompts", "260713Prompt_Base.md")
    skill_path = os.path.join(PROJECT_ROOT, "prompts", prompt_name)
    
    with open(base_path, "r", encoding="utf-8") as f:
        base_content = f.read()
    
    with open(skill_path, "r", encoding="utf-8") as f:
        skill_content = f.read()
        
    return base_content + "\n\n" + skill_content


def model_settings() -> tuple[str, str, str]:
    """Read model configuration at call time without logging secret values."""
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY") or ""
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    model_name = os.getenv("MODEL_NAME", "deepseek-chat")
    return api_key, base_url, model_name


def safe_model_error(exc: Exception) -> str:
    """Return an actionable message without exposing SDK or network internals."""
    message = str(exc).lower()
    status_code = getattr(exc, "status_code", None)
    if "unexpected keyword argument 'proxies'" in message:
        return "模型客户端依赖版本不兼容，请重新部署后再试。"
    if status_code in {401, 403} or "authentication" in message or "invalid api key" in message:
        return "模型服务拒绝了当前密钥，请检查 Render 中的 DEEPSEEK_API_KEY 是否有效。"
    if status_code == 429 or "rate limit" in message or "insufficient" in message:
        return "模型服务额度不足或请求过于频繁，请检查账户余额后稍后重试。"
    return f"模型服务暂时不可用（{exc.__class__.__name__}），请稍后重试。"

class SkillExecutor:
    @staticmethod
    async def _call_llm_bounded(
        system_prompt: str,
        user_payload: dict,
        *,
        timeout_seconds: float = 120.0,
        max_tokens: int = 4000,
    ) -> dict:
        """Run a long generation off the event loop with a hard outer limit."""
        msg_str = json.dumps(user_payload, ensure_ascii=False)
        api_key, base_url, model_name = model_settings()
        if not api_key:
            err = SkillExecutor._format_error(
                "skill_executor",
                "1.0",
                "MODEL_API_KEY_MISSING",
                "模型服务尚未配置。请在 Render 的 offerflow-api 环境变量中设置 DEEPSEEK_API_KEY，然后重新部署。",
                False,
            )
            err["error"] = True
            return err

        def invoke() -> dict:
            client = OpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=min(timeout_seconds, 90.0),
                max_retries=0,
            )
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": msg_str},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
            )
            text = response.choices[0].message.content.strip()
            json_match = re.search(r"\{.*\}", text, re.DOTALL)
            if json_match:
                text = json_match.group(0)
            return json.loads(text)

        try:
            task = asyncio.create_task(asyncio.to_thread(invoke))
            done, _ = await asyncio.wait({task}, timeout=timeout_seconds)
            if not done:
                # Do not await cancellation: the underlying HTTP library may
                # ignore it until the socket returns. The chat request must end.
                task.add_done_callback(lambda finished: finished.exception())
                raise TimeoutError(f"模型服务在 {int(timeout_seconds)} 秒内未返回")
            return task.result()
        except Exception as exc:
            err = SkillExecutor._format_error(
                "skill_executor", "1.0", "LLM_CALL_FAILED", safe_model_error(exc), False
            )
            err["error"] = True
            return err

    @staticmethod
    async def _call_llm(
        system_prompt: str,
        user_payload: dict,
        *,
        timeout_seconds: float = 120.0,
        max_attempts: int = 3,
        max_tokens: int | None = None,
    ) -> dict:
        msg_str = json.dumps(user_payload, ensure_ascii=False)
        api_key, base_url, model_name = model_settings()
        if not api_key:
            err = SkillExecutor._format_error(
                "skill_executor",
                "1.0",
                "MODEL_API_KEY_MISSING",
                "模型服务尚未配置。请在 Render 的 offerflow-api 环境变量中设置 DEEPSEEK_API_KEY，然后重新部署。",
                False,
            )
            err["error"] = True
            return err
        try:
            client = AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=timeout_seconds,
                max_retries=0,
            )
            response = None
            for attempt in range(max_attempts):
                try:
                    request_kwargs = {
                        "model": model_name,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": msg_str}
                        ],
                        "temperature": 0.2,
                    }
                    if max_tokens is not None:
                        request_kwargs["max_tokens"] = max_tokens
                    response = await asyncio.wait_for(
                        client.chat.completions.create(**request_kwargs),
                        timeout=timeout_seconds,
                    )
                    break
                except Exception as exc:
                    status_code = getattr(exc, "status_code", None)
                    transient = status_code in {429, 500, 502, 503, 504} or exc.__class__.__name__ == "APIConnectionError"
                    if not transient or attempt == max_attempts - 1:
                        raise
                    await asyncio.sleep(5 * (attempt + 1))

            if response is None:
                raise RuntimeError("模型服务未返回响应")
            raw = response.choices[0].message.content
            text = raw.strip()
            
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                text = json_match.group(0)
                
            return json.loads(text)
        except Exception as e:
            err = SkillExecutor._format_error("skill_executor", "1.0", "LLM_CALL_FAILED", safe_model_error(e), False)
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
    def _attach_rag_evidence(prep_result: dict, examples: list[dict]) -> None:
        """Attach a source only when the model returns an exact RAG id."""
        evidence_by_id = {
            item["rag_question_id"]: item
            for item in examples
            if item.get("rag_question_id")
        }
        all_questions = list(prep_result.get("questions", [])) + list(
            prep_result.get("technical_hard_questions", [])
        )
        for question in all_questions:
            if not isinstance(question, dict):
                continue
            evidence = evidence_by_id.get(question.get("rag_question_id"))
            if not evidence:
                question.pop("rag_evidence", None)
                continue
            question["rag_evidence"] = {
                "question_id": evidence["rag_question_id"],
                "reference_question": evidence["question"],
                "source": evidence["source"],
                "retrieval": evidence["retrieval"],
            }

    @staticmethod
    def _normalize_interview_prep_result(prep_result: dict) -> dict:
        """Fill optional V5.7 fields without changing the model's coaching content."""
        if not isinstance(prep_result, dict):
            return {}

        questions = prep_result.get("questions")
        if not isinstance(questions, list):
            questions = []
            prep_result["questions"] = questions

        for index, question in enumerate(questions):
            if not isinstance(question, dict):
                continue
            question.setdefault("question_id", f"Q{index + 1}")
            question.setdefault("priority", "must_prepare" if index < 6 else "supplementary")
            question.setdefault("rag_question_id", None)
            for field in (
                "resume_connections",
                "answer_outline",
                "clarification_questions",
                "anticipated_follow_ups",
            ):
                if not isinstance(question.get(field), list):
                    question[field] = []

            example = question.get("recommended_example")
            if not isinstance(example, dict):
                legacy_answer = question.get("suggested_answer_star", "")
                example = {
                    "display_mode": "collapsed_by_default",
                    "example_type": "resume_based",
                    "disclaimer": "这是旧版面试准备内容，请结合真实经历核对后使用。",
                    "answer": legacy_answer,
                    "confirmed_basis": [],
                    "content_to_confirm": [],
                    "illustrative_details": [],
                    "editing_tip": "根据真实经历补充细节。",
                }
                question["recommended_example"] = example
            else:
                example.setdefault("display_mode", "collapsed_by_default")
                example.setdefault("example_type", "resume_based_with_suggestions")
                example.setdefault("disclaimer", "请结合真实经历核对后使用。")
                example.setdefault("answer", "")
                for field in ("confirmed_basis", "content_to_confirm", "illustrative_details"):
                    if not isinstance(example.get(field), list):
                        example[field] = []
                example.setdefault("editing_tip", "根据真实经历补充或删改。")

        if not isinstance(prep_result.get("hiring_rubric"), list):
            prep_result["hiring_rubric"] = []
        if not isinstance(prep_result.get("routine_questions"), list):
            prep_result["routine_questions"] = []
        if not isinstance(prep_result.get("technical_hard_questions"), list):
            prep_result["technical_hard_questions"] = []
        return prep_result

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
    async def execute_lead_screening_background(
        source_url: str, jd_content: str, placeholder_lead_id: int | None = None
    ):
        from .database import SessionLocal
        from . import models
        import json
        
        db_session = SessionLocal()
        try:
            if not jd_content:
                return
                
            profile = db_session.query(models.UserProfile).first()
            resume_text = profile.base_resume if profile else "{}"
            try:
                resume_json = json.loads(resume_text)
            except:
                resume_json = {"raw_text": resume_text}
                
            system_prompt = load_prompt("260713Prompt_Lead_Screening.md")
            user_payload = {
                "jd_raw_text": jd_content,
                "resume_json": resume_json
            }
            
            result = await SkillExecutor._call_llm(system_prompt, user_payload)
            
            placeholder = None
            if placeholder_lead_id is not None:
                placeholder = db_session.query(models.JobLead).filter(
                    models.JobLead.id == placeholder_lead_id
                ).first()

            if "error" in result:
                if placeholder is None:
                    placeholder = models.JobLead(source_url=source_url, jd_content=jd_content)
                    db_session.add(placeholder)
                placeholder.status = "error"
                placeholder.analysis_reason = f"识别失败：{result.get('error_message', '模型服务暂时不可用')}"
            else:
                results_array = result.get("lead_screening_results", [])
                if not results_array:
                    if placeholder is None:
                        placeholder = models.JobLead(source_url=source_url, jd_content=jd_content)
                        db_session.add(placeholder)
                    placeholder.status = "error"
                    placeholder.analysis_reason = "未识别到完整岗位。请打开具体岗位详情页后再一键识别，或直接粘贴包含岗位名称和职责的 JD。"
                else:
                    for index, res in enumerate(results_array):
                        if index == 0 and placeholder is not None:
                            target_lead = placeholder
                        else:
                            target_lead = models.JobLead()
                            db_session.add(target_lead)
                        target_lead.source_url = source_url
                        target_lead.jd_content = res.get("jd_snippet") or jd_content[:4000]
                        target_lead.company = res.get("company") or "未知公司"
                        target_lead.role = res.get("role") or "未知岗位"
                        target_lead.match_score = res.get("score")
                        target_lead.analysis_reason = res.get("reason") or "已完成初筛。"
                        target_lead.status = "analyzed"
                
            db_session.commit()
        except Exception as e:
            db_session.rollback()
            logger.exception("Lead screening failed")
            try:
                failed_lead = None
                if placeholder_lead_id is not None:
                    failed_lead = db_session.query(models.JobLead).filter(
                        models.JobLead.id == placeholder_lead_id
                    ).first()
                if failed_lead is None:
                    failed_lead = models.JobLead(source_url=source_url, jd_content=jd_content)
                    db_session.add(failed_lead)
                failed_lead.status = "error"
                failed_lead.analysis_reason = f"识别失败：{str(e) or e.__class__.__name__}"
                db_session.commit()
            except Exception:
                db_session.rollback()
                logger.exception("Failed to persist lead screening error")
        finally:
            db_session.close()

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
            resume_json = normalize_resume_schema(json.loads(profile.base_resume))
        except:
            resume_json = normalize_resume_schema(profile.base_resume)
            
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
            # Empty suggestions cannot be acted on and previously rendered as
            # large blank diff cards. Keep legitimate additions (empty
            # original) but discard patches that have no proposed content.
            clean_patches = [
                patch for patch in (res_opt.get("optimization_patches", []) or [])
                if isinstance(patch, dict) and str(patch.get("suggestion") or "").strip()
            ]
            res_opt["optimization_patches"] = clean_patches
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["optimization_patches"] = clean_patches
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
                optimization_patches=clean_patches,
                optimization_summary=res_opt.get("optimization_summary", ""),
            )
            db_session.add(rv)
            SkillExecutor.append_timeline_event(db_session, job.id, "ResumeVersionCreated", {"version_number": existing_count + 1})

            
        
        return SkillExecutor._format_success('resume_optimization', '1.0', result)

    @staticmethod
    async def execute_interview_prep(job: models.JobCase, db_session, user_input: str = "", round_id: str = None) -> dict:
        w_data = job.workflow_data or {}
        jd_result = w_data.get("jd_analysis_result", {})
        if not jd_result and job.jd_content:
            jd_response = await SkillExecutor.execute_jd_analysis(job, db_session)
            if jd_response.get("status") == "error":
                return SkillExecutor._format_error(
                    "interview_prep", "5.7", "PRECONDITION_FAILED", "后台提取 JD 关键信息失败"
                )
            w_data = job.workflow_data or {}
            jd_result = w_data.get("jd_analysis_result", {})
        
        # 1. Retrieve real interview examples. These calibrate wording and
        # follow-up style; they no longer define the interview coverage.
        from runtime.services.hierarchical_retriever import HierarchicalRetriever
        # The bundled sentence-transformer can monopolize the Python runtime
        # during cold start on Windows. Metadata + lexical ranking is already
        # deterministic and explainable, so keep the interactive request on
        # that reliable path. Semantic indexing can still be prepared offline.
        retriever = HierarchicalRetriever(enable_semantic=False)
        retrieval_kwargs = {
            "jd_analysis_result": jd_result,
            "target_company": job.company,
            "target_role": job.role,
            "top_k": 5,
        }
        logger.info("InterviewPrep: lexical retrieval started")
        top_questions = retriever.retrieve(**retrieval_kwargs)
        logger.info("InterviewPrep: lexical retrieval completed with %s questions", len(top_questions))
        
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

            source_details = []
            for source in q.get("sources", []):
                if not isinstance(source, dict):
                    continue
                source_details.append({
                    "document": source.get("document", ""),
                    "page": source.get("page"),
                })

            formatted_questions.append({
                "rag_question_id": q.get("question_hash"),
                "question": q.get("question"),
                "source": {
                    "company": c_name,
                    "frequency": q.get("duplicate_count", 1),
                    "documents": source_details,
                },
                "competency": q.get("competency", ""),
                "best_match_story": best_match_story,
                # Repeating every story name for every question made the prompt
                # grow quadratically without improving the answer.
                "other_stories": list(dict.fromkeys(other_stories))[:5],
                "retrieval": {
                    "score": q.get("_retrieval_score", 0),
                    "score_breakdown": q.get("_score_breakdown", {}),
                    "reasons": q.get("_retrieval_reasons", []),
                    "layers": q.get("_retrieval_layers", []),
                },
            })

        # 4. Construct Full Interview Context & Call LLM
        system_prompt = load_prompt("260713Prompt_Interview_Prep.md")
        
        # Only user-confirmed memories may influence future generations.
        from ..services.memory_service import MemoryService
        profile = db_session.query(models.UserProfile).filter(models.UserProfile.id == user_id).first()
        confirmed_memory = MemoryService.get_context(db_session, user_id=user_id)
        logger.info("InterviewPrep: memory and story context loaded")
        weakness_memory = confirmed_memory.get("weaknesses", []) + confirmed_memory.get("systemic_weaknesses", [])

        round_map = {"1": "一面", "2": "二面", "hr": "HR面"}
        round_label = round_map.get(str(round_id).lower(), "一面")

        jd_skills = jd_result.get("skills", [])
        must_capabilities = [
            skill.get("name") for skill in jd_skills
            if isinstance(skill, dict) and skill.get("importance") == "must" and skill.get("name")
        ]
        preferred_capabilities = [
            skill.get("name") for skill in jd_skills
            if isinstance(skill, dict) and skill.get("importance") == "preferred" and skill.get("name")
        ]
        matching_result = w_data.get("job_matching_result", {})
        interviewer_lens = {
            "company": job.company,
            "role": job.role,
            "round": round_label,
            "baseline_dimensions": [
                {"key": "role_understanding", "label": "岗位理解", "priority": "high"},
                {"key": "motivation_fit", "label": "求职动机与稳定性", "priority": "high"},
                {"key": "core_capability", "label": "岗位核心能力", "priority": "high"},
                {"key": "transferability", "label": "可迁移能力", "priority": "high"},
                {"key": "gap_validation", "label": "缺口与风险验证", "priority": "medium"},
                {"key": "resume_deep_dive", "label": "简历真实性与项目复盘", "priority": "medium"},
            ],
            "must_capabilities": must_capabilities,
            "preferred_capabilities": preferred_capabilities,
            "resume_evidence": {
                "matched_must": matching_result.get("must_skill_match", []),
                "matched_preferred": matching_result.get("preferred_skill_match", []),
                "missing": matching_result.get("missing_skills", []),
                "risks": matching_result.get("risks", []),
                "summary": matching_result.get("reason", ""),
            },
        }

        # Later-round preparation is driven by what actually happened in the
        # previous interview, not by the previous predicted question list.
        previous_evaluations = w_data.get("interview_evaluations", [])
        if str(round_id).lower() != "1" and previous_evaluations:
            previous_eval = previous_evaluations[-1]
            interviewer_lens["previous_round_evidence"] = {
                "actual_interviewer_focus": previous_eval.get("role_summary", {}).get("actual_interviewer_focus", []),
                "verified_strengths": previous_eval.get("verified_strengths", []),
                "exposed_risks": previous_eval.get("exposed_risks", []),
                "unresolved_points": previous_eval.get("unresolved_points", []),
                "next_round_brief": previous_eval.get("next_round_brief", {}),
            }

        matched_story_names = {
            item["best_match_story"]["project_name"]
            for item in formatted_questions
            if item.get("best_match_story")
        }
        ranked_stories = sorted(
            story_cards,
            key=lambda story: (
                story.project_name in matched_story_names,
                story.performance_score or 0,
            ),
            reverse=True,
        )[:8]
        story_bank = [
            {
                "project_name": story.project_name,
                "summary": (story.summary or "")[:800],
                "competency_tags": story.competency_tags,
                "performance_score": story.performance_score,
            }
            for story in ranked_stories
        ]
        resume_payload = profile.base_resume if profile else {}
        if isinstance(resume_payload, str):
            try:
                resume_payload = normalize_resume_schema(json.loads(resume_payload))
            except json.JSONDecodeError:
                resume_payload = normalize_resume_schema(resume_payload)

        user_payload = {
            "interview_context": {
                "round_label": round_label,
                "user_input": user_input,
                "jd_analysis_result": jd_result,
                "interviewer_lens": interviewer_lens,
                "rag_question_examples": formatted_questions,
                "story_bank": story_bank,
                "weakness_memory": weakness_memory,
                "resume_json": resume_payload,
            }
        }
        
        logger.info(
            "InterviewPrep: model call started (payload_chars=%s, stories=%s)",
            len(json.dumps(user_payload, ensure_ascii=False)),
            len(story_bank),
        )
        result = await SkillExecutor._call_llm_bounded(
            system_prompt,
            user_payload,
            timeout_seconds=150.0,
            max_tokens=6000,
        )
        logger.info(
            "InterviewPrep: model call completed (error=%s, detail=%s)",
            "error" in result,
            result.get("error_message", ""),
        )

        if "error" in result:
            error_result = SkillExecutor._format_error(
                "interview_prep",
                "5.7",
                result.get("error_code", "LLM_CALL_FAILED"),
                result.get("error_message", "面试内容生成失败"),
            )
            error_result["error"] = True
            return error_result

        # Attach evidence only through an explicit RAG id. Index-based binding
        # can attribute the wrong source when the model changes question order.
        if "error" not in result:
            prep_result = SkillExecutor._normalize_interview_prep_result(
                result.get("interview_prep_result", {})
            )
            result["interview_prep_result"] = prep_result
            SkillExecutor._attach_rag_evidence(prep_result, formatted_questions)
            prep_result["retrieval_summary"] = {
                "strategy": "full_mvp_v5_7_rag_calibration",
                "question_count": len(formatted_questions),
                "semantic_active": any(
                    "semantic" in item.get("retrieval", {}).get("layers", [])
                    for item in formatted_questions
                ),
            }
        
        if "error" not in result:
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["interview_prep_result"] = result
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "InterviewPrepGenerated", {"skill_version": "5.7"})
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

            
        
        return SkillExecutor._format_success('interview_prep', '5.7', result)

    @staticmethod
    async def execute_job_matching(job: models.JobCase, db_session) -> dict:
        profile = db_session.query(models.UserProfile).first()
        resume_text = profile.base_resume if profile else ""
        
        system_prompt = load_prompt("260713Prompt_Job_Matching.md")
        
        w_data = dict(job.workflow_data) if job.workflow_data else {}
        # Silently derive the prerequisite context when the user requests
        # matching directly. This does not create an extra visible artifact.
        jd_analysis = w_data.get("jd_analysis_result", {})
        if not jd_analysis and job.jd_content:
            jd_response = await SkillExecutor.execute_jd_analysis(job, db_session)
            if jd_response.get("status") == "error":
                return SkillExecutor._format_error(
                    "job_matching", "1.0", "PRECONDITION_FAILED", "后台提取 JD 关键信息失败"
                )
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            jd_analysis = w_data.get("jd_analysis_result", {})
        
        # Prepare payload according to the new prompt requirements
        import json
        try:
            resume_json = normalize_resume_schema(json.loads(resume_text)) if resume_text else normalize_resume_schema({})
        except:
            resume_json = normalize_resume_schema(resume_text)
            
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
            resume_json = normalize_resume_schema(json.loads(base_resume_str))
        except:
            resume_json = normalize_resume_schema(base_resume_str)
            
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
        resume_json = normalize_resume_schema(profile.base_resume if profile else "{}")
        
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
    async def execute_interview_eval(job: models.JobCase, user_input: str, db_session, round_id: str = None) -> dict:
        w_data = job.workflow_data or {}
        jd_result = w_data.get("jd_analysis_result", {})

        profile = db_session.query(models.UserProfile).first()
        resume_payload = profile.base_resume if profile else {}
        if isinstance(resume_payload, str):
            try:
                resume_payload = normalize_resume_schema(json.loads(resume_payload))
            except json.JSONDecodeError:
                resume_payload = normalize_resume_schema(resume_payload)

        story_cards = db_session.query(models.StoryCard).filter(
            models.StoryCard.user_id == (profile.id if profile else 1)
        ).all()
        
        system_prompt = load_prompt("260713Prompt_Interview_Eval.md")
        user_payload = {
            "interview_recording": user_input,
            "round_id": round_id,
            "role_context": {
                "company": job.company,
                "role": job.role,
                "jd_analysis_result": jd_result,
            },
            "candidate_evidence": {
                "resume_json": resume_payload,
                "story_bank": [
                    {
                        "project_name": story.project_name,
                        "summary": story.summary,
                        "competency_tags": story.competency_tags,
                        "star_details": story.star_details,
                    }
                    for story in story_cards
                ],
            },
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)

        if "error" in result:
            return result
        
        w_data = dict(job.workflow_data) if job.workflow_data else {}
        # Append evaluation history
        evals = w_data.get("interview_evaluations", [])
        evals.append(result.get("interview_evaluation_result", {}))
        w_data["interview_evaluations"] = evals
        job.workflow_data = w_data
        SkillExecutor.append_timeline_event(db_session, job.id, "InterviewEvaluated", {"skill_version": "3.0"})
        # Phase 5: Update Interview record with evaluation
        latest_interview = db_session.query(models.Interview).filter(
            models.Interview.job_case_id == job.id
        ).order_by(models.Interview.round_number.desc()).first()
        if latest_interview:
            latest_interview.evaluation = result.get("interview_evaluation_result", {})
            latest_interview.status = "evaluated"

            
        
        return SkillExecutor._format_success('interview_evaluation', '3.0', result)

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
        from ..services.memory_service import MemoryService
        global_memory = MemoryService.get_context(db_session, user_id=profile.id)
        
        system_prompt = load_prompt("260713Prompt_Reflection.md")
        user_payload = {
            "interview_evaluation_result": latest_eval,
            "existing_global_memory": global_memory
        }
        
        result = await SkillExecutor._call_llm(system_prompt, user_payload)
        
        if "error" not in result:
            reflection_res = result.get("reflection_result", {})
            candidate_memory = {
                "systemic_weaknesses": reflection_res.get("systemic_weaknesses", []),
                "core_strengths": reflection_res.get("core_strengths", []),
            }
            for tool_call in result.get("tool_calls", []):
                if tool_call.get("action") == "Update_Memory":
                    parameters = tool_call.get("parameters", {})
                    candidate_memory["knowledge_tags"] = parameters.get("knowledge_tags", [])
                    candidate_memory["insights"] = parameters.get("insights", [])
            
            w_data = dict(job.workflow_data) if job.workflow_data else {}
            w_data["latest_reflection"] = reflection_res
            job.workflow_data = w_data
            SkillExecutor.append_timeline_event(db_session, job.id, "ReflectionCreated", {"skill_version": "2.0"})
            # Phase 5: Create Reflection record
            latest_interview = db_session.query(models.Interview).filter(
                models.Interview.job_case_id == job.id
            ).order_by(models.Interview.round_number.desc()).first()
            ref = models.Reflection(
                job_case_id=job.id,
                interview_id=latest_interview.id if latest_interview else None,
                content=reflection_res,
                memory_snapshot=candidate_memory,
            )
            db_session.add(ref)
            db_session.flush()
            # Phase 7: Extract MemoryItems from reflection
            from ..services.memory_service import MemoryService
            candidates = MemoryService.store_from_reflection(ref, candidate_memory, db_session)
            reflection_res["memory_candidates"] = [
                {"category": item.category, "content": item.content, "status": "pending"}
                for item in candidates
            ]

            
        return SkillExecutor._format_success("reflection", "2.0", result)





