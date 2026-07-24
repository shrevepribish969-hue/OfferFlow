import json
import os
import sys
import time
import concurrent.futures
import threading
from openai import OpenAI
from dotenv import load_dotenv

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'runtime', '.env'))
API_KEY = os.getenv("API_KEY") or os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("BASE_URL", "https://open.bigmodel.cn/api/paas/v4/")
MODEL_NAME = os.getenv("MODEL_NAME", "glm-4-flash")

def enrich_question_batch(questions_batch):
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    system_prompt = """
You are an expert Interview Strategy Coach. Your task is to enrich a list of deduplicated interview questions.
For each input question, provide the following enrichment data:
1. `intent`: The real underlying intent the interviewer has (why are they asking this?).
2. `competency`: The core skill being tested (e.g., "Product Design", "Data Analysis", "Communication").
3. `evaluation_points`: A list of 2-3 specific scoring criteria.
4. `follow_up_questions`: A list of 1-3 likely follow-up questions.
5. `framework_type`: The structural model best suited for this answer (e.g., "STAR", "SCQA", "Timeline").
6. `recommended_answer_framework`: A list of 3-5 structural steps for a generic perfect answer (to be customized later).
7. `question_type`: Categorize exactly into ONE of: ["Technical", "Behavioral", "Project", "Business", "Open"].
8. `difficulty`: Rate as "easy", "medium", or "hard".

CRITICAL INSTRUCTION: You MUST output all values (intent, evaluation_points, follow_up_questions, recommended_answer_framework, competency) in Simplified Chinese (简体中文). Only the keys and the enums (question_type, difficulty, framework_type) should remain in English.

Output ONLY valid JSON in this format:
{
  "enriched_questions": [
    {
      "question_hash": "string (must match the input question_hash)",
      "intent": "string",
      "competency": "string",
      "evaluation_points": ["string", "string"],
      "follow_up_questions": ["string"],
      "framework_type": "string",
      "recommended_answer_framework": ["string", "string"],
      "question_type": "string",
      "difficulty": "string"
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

def run_enrichment():
    if not API_KEY:
        print("❌ Error: API Key not found. Please set API_KEY in runtime/.env")
        sys.exit(1)

    input_path = r"d:\A研二\A秋招2\knowledge_base\phase2_deduped_questions.json"
    output_path = r"d:\A研二\A秋招2\knowledge_base\final_enriched_kb.json"
    
    if not os.path.exists(input_path):
        print(f"Deduped questions JSON not found at {input_path}")
        sys.exit(1)
        
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    deduped_questions = data.get("questions", [])
    print(f"🚀 Starting Phase 3: Enrichment Pipeline for {len(deduped_questions)} unique questions...")
    
    enriched_kb = []
    
    # Load existing to support incremental updates
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
            enriched_kb = existing_data.get("questions", [])
            print(f"Found {len(enriched_kb)} existing enriched questions. Will skip them.")
            
    existing_hashes = {q["question_hash"] for q in enriched_kb}
    
    questions_to_enrich = [q for q in deduped_questions if q["question_hash"] not in existing_hashes]
    print(f"Need to enrich {len(questions_to_enrich)} new questions.")
    
    batch_size = 5
    
    # Create batches
    batches = []
    for i in range(0, len(questions_to_enrich), batch_size):
        batches.append(questions_to_enrich[i:i+batch_size])
        
    print(f"Divided into {len(batches)} batches. Starting concurrent processing...")
    
    file_lock = threading.Lock()
    
    def process_batch(batch_idx, batch):
        payload = [{"question_hash": q["question_hash"], "question": q["question"]} for q in batch]
        print(f"Enriching batch {batch_idx+1} / {len(batches)}...")
        
        result = enrich_question_batch(payload)
        
        if result and "enriched_questions" in result:
            enrichments = result["enriched_questions"]
            
            with file_lock:
                for q in batch:
                    match = next((e for e in enrichments if e.get("question_hash") == q["question_hash"]), None)
                    if match:
                        merged = {**q}
                        merged["intent"] = match.get("intent", "")
                        merged["competency"] = match.get("competency", "")
                        merged["evaluation_points"] = match.get("evaluation_points", [])
                        merged["follow_up_questions"] = match.get("follow_up_questions", [])
                        merged["framework_type"] = match.get("framework_type", "")
                        merged["recommended_answer_framework"] = match.get("recommended_answer_framework", [])
                        merged["question_type"] = match.get("question_type", "Open")
                        merged["difficulty"] = match.get("difficulty", "medium")
                        enriched_kb.append(merged)
                    else:
                        print(f"Failed to match enrichment for hash {q['question_hash']}")
                        
                # Incremental save
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump({"questions": enriched_kb}, f, ensure_ascii=False, indent=2)

    # Run in parallel with max 5 workers
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = []
        for idx, batch in enumerate(batches):
            futures.append(executor.submit(process_batch, idx, batch))
            
        for future in concurrent.futures.as_completed(futures):
            future.result()  # raise exceptions if any
        
    print(f"\n✅ Enrichment Pipeline complete. Total questions in KB: {len(enriched_kb)}")
    print(f"💾 Saved Final KB to {output_path}")

if __name__ == "__main__":
    run_enrichment()
