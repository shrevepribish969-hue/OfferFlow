# OfferFlow Architecture Principles and ADR

Status: Frozen for Phase 1 Architecture Freeze
Scope: Architecture governance, domain boundaries, AI runtime boundaries

## 1. Purpose

This document freezes the non-negotiable architecture principles for OfferFlow Phase 1. Phase 1 does not refactor business code. It establishes the rules that all future migration work must follow.

OfferFlow is an AI Native Job Search OS. The core product unit is not chat. The core product unit is the Job Case.

## 2. Architecture Decisions

### ADR-001: Job Case is the central aggregate for job-specific lifecycle

Decision:
All job-specific information must be organized around Job Case.

Rationale:
A user may manage dozens of applications. Each application has its own JD, status, resume version, interviews, communications, tasks, reflections, and timeline. Job Case is the only stable anchor for this lifecycle.

Implication:
JD analysis, matching result, job-specific resume version, interview preparation, interview evaluation, communication records, reflection, and job-specific tasks must be attributable to a Job Case.

### ADR-002: Domain Object is more important than Workflow

Decision:
Workflow is orchestration, not storage. Long-lived business concepts must become domain objects.

Rationale:
If all results are stored in generic workflow JSON, downstream agents cannot reason reliably, versioning becomes impossible, and historical traceability disappears.

Implication:
`workflow_data` may be used only as temporary execution cache or backward-compatible transition storage. It must not become the final home of Resume Version, Interview, Communication, Reflection, Timeline, or Memory.

### ADR-003: Agent does not own data

Decision:
Agent is responsible for thinking, interpretation, planning, and recommendation. Agent cannot directly persist or mutate domain state.

Rationale:
AI decisions must be auditable, reversible, and mediated by deterministic application logic.

Implication:
Agent output must be transformed into domain commands by Workflow or Application Service before persistence.

### ADR-004: Workflow executes, Repository persists

Decision:
Workflow owns execution order and transaction boundary. Repository owns persistence.

Rationale:
This separates orchestration from storage and prevents API handlers, agents, and skills from writing data inconsistently.

Implication:
Future migration must gradually move persistence logic out of API handlers and into repositories or application services.

### ADR-005: Skill must be contract-first

Decision:
Every Skill must define fixed input, fixed output, fixed schema, fixed error codes, and version.

Rationale:
Prompt, Workflow, frontend rendering, backend validation, and evaluation must all depend on the same contract.

Implication:
Prompt changes that alter output schema are breaking changes and require a Skill Contract version update.

### ADR-006: Workflow should become event-driven over time

Decision:
User actions can trigger workflows, but state changes and domain events should gradually become the primary trigger mechanism.

Rationale:
OfferFlow should proactively move a job application forward instead of waiting for every button click.

Implication:
Phase 1 freezes Event Taxonomy. Later phases may add event persistence and event-triggered workflows.

### ADR-007: Master Resume cannot be automatically modified by AI

Decision:
AI may propose patches or merge suggestions, but cannot directly mutate the user's Master Resume.

Rationale:
Resume is a high-stakes user-owned asset.

Implication:
All changes to Master Resume require user confirmation. Job-specific Resume Versions may be generated, but must remain distinct from Master Resume.

### ADR-008: Timeline is the context skeleton for Agents

Decision:
Important lifecycle events must eventually be recorded in Timeline.

Rationale:
Agents need structured history, not raw chat logs, to understand what happened and what should happen next.

Implication:
Future workflow outputs must append timeline events. Timeline is not chat history.

### ADR-009: Communication and Interview are first-class future domain objects

Decision:
Communication and Interview must not be hidden inside chat messages or generic workflow blobs.

Rationale:
A real job search includes HR conversations, Boss greetings, follow-ups, and multiple interview rounds. These are core domain objects.

Implication:
MVP may delay full implementation, but architecture must reserve these objects explicitly.

### ADR-010: Memory Architecture is intentionally deferred

Decision:
Phase 1 does not freeze a full Memory Architecture.

Rationale:
Memory depends on the final shape of Interview, Reflection, Timeline, Communication, and Resume Version. Freezing Memory too early would create premature abstraction.

Implication:
Phase 1 may mention Memory as a future domain capability, but formal Memory schema and pipeline design are deferred until core domain objects are in place.

## 3. Phase 1 Non-goals

Phase 1 does not:

- Refactor runtime code.
- Modify database schema.
- Add APIs.
- Add frontend pages.
- Rewrite prompts.
- Implement event sourcing.
- Implement Memory Architecture.
- Move folders.

## 4. Phase 1 Acceptance Criteria

Phase 1 is complete only when the following contracts are frozen:

- Architecture Principles / ADR.
- Job Case Lifecycle.
- Event Taxonomy.
- Skill Contracts.
- Migration Roadmap.

After Phase 1, future development must follow these documents. Architecture should not continue changing implicitly while coding.
