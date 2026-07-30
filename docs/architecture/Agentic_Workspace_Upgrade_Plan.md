# OfferFlow Agentic Workspace Upgrade Plan

## 1. One-Sentence Positioning

OfferFlow should evolve from an AI workflow tool into an Agentic job-search workspace.

In plain language:

> OfferFlow is not only a tool that generates resume or interview content. It is a workspace where an AI case manager observes the current job application, recommends the next best action, coordinates specialist AI skills, and learns from user feedback.

## 2. Current Product State

The current product already has a strong foundation:

- Job Case lifecycle management
- ResumeVersion management
- Interview round management
- Reflection and Memory concepts
- Agent routing design
- JD analysis, job matching, resume optimization, interview preparation, interview evaluation, and greeting generation
- Leads Pool and Chrome extension for job opportunity collection
- Three-column workspace:
  - Left: workflow stages
  - Center: structured AI result cards
  - Right: AI Copilot conversation

This is stronger than a normal CRUD tool because the product is organized around the full job-search journey, not isolated content generation.

## 3. Why It Still Feels Like Workflow

The current experience is closer to an Agentic Workflow than a mature Agent product.

Current pattern:

1. User enters a Job Case.
2. User selects a stage.
3. User clicks or triggers a workflow.
4. AI generates a result.
5. The result appears as a card.

This is useful and structured, but the AI is still mostly waiting for the user to decide what to do next.

A more Agentic pattern would be:

1. The AI observes the Job Case state.
2. The AI identifies missing context, risks, and next actions.
3. The AI explains why a step should happen next.
4. The user confirms.
5. The AI executes the right skill or workflow.
6. The result is saved as a card, event, memory, or feedback signal.

The key difference:

> Workflow means the system follows predefined steps. Agent means the system can judge the next step based on the current state.

## 4. Target Product Shape

Keep the current three-column layout. It is the right product direction.

The three columns can be redefined as:

- Left column: the Agent's task map
- Center column: the Agent's work output
- Right column: the Agent's reasoning, recommendation, and confirmation area

This turns the UI from "workflow navigation plus chat" into "Agent-driven workspace".

## 5. Agent Roles

### 5.1 Case Manager Agent

This should be the main user-facing Agent.

Responsibilities:

- Observe the current Job Case status
- Identify what is missing
- Recommend the next best action
- Explain the recommendation
- Ask for user confirmation
- Route the task to specialist skills or agents

Example:

> I checked this Job Case. The JD has been analyzed, but there is no job matching result yet. I suggest running job matching before resume optimization, because the resume strategy should be based on concrete gaps and evidence.

### 5.2 Resume Agent

Responsibilities:

- Analyze resume evidence
- Propose resume patches
- Explain why each patch helps
- Avoid unsupported or fabricated claims
- Track which suggestions are accepted or rejected

### 5.3 Interview Agent

Responsibilities:

- Generate interview preparation packs
- Retrieve relevant real interview questions
- Match questions with user stories
- Evaluate interview answers
- Identify recurring weaknesses

### 5.4 Reflection Agent

Responsibilities:

- Turn interview results into structured reflection
- Extract memory candidates
- Ask the user to confirm important long-term memories
- Prevent memory pollution

### 5.5 Communication Agent

Responsibilities:

- Generate greeting, follow-up, thank-you, and negotiation drafts
- Use only supported resume evidence
- Adapt to user tone preference
- Avoid unsafe claims

## 6. P0 Upgrade: Next Best Action

This is the most important Agent upgrade.

The system should show a "Current Diagnosis" or "Next Best Action" in the right Copilot area.

Example states:

- No JD analysis yet:
  - Recommendation: Analyze JD first.
  - Reason: Matching and resume optimization need structured JD requirements.

- JD analyzed but no matching result:
  - Recommendation: Run job matching.
  - Reason: The system needs to know skill gaps before rewriting the resume.

- Resume optimized but not applied:
  - Recommendation: Review and accept resume patches.
  - Reason: AI should not directly finalize career-impacting content without user confirmation.

- Interview evaluation completed:
  - Recommendation: Create reflection and memory candidates.
  - Reason: Interview feedback should become reusable long-term learning.

This one feature makes OfferFlow feel much more like an Agent product because the AI begins to observe and recommend, instead of only responding.

## 7. P0 Upgrade: User Feedback Loop

Every important AI output should support lightweight feedback.

For resume patches:

- Accept
- Reject
- Inaccurate
- Too generic
- Fabrication risk

For interview questions:

- Helpful
- Not relevant
- Too easy
- Too hard
- Needs follow-up

For generated communication:

- Good to send
- Too formal
- Too casual
- Unsupported claim
- Rewrite

Product value:

> OfferFlow can learn from what the user accepts, rejects, and corrects. This turns one-time generation into a continuous optimization loop.

## 8. P0 Upgrade: AI Work Records

The product should record what the AI did.

Each AI run should ideally include:

- Skill or Agent name
- Prompt version
- Model name
- Input summary
- Output summary
- Status
- Error if any
- Latency
- User feedback
- Related Job Case

This is important because AI products need traceability.

Interview explanation:

> I added AI work records so that each AI output can be traced, evaluated, and improved. This supports badcase analysis, prompt iteration, and product quality measurement.

## 9. P1 Upgrade: RAG Interview Preparation

OfferFlow already has a knowledge base and retrieval prototype. The next step is to make it product-visible and evaluable.

Target flow:

1. Analyze JD requirements.
2. Build a query from company, role, skills, and responsibilities.
3. Retrieve real interview questions from the knowledge base.
4. Rerank by company relevance, role relevance, competency match, and difficulty.
5. Generate preparation advice based on retrieved questions and user stories.
6. Show question sources to the user.

Product value:

> Interview preparation becomes grounded in real interview data, instead of looking like pure model imagination.

## 10. P1 Upgrade: Confirmable Memory

Memory should not be written silently.

Better flow:

1. Reflection Agent finds a memory candidate.
2. System shows it to the user.
3. User confirms, edits, or rejects it.
4. Only confirmed or high-confidence memory is used for future generation.

Example:

> I noticed a recurring weakness: when answering data metric questions, your answers often lack business outcome framing. Should I save this as a long-term interview preparation focus?

Product value:

> This avoids memory pollution and gives the user control over what the AI remembers.

## 11. P2 Upgrade: Badcase Lab

Badcase Lab is a showcase feature for AI product thinking.

It can show:

- Which AI output was bad
- Why the user marked it bad
- Badcase category
  - hallucination
  - irrelevant
  - too generic
  - wrong format
  - weak reasoning
- Original input
- Original output
- Improved prompt or rule
- New output
- Quality comparison

Interview value:

> This demonstrates that the project has an AI quality improvement loop, not only feature demos.

## 12. P2 Upgrade: Strategy Dashboard

The dashboard can show:

- Which jobs are worth applying to
- Which jobs have high risk
- Which jobs need follow-up
- Which interviews need preparation
- User's recurring weaknesses
- Recommended next actions across all Job Cases

Product value:

> OfferFlow becomes a job-search strategy system, not only a task execution tool.

## 13. Safe Implementation Strategy

To protect the current working version, upgrades should be done in this order:

1. Create a new branch from the stable version.
2. Add documentation first.
3. Add new data structures as sidecar records.
4. Do not replace existing workflows at first.
5. Add feature flags for Agent recommendations.
6. Let the user manually confirm Agent actions.
7. Only after validation, connect Agent recommendations into the main workflow.

Rule:

> New Agent features should observe and recommend first. They should not take over the existing workflow immediately.

## 14. Interview Narrative

A strong explanation:

> I initially designed OfferFlow as an AI Copilot chat experience. But during product iteration, I realized job search is not a one-turn conversation. It is a long-cycle, multi-stage, high-context workflow. So I redesigned it into a three-column workspace: lifecycle navigation on the left, structured AI outputs in the center, and Copilot interaction on the right.
>
> The current version is an Agentic Workflow system. It already has Job Case context, specialist AI skills, Agent routing, memory, and evaluation assets. The next step is to upgrade the Copilot into a Case Manager Agent that observes Job Case state, recommends the next best action, coordinates specialist agents, and learns from user feedback.

Short version:

> OfferFlow is evolving from a workflow-driven AI tool into an Agentic Workspace for job search.

## 15. Recommended Next Step

The best next product iteration is:

1. Add Next Best Action recommendations.
2. Add user feedback on AI outputs.
3. Add AI work records.

These three changes create the core Agent loop:

> observe state -> recommend action -> execute skill -> collect feedback -> improve future decisions

