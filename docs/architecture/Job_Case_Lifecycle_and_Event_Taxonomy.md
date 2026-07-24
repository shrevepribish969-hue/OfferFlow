# OfferFlow Job Case Lifecycle and Event Taxonomy

Status: Frozen for Phase 1 Architecture Freeze
Scope: Job Case state machine, domain events, timeline foundation

## 1. Purpose

This document freezes the Job Case lifecycle and Event Taxonomy for OfferFlow. Job Case lifecycle and domain events are the main axis of the system.

## 2. Job Case Lifecycle

Canonical lifecycle:

```text
Created
  -> JDAnalyzed
  -> Matched
  -> ResumeOptimized
  -> Applied
  -> InterviewScheduled
  -> InterviewPrepared
  -> InterviewCompleted
  -> Reflected
  -> OfferReceived | Rejected | Archived
```

The lifecycle is not only a UI status. It is the product backbone for workflow orchestration, timeline, agent context, and future automation.

## 3. State Definitions

### Created

Meaning:
A Job Case exists, but the JD may not yet be analyzed.

Entry conditions:
- User creates a Job Case.
- User pastes or uploads a JD.

Allowed workflows:
- JD Analysis.
- JD enrichment.

Primary events:
- `JobCaseCreated`
- `JDUploaded`

### JDAnalyzed

Meaning:
JD has been parsed into structured requirements.

Entry conditions:
- JD Analysis Skill succeeds.

Allowed workflows:
- Job Matching.
- Resume Optimization pre-check.
- Greeting generation if resume context exists.

Primary events:
- `JDAnalyzed`

### Matched

Meaning:
The system has compared the target JD with the user's resume/profile.

Entry conditions:
- Job Matching Skill succeeds.

Allowed workflows:
- Resume Optimization.
- Interview Prep pre-check.
- User decision to apply or skip.

Primary events:
- `JobMatched`

### ResumeOptimized

Meaning:
A job-specific resume strategy, resume version, or patch set has been generated.

Entry conditions:
- Resume Optimization Skill succeeds.
- Resume patches are produced or system decides no meaningful patch is needed.

Allowed workflows:
- Content Generation.
- Resume Patch Review.
- Apply to job.
- Generate greeting.

Primary events:
- `ResumeVersionCreated`
- `ResumeOptimized`
- `ResumePatchProposed`

### Applied

Meaning:
The user has submitted or intends to track this job application as applied.

Entry conditions:
- User marks job as applied.
- Communication or application record indicates submission.

Allowed workflows:
- Follow-up planning.
- Communication drafting.
- Interview scheduling.

Primary events:
- `Applied`
- `FollowUpScheduled`

### InterviewScheduled

Meaning:
The user has an upcoming interview round.

Entry conditions:
- User changes status to interview.
- User records interview date, round, or invitation.

Allowed workflows:
- Interview Prep.
- Task Planning.
- Reminder scheduling.

Primary events:
- `InterviewScheduled`

### InterviewPrepared

Meaning:
Interview preparation material has been generated for a specific interview round.

Entry conditions:
- Interview Prep Skill succeeds.

Allowed workflows:
- Mock Interview.
- Interview question review.
- Communication preparation.

Primary events:
- `InterviewPrepGenerated`

### InterviewCompleted

Meaning:
An interview round has happened and the user has submitted notes, answers, transcript, or feedback.

Entry conditions:
- User submits interview record.
- User marks interview as completed.

Allowed workflows:
- Interview Evaluation.
- Reflection.

Primary events:
- `InterviewCompleted`

### Reflected

Meaning:
A reflection has been created from an interview or job-search outcome.

Entry conditions:
- Reflection Skill succeeds.

Allowed workflows:
- Memory extraction in later phase.
- Next interview planning.
- Job Case archive or continuation.

Primary events:
- `ReflectionCreated`

### OfferReceived

Meaning:
The user has received an offer.

Entry conditions:
- User records offer.

Allowed workflows:
- Offer communication.
- Negotiation support.
- Archive.

Primary events:
- `OfferReceived`

### Rejected

Meaning:
The application is rejected or no longer active.

Entry conditions:
- User records rejection.
- User decides to stop tracking.

Allowed workflows:
- Reflection.
- Archive.

Primary events:
- `Rejected`

### Archived

Meaning:
The Job Case is no longer active, but history remains available.

Entry conditions:
- User archives the case.
- System archives inactive cases with user confirmation in future.

Allowed workflows:
- Read-only review.
- Historical retrieval.

Primary events:
- `Archived`

## 4. Event Taxonomy

Event rules:

- Events are facts, not commands.
- Event names use past tense.
- Events should be append-only in future implementation.
- Events must identify owner aggregate.
- Events may enter Timeline if relevant to user or agent reasoning.

## 5. Frozen MVP Events

| Event | Owner | Trigger | Timeline | Notes |
|---|---|---|---|---|
| `JobCaseCreated` | JobCase | User creates case | Yes | Start of lifecycle |
| `JDUploaded` | JobCase | User uploads/pastes JD | Yes | Raw JD is attached to Job Case |
| `JDAnalyzed` | JobCase | JD Analysis succeeds | Yes | Structured JD available |
| `JobMatched` | JobCase | Job Matching succeeds | Yes | Match score and gaps available |
| `ResumeVersionCreated` | ResumeVersion | Job-specific resume branch created | Yes | Future first-class object |
| `ResumeOptimized` | ResumeVersion | Optimization succeeds | Yes | Patch set or optimized draft available |
| `ResumePatchProposed` | ResumePatch | AI proposes patch | Optional | May be many events |
| `ResumePatchAccepted` | ResumePatch | User accepts patch | Yes | User confirmed change |
| `ResumeMerged` | Resume | User merges back to master | Yes | High-stakes event |
| `Applied` | JobCase | User marks applied | Yes | Starts post-application tracking |
| `InterviewScheduled` | Interview | User records interview | Yes | Triggers prep workflow later |
| `InterviewPrepGenerated` | Interview | Prep succeeds | Yes | Prep pack available |
| `InterviewCompleted` | Interview | User records completion | Yes | Enables evaluation/reflection |
| `InterviewEvaluated` | Interview | Evaluation succeeds | Yes | Evaluation available |
| `ReflectionCreated` | Reflection | Reflection succeeds | Yes | Learning artifact created |
| `CommunicationDrafted` | Communication | Draft generated | Optional | Draft may not be sent |
| `CommunicationSent` | Communication | User records sent message | Yes | External interaction |
| `FollowUpScheduled` | Task | Follow-up task created | Yes | Automation ready |
| `OfferReceived` | JobCase | User records offer | Yes | Outcome event |
| `Rejected` | JobCase | User records rejection | Yes | Outcome event |
| `Archived` | JobCase | User archives case | Yes | Lifecycle closure |

## 6. Event Payload Guidelines

Minimum payload fields:

```json
{
  "event_id": "string",
  "event_type": "string",
  "owner_type": "JobCase | ResumeVersion | Interview | Communication | Reflection | Task",
  "owner_id": "string",
  "job_case_id": "string",
  "user_id": "string",
  "occurred_at": "datetime",
  "triggered_by": "user | workflow | system | agent",
  "workflow_run_id": "string | null",
  "skill_run_id": "string | null",
  "payload": {}
}
```

## 7. Acceptance Criteria

This document is frozen when:

- Job Case states are accepted as canonical.
- Event names are accepted as canonical.
- Later migrations must map existing actions to these events.
- No implementation is required in Phase 1.
