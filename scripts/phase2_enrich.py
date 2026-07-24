import json
import os
import sys
import time
from openai import OpenAI
from dotenv import load_dotenv

# Ensure stdout uses UTF-8
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'runtime', '.env'))
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

def enrich_question_batch(questions_batch):
    """Uses LLM to enrich a batch of raw questions."""
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    system_prompt = """
You are an expert Interview Strategy Coach. Your task is to enrich a list of historical interview questions.
For each input question, provide the following enrichment data:
1. `intent`: The real underlying intent the interviewer has (why are they asking this?).
2. `intent_source`: Since you are inferring this, output "llm_inference".
3. `confidence`: A float from 0.0 to 1.0 indicating your confidence in the intent and framework.
4. `evaluation_points`: A list of 2-3 specific scoring criteria (e.g. ["Did they use STAR method", "Do they understand Redis clustering"]).
5. `follow_up_questions`: A list of 1-3 likely follow-up questions.
6. `answer_framework`: A list of 3-5 structural steps for a perfect answer (e.g. ["Background", "Problem", "Solution", "Results"]).
7. `question_type`: Categorize the question exactly into ONE of these: ["Technical", "Behavioral", "Project", "Business", "Open"].
8. `priority`: "High", "Medium", or "Low" based on how frequently you think this is asked in big tech companies.

Output ONLY valid JSON in this format:
{
  "enriched_questions": [
    {
      "original_index": number (must match the input index),
      "intent": "string",
      "intent_source": "llm_inference",
      "confidence": float,
      "evaluation_points": ["string", "string"],
      "follow_up_questions": ["string"],
      "answer_framework": ["string", "string"],
      "question_type": "string",
      "priority": "string"
    }
  ]
}
"""
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(questions_batch, ensure_ascii=False, indent=2)}
            ],
            temperature=0.1
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content.strip())
    except Exception as e:
        print(f"Error calling LLM: {e}")
        return None

if __name__ == "__main__":
    input_path = r"d:\A研二\A秋招2\knowledge_base\raw_questions.json"
    output_path = r"d:\A研二\A秋招2\knowledge_base\enriched_questions.json"
    
    if not os.path.exists(input_path):
        print("Raw questions JSON not found. Run phase 1 first.")
        sys.exit(1)
        
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    raw_questions = data.get("questions", [])
    print(f"Starting Phase 2: Enrichment for {len(raw_questions)} questions...")
    
    enriched = []
    
    # Process in batches of 5 to avoid context limit and timeouts
    batch_size = 5
    for i in range(0, len(raw_questions), batch_size):
        batch = raw_questions[i:i+batch_size]
        batch_with_idx = [{"original_index": i + j, **q} for j, q in enumerate(batch)]
        
        print(f"Enriching batch {i//batch_size + 1} / {len(raw_questions)//batch_size + 1}...")
        
        result = enrich_question_batch(batch_with_idx)
        if result and "enriched_questions" in result:
            enrichments = result["enriched_questions"]
            
            for j, q in enumerate(batch):
                idx = i + j
                # Find matching enrichment by original_index
                match = next((e for e in enrichments if e.get("original_index") == idx), None)
                if match:
                    # Merge
                    merged = {**q}
                    merged["intent"] = match.get("intent", "")
                    merged["intent_source"] = match.get("intent_source", "llm_inference")
                    merged["confidence"] = match.get("confidence", 0.8)
                    merged["evaluation_points"] = match.get("evaluation_points", [])
                    merged["follow_up_questions"] = match.get("follow_up_questions", [])
                    merged["answer_framework"] = match.get("answer_framework", [])
                    merged["question_type"] = match.get("question_type", "Open")
                    merged["priority"] = match.get("priority", "Medium")
                    enriched.append(merged)
                else:
                    print(f"Failed to match enrichment for index {idx}")
                    
        time.sleep(1.5) # Rate limit protection
        
    print(f"\nEnrichment complete. Total enriched: {len(enriched)}")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({"questions": enriched}, f, ensure_ascii=False, indent=2)
        
    print(f"Saved to {output_path}")
