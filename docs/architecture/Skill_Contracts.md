# OfferFlow Skill Contracts

Status: Frozen for Phase 1 Architecture Freeze
Scope: MVP Skill input/output/error contracts

## 1. Purpose

This document freezes MVP Skill Contracts. Skill Contract is the shared boundary between Prompt, Workflow, backend validation, frontend rendering, and evaluation.

A Skill is not a chat response. A Skill is a versioned AI capability with fixed input, fixed output, fixed schema, fixed error codes, and evaluation cases.

## 2. Global Skill Contract Rules

Every Skill must define:

- `skill_name`
- `skill_version`
- `input_schema_version`
- `output_schema_version`
- `prompt_version`
- `input`
- `output`
- `error_codes`
- `downstream_consumers`

Every Skill output must be valid JSON.

Every Skill must return either:

```json
{
  "status": "success",
  "skill_name": "string",
  "skill_version": "string",
  "result": {}
}
```

or:

```json
{
  "status": "error",
  "skill_name": "string",
  "skill_version": "string",
  "error_code": "string",
  "error_message": "string",
  "recoverable": true
}
```

Prompt changes that alter output shape require a new Skill version.

## 3. MVP Skill List

### 3.1 JD Analysis

Purpose:
Parse raw JD text into structured job requirements.

Input:

```json
{
  "jd_raw_text": "string"
}
```

Output:

```json
{
  "jd_analysis_result": {
    "company": "string | null",
    "role": "string | null",
    "job_summary": "string",
    "required_skills": ["string"],
    "preferred_skills": ["string"],
    "responsibilities": ["string"],
    "keywords": ["string"],
    "seniority": "string | null",
    "inferred_fields": ["string"]
  }
}
```

Errors:

- `EMPTY_INPUT`
- `INVALID_JD`
- `LLM_PARSE_FAILED`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Job Matching
- Resume Optimization
- Interview Prep
- Greeting / Follow-up

### 3.2 Job Matching

Purpose:
Compare JD requirements with resume/profile evidence.

Input:

```json
{
  "jd_analysis_result": {},
  "resume_snapshot": {},
  "profile_context": {}
}
```

Output:

```json
{
  "job_matching_result": {
    "matching_score": 0,
    "is_recommended": true,
    "matched_skills": ["string"],
    "missing_skills": ["string"],
    "risk_factors": ["string"],
    "evidence": [
      {
        "requirement": "string",
        "resume_evidence": "string",
        "confidence": 0.0
      }
    ]
  }
}
```

Errors:

- `MISSING_JD_ANALYSIS`
- `MISSING_RESUME`
- `INSUFFICIENT_CONTEXT`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Resume Optimization
- Case Manager Agent
- Dashboard ranking

### 3.3 Resume Optimization

Purpose:
Generate localized, evidence-based resume patches for a target Job Case.

Input:

```json
{
  "resume_version": {},
  "jd_analysis_result": {},
  "job_matching_result": {}
}
```

Output:

```json
{
  "resume_optimization_result": {
    "analysis_confidence": 0.0,
    "optimization_summary": "string",
    "optimization_patches": [
      {
        "patch_id": "string | null",
        "module": "personal_info | education | work_experience | project_experience | skills | others",
        "target_name": "string",
        "original": "string",
        "suggestion": "string",
        "gap_addressed": "string",
        "evidence_level": "A | B | C",
        "confidence": 0.0,
        "reason": "string"
      }
    ]
  }
}
```

Errors:

- `MISSING_RESUME_VERSION`
- `MISSING_JD_ANALYSIS`
- `INVALID_RESUME_JSON`
- `LOW_CONFIDENCE`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Resume Patch Review
- Content Generation
- Resume Merge Proposal in later phase

### 3.4 Content Generation

Purpose:
Render or generate final user-facing content from structured resume or communication context.

Input:

```json
{
  "content_type": "resume | greeting | follow_up | thank_you | other",
  "resume_version": {},
  "job_case_context": {},
  "generation_constraints": {}
}
```

Output:

```json
{
  "content_generation_result": {
    "content_type": "string",
    "generated_content": "string | null",
    "resume_json": "object | null",
    "warnings": ["string"]
  }
}
```

Errors:

- `MISSING_CONTEXT`
- `UNSUPPORTED_CONTENT_TYPE`
- `GENERATION_FAILED`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Frontend preview
- Communication draft
- Resume export

### 3.5 Interview Prep

Purpose:
Generate a targeted interview preparation pack.

Input:

```json
{
  "interview_context": {
    "job_case": {},
    "jd_analysis_result": {},
    "resume_version": {},
    "story_context": [],
    "weakness_context": [],
    "user_input": "string"
  }
}
```

Output:

```json
{
  "interview_prep_result": {
    "title": "string",
    "overview_text": "string",
    "questions": [
      {
        "question_text": "string",
        "competency": "string",
        "source": "string",
        "key_points": ["string"],
        "reply_direction": "string",
        "trap": "string"
      }
    ],
    "routine_questions": ["string"]
  }
}
```

Errors:

- `MISSING_JD_ANALYSIS`
- `MISSING_RESUME_VERSION`
- `NO_RELEVANT_CONTEXT`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Interview workspace
- Interview Evaluation
- Task planning

### 3.6 Interview Evaluation

Purpose:
Evaluate interview answers or interview notes.

Input:

```json
{
  "interview_record": "string",
  "interview_prep_result": {},
  "jd_analysis_result": {},
  "resume_version": {}
}
```

Output:

```json
{
  "interview_evaluation_result": {
    "overall_score": 0,
    "evaluated_answers": [
      {
        "question_text": "string",
        "score": 0,
        "strengths": "string",
        "weaknesses": "string",
        "improvement_suggestion": "string"
      }
    ],
    "summary": "string",
    "reflection_signals": ["string"]
  }
}
```

Errors:

- `MISSING_INTERVIEW_RECORD`
- `INSUFFICIENT_ANSWER_CONTENT`
- `MISSING_PREP_CONTEXT`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Reflection
- Interview history

### 3.7 Reflection

Purpose:
Turn an interview evaluation or job-search outcome into structured learning.

Input:

```json
{
  "interview_evaluation_result": {},
  "job_case_context": {},
  "existing_learning_context": {}
}
```

Output:

```json
{
  "reflection_result": {
    "overall_summary": "string",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "action_items": ["string"],
    "memory_candidates": [
      {
        "type": "weakness | preference | story | strategy",
        "content": "string",
        "confidence": 0.0,
        "source_reason": "string"
      }
    ]
  }
}
```

Errors:

- `MISSING_EVALUATION`
- `NO_REFLECTION_SIGNAL`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Reflection record
- Memory Architecture in later phase
- Task planning

### 3.8 Greeting / Follow-up

Purpose:
Generate Boss, HR, or follow-up communication draft.

Input:

```json
{
  "communication_goal": "greeting | follow_up | thank_you | negotiation",
  "job_case_context": {},
  "resume_highlights": {},
  "tone_preference": "string | null"
}
```

Output:

```json
{
  "communication_generation_result": {
    "message": "string",
    "claims_used": ["string"],
    "warnings": ["string"]
  }
}
```

Errors:

- `MISSING_JOB_CONTEXT`
- `MISSING_RESUME_EVIDENCE`
- `UNSAFE_CLAIM`
- `SCHEMA_VALIDATION_FAILED`

Downstream consumers:

- Communication draft
- Frontend copy action

## 4. Contract Freeze Rule

After Phase 1:

- Prompt must obey Skill Contract.
- Workflow must validate Skill Contract.
- Frontend must render based on Skill Contract.
- Evaluation must test Skill Contract.
- Breaking schema changes require explicit version bump.
