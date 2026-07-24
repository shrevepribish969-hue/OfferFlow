import fitz  # PyMuPDF
import json
import os
import sys
from openai import OpenAI
from dotenv import load_dotenv

# Ensure stdout uses UTF-8
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'runtime', '.env'))
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

def extract_text(pdf_path, max_pages=30):
    text = ""
    try:
        doc = fitz.open(pdf_path)
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            text += f"--- Page {i+1} ---\n"
            text += page.get_text() + "\n\n"
        doc.close()
    except Exception as e:
        print(f"Failed to open PDF: {e}")
    return text

def analyze_structure(text):
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    system_prompt = """
You are a data extraction expert. 
Your task is to analyze the structure of a PDF containing interview questions (面经). 
Based on the text from the first 30 pages, identify the common structural patterns for how the following are represented:
1. Company Name (e.g. "腾讯", "字节跳动")
2. Role Name (e.g. "产品经理", "运营")
3. Category (if any, e.g. "项目深挖", "基础知识")
4. Question (how individual questions are numbered or formatted)

Output ONLY valid JSON strictly matching this format (no markdown code blocks, just raw JSON):
{
  "document_structure": {
    "company_pattern": "string explaining how company names appear",
    "role_pattern": "string explaining how roles appear",
    "category_pattern": "string explaining category patterns if present, or 'Not consistently found'",
    "question_pattern": "string explaining how questions are formatted"
  },
  "has_interview_round_info": boolean,
  "has_evaluation_points_info": boolean,
  "sample_extraction": {
      "company": "...",
      "role": "...",
      "round": "...",
      "question": "..."
  }
}
"""
    print("Calling LLM to analyze structure...")
    try:
        # We might need to truncate the text to avoid token limits
        max_chars = 30000 
        truncated_text = text[:max_chars]
        
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": truncated_text}
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
    pdf_path = r"d:\A研二\A秋招2\【校招】大厂产_运面经真题汇总（持续更新.pdf"
    if not os.path.exists(pdf_path):
        print("PDF file not found.")
        sys.exit(1)
        
    print("Extracting first 30 pages...")
    text = extract_text(pdf_path, max_pages=30)
    
    result = analyze_structure(text)
    if result:
        print(json.dumps(result, ensure_ascii=False, indent=2))
