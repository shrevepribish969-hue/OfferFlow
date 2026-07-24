# OfferFlow Evaluation Policy

This document defines the definitive evaluation standards for all AI Skills within the OfferFlow system. It resolves the "contract fracture" between Prompts (Laws), Golden Datasets (Standards), and the Evaluator (Judge).

## 1. Core Philosophy
> **"Golden comes from Prompt, not from human preference."**
- The Golden Dataset must strictly evaluate what the Prompt commands the model to do.
- If the model's output contradicts human intuition but perfectly follows the Prompt, the Prompt must be updated, not the Evaluator.

## 2. Universal Schema Extension for Analysis Skills
All Analysis-type skills (e.g., Resume Analysis, JD Analysis) must adopt the **[Global Confidence + Inferred Fields]** design pattern in their Output Schema:

```json
{
  "skill_name_result": {
    "...": "...",
    "analysis_confidence": 0.86,
    "inferred_fields": ["role", "industry"]
  }
}
```
- `analysis_confidence` (Float 0.0-1.0): Represents the overall quality/structure of the input data (e.g., 0.95 for standard text, 0.3 for pure OCR garbage). Determines downstream workflow routing.
- `inferred_fields` (Array of Strings): Lists the JSON keys whose values were not explicitly stated in the text but were deduced by the model based on Prompt instructions.

## 3. Match Strategies

To prevent rigid evaluations from penalizing intelligent extractions, the Evaluator supports four Matching Strategies:

### A. Exact Match (Strict)
- **Usage**: Error Codes, Status, Enums, Numbers.
- **Rule**: `Actual == Expected`. Any deviation is a failure.
- **Example**: `error_code` MUST be exactly `INVALID_JD_TEXT`.

### B. Contains Match (Flexible Exact)
- **Usage**: Names, Companies, Titles.
- **Rule**: `Actual in Expected` OR `Expected in Actual`.
- **Example**: Expected "腾讯", Actual "腾讯科技" -> Pass.

### C. Semantic Recall (Keyword Overlap)
- **Usage**: Skills Arrays, Project Responsibilities.
- **Rule**: Golden dataset provides a flattened list of expected keywords. Evaluator checks if these keywords exist anywhere in the stringified Actual JSON.
- **Example**: Golden `["Python", "Prompt"]`. Actual `[{"name": "Python", "type": "tool"}, {"name": "Prompt Engineering"}]` -> 100% Score.

### D. Multiple Choice (Multi-Correct)
- **Usage**: Ambiguous classifications (e.g., is Python a 'tool' or 'hard_skill'?).
- **Rule**: If Expected is an Array for a single field, Actual is correct if it matches any item in the Array.
- **Example**: Expected `["tool", "hard_skill"]`, Actual `"tool"` -> Pass.

### E. Hallucination Check (LLM-as-a-Judge) - [Planned]
- **Usage**: Generative Outputs (Resume Optimization, Content Generation).
- **Rule**: A separate Judge LLM compares the source text and the generated text.
- **Scoring**:
  - `100`: No new facts added. Only formatting, summarization, or semantic alignment.
  - `80`: Minor reasonable inferences (e.g. changing "看报表" to "分析业务报表").
  - `0`: Fatal hallucination (added new projects, skills, companies, or quantitative metrics).
