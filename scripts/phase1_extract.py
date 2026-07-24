import fitz  # PyMuPDF
import json
import os
import sys
import time
from openai import OpenAI
from dotenv import load_dotenv

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'runtime', '.env'))
API_KEY = os.getenv("API_KEY") or os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("BASE_URL", "https://open.bigmodel.cn/api/paas/v4/")
MODEL_NAME = os.getenv("MODEL_NAME", "glm-4-flash")

def chunk_pdf(pdf_path, chunk_size=3):
    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        for i in range(0, total_pages, chunk_size):
            text = ""
            for j in range(i, min(i + chunk_size, total_pages)):
                page = doc[j]
                text += f"--- Page {j+1} ---\n"
                text += page.get_text() + "\n\n"
            yield i, min(i + chunk_size, total_pages), text
        doc.close()
    except Exception as e:
        print(f"Failed to open PDF: {e}")

def extract_raw_questions(text, previous_context):
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    system_prompt = f"""
You are an expert data extractor. Your task is to extract interview questions EXACTLY as they appear in the provided text.
DO NOT infer or invent any information. DO NOT guess the intent or answer framework.

Context from previous pages (Use this to inherit Company/Role if the current page continues the same section, but do not output questions from here):
{json.dumps(previous_context, ensure_ascii=False)}

Rules:
1. Extract every single interview question you find in the provided text.
2. Include the EXACT raw_text of the section/paragraph where the question appeared, and the Page number it appeared on.
3. If "category" is explicitly mentioned (e.g. "项目深挖"), include it.
4. "source.document" must always be "【校招】大厂产_运面经真题汇总（持续更新.pdf".

Output MUST strictly match this JSON format:
{{
  "current_context": {{
    "company": "string",
    "role": "string",
    "category": "string"
  }},
  "questions": [
    {{
      "company": "string or null",
      "role": "string or null",
      "category": "string or null",
      "question": "string (the exact question text)",
      "raw_text": "string (the original context paragraph from the PDF)",
      "source": {{
        "document": "【校招】大厂产_运面经真题汇总（持续更新.pdf",
        "page": number
      }}
    }}
  ]
}}
"""
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            temperature=0.0
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
    if not API_KEY:
        print("❌ Error: API Key not found. Please set API_KEY in runtime/.env")
        sys.exit(1)
        
    pdf_path = r"d:\A研二\A秋招2\【校招】大厂产_运面经真题汇总（持续更新.pdf"
    output_path = r"d:\A研二\A秋招2\knowledge_base\phase1_raw_questions.json"
    
    if not os.path.exists(pdf_path):
        print("PDF file not found.")
        sys.exit(1)
        
    print("🚀 Starting Phase 1: Full PDF Raw Extraction Pipeline...")
    
    all_questions = []
    current_context = {"company": None, "role": None, "category": None}
    
    # Process ALL pages (chunk_size=5)
    for start_idx, end_idx, text in chunk_pdf(pdf_path, chunk_size=5):
        print(f"Processing pages {start_idx+1} to {end_idx}...")
        result = extract_raw_questions(text, current_context)
        
        if result:
            questions = result.get("questions", [])
            all_questions.extend(questions)
            print(f"  -> Extracted {len(questions)} questions.")
            
            new_ctx = result.get("current_context", {})
            if new_ctx.get("company"): current_context["company"] = new_ctx["company"]
            if new_ctx.get("role"): current_context["role"] = new_ctx["role"]
            if new_ctx.get("category"): current_context["category"] = new_ctx["category"]
            
            # Incremental save
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({"questions": all_questions}, f, ensure_ascii=False, indent=2)
        
        time.sleep(1)
        
    print(f"\n✅ Extraction complete. Total questions: {len(all_questions)}")
    print(f"💾 Saved to {output_path}")
