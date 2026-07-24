# OfferFlow Architecture Migration Roadmap

Status: Frozen for Phase 1 Architecture Freeze
Scope: Migration order, boundaries, acceptance criteria

## 1. Purpose

This roadmap defines how OfferFlow should evolve from current architecture to the target architecture without a risky big-bang rewrite.

Phase 1 is Architecture Freeze only. It does not change runtime behavior.

## 2. Migration Principles

- Every phase must be independently shippable.
- Every phase must keep the product runnable.
- No phase should require changing hundreds of files at once.
- Architecture contracts must be frozen before implementation migration.
- Domain objects should be extracted before workflows are rewritten.
- Memory Architecture is deferred until Interview, Reflection, and Timeline are better established.

## 3. Phase 1: Architecture Freeze

Goal:
Freeze architecture contracts.

Deliverables:

- Architecture Principles / ADR.
- Job Case Lifecycle and Event Taxonomy.
- Skill Contracts.
- Migration Roadmap.

Explicit non-goals:

- No code refactor.
- No database migration.
- No new API.
- No frontend change.
- No prompt rewrite.
- No Memory Architecture freeze.

Acceptance criteria:

- Future development must follow these documents.
- Job Case lifecycle is accepted as the system axis.
- Event names are accepted as canonical.
- Skill input/output/error contracts are accepted as canonical.
- Migration order and phase boundaries are accepted.

## 4. Phase 2: Contract Alignment Without Domain Refactor

Goal:
Make existing implementation obey frozen contracts as much as possible while minimizing structural changes.

Likely work:

- Align prompt outputs with Skill Contracts.
- Add validation around existing SkillExecutor outputs.
- Normalize workflow names and error codes.
- Keep `workflow_data` compatibility.

Non-goals:

- Do not introduce full repository layer yet.
- Do not split Agent architecture yet.
- Do not implement Timeline persistence yet.

Acceptance criteria:

- Existing workflows return contract-compatible shapes.
- Evaluation cases validate frozen Skill Contracts.
- Frontend assumptions match Skill output schemas.

## 5. Phase 3: Timeline and Event Recording

Goal:
Start recording lifecycle facts without making the system fully event-driven.

Likely work:

- Add event/timeline persistence.
- Append events after existing workflow success.
- Map current actions to frozen Event Taxonomy.

Non-goals:

- Do not rewrite workflows to be event-driven yet.
- Do not remove existing status fields.

Acceptance criteria:

- Important lifecycle actions produce timeline events.
- Agents can read timeline as structured context later.
- Existing UI behavior remains stable.

## 6. Phase 4: First-class Resume Version

Goal:
Extract Resume Version from generic workflow storage.

Likely work:

- Introduce Master Resume vs Job Case Resume Version distinction.
- Store resume patches as reviewable objects.
- Keep backward compatibility with existing resume JSON.

Non-goals:

- Do not implement full resume merge intelligence yet.
- Do not build complex resume diff UI unless required.

Acceptance criteria:

- Job Case can reference a current Resume Version.
- Resume patches are traceable.
- Master Resume is not modified automatically.

## 7. Phase 5: First-class Interview and Reflection

Goal:
Extract Interview and Reflection as domain objects.

Likely work:

- Model interview rounds.
- Attach prep pack, evaluation, and notes to Interview.
- Store Reflection separately from workflow cache.

Non-goals:

- Do not design full Memory Architecture yet.
- Do not add advanced multi-round automation beyond necessary lifecycle.

Acceptance criteria:

- A Job Case can have multiple interviews.
- Each interview can have prep, evaluation, and reflection.
- Reflection becomes the future input to Memory design.

## 8. Phase 6: Application Services and Repositories

Goal:
Move persistence and orchestration out of API handlers gradually.

Likely work:

- Add application services around Job Case workflows.
- Add repository layer for Job Case, Resume Version, Interview, Reflection, Timeline.
- Move one workflow at a time.

Non-goals:

- Do not restructure the entire folder tree in one step.
- Do not rewrite all workflows at once.

Acceptance criteria:

- API layer becomes thinner.
- Workflow and persistence boundaries become explicit.
- Existing behavior remains stable.

## 9. Phase 7: Memory Architecture

Goal:
Design and implement Memory after core domain objects exist.

Prerequisites:

- Timeline exists.
- Interview exists.
- Reflection exists.
- Resume Version exists.
- Communication direction is clear enough.

Likely work:

- Define Memory item schema.
- Define Memory source links.
- Define confidence, scope, confirmation, and generation policy.
- Add Memory extraction from Reflection.

Acceptance criteria:

- Memory has source and confidence.
- Memory can be retrieved by task scope.
- Memory is not raw chat history.
- Memory updates are auditable.

## 10. Phase 8: Multi-Agent Separation

Goal:
Split the current central Agent Brain into specialized agents.

Likely work:

- Case Manager Agent.
- Resume Agent.
- Interview Agent.
- Reflection Agent.
- Communication Agent.
- Memory Agent.

Non-goals:

- Do not make agents autonomous writers.
- Do not allow agents to bypass workflow.

Acceptance criteria:

- Each Agent has explicit read scope, write restrictions, and handoff rules.
- Workflow remains the executor.
- Agent outputs are commands or recommendations, not direct persistence.

## 11. Phase 9: Event-driven Workflow

Goal:
Use state changes and events to trigger downstream workflows.

Likely work:

- `JDAnalyzed` triggers Job Matching.
- `InterviewScheduled` triggers Interview Prep.
- `InterviewCompleted` triggers Interview Evaluation.
- `ReflectionCreated` triggers Memory extraction.
- `Applied` triggers Follow-up scheduling.

Acceptance criteria:

- Buttons remain available for explicit control.
- Important next steps can happen from events.
- Timeline becomes the durable execution history.

## 12. Phase Boundary Summary

Current:
FastAPI-centered implementation with Job Case and Skill concepts.

Target:
Job Case centered domain architecture with stable Skill Contracts, Timeline, first-class domain objects, and later Memory/Multi-Agent workflows.

Migration:
Freeze contracts first, align existing outputs second, extract domain objects third, then introduce Memory and multi-agent collaboration.
