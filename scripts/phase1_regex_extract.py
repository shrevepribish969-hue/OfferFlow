import fitz
import re
import json
import os
import sys

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def parse_pdf_regex(pdf_path, output_path):
    print("🚀 Starting Phase 1 Regex Extraction...")
    if not os.path.exists(pdf_path):
        print(f"Error: {pdf_path} not found.")
        return

    doc = fitz.open(pdf_path)
    all_questions = []
    
    current_company = "General Company"
    current_role = "General Role"
    current_category = "General"
    
    # Heuristic Regex Patterns
    category_pattern = re.compile(r'^[一二三四五六七八九十]+、\s*(.*?)$')
    question_pattern = re.compile(r'^(\d+)[\.、]\s*(.*?)$')
    
    company_keywords = ["字节", "腾讯", "阿里", "美团", "快手", "京东", "百度", "小红书", "滴滴", "拼多多", "网易", "游戏", "大厂"]
    role_keywords = ["产品", "运营", "经理", "策略", "数据", "商业化", "研发", "前端", "后端", "增长", "策划", "方向"]
    
    # Temporary buffer to hold raw_text context
    raw_buffer = []
    
    pending_question_num = None
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        text_dict = page.get_text("dict")
        
        for block in text_dict.get("blocks", []):
            if "lines" not in block:
                continue
                
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not text:
                        continue
                        
                    raw_buffer.append(text)
                    if len(raw_buffer) > 3:
                        raw_buffer.pop(0)
                        
                    # Check for category
                    cat_match = category_pattern.match(text)
                    if cat_match:
                        current_category = cat_match.group(1).strip()
                        pending_question_num = None
                        continue
                        
                    # If we had a question number but no text on the same line, this line is the text
                    if pending_question_num is not None:
                        # Sometimes it's a false alarm or category, but usually it's the question text
                        if not category_pattern.match(text) and not question_pattern.match(text):
                            q_data = {
                                "company": current_company,
                                "role": current_role,
                                "category": current_category,
                                "question": text,
                                "raw_text": " \n".join(raw_buffer),
                                "source": {
                                    "document": "【校招】大厂产_运面经真题汇总（持续更新.pdf",
                                    "page": page_num + 1
                                }
                            }
                            all_questions.append(q_data)
                            pending_question_num = None
                            continue
                            
                    # Check for question
                    q_match = question_pattern.match(text)
                    if q_match:
                        question_text = q_match.group(2).strip()
                        if not question_text:
                            # Text is on the next line
                            pending_question_num = q_match.group(1)
                            continue
                        else:
                            # Text is on the same line
                            q_data = {
                                "company": current_company,
                                "role": current_role,
                                "category": current_category,
                                "question": question_text,
                                "raw_text": " \n".join(raw_buffer),
                                "source": {
                                    "document": "【校招】大厂产_运面经真题汇总（持续更新.pdf",
                                    "page": page_num + 1
                                }
                            }
                            all_questions.append(q_data)
                            pending_question_num = None
                            continue
                        
                    # If it's a very large font and short, it might be a company/role.
                    font_size = span["size"]
                    is_bold = "Bold" in span["font"] or font_size > 12.5
                    
                    if is_bold and len(text) < 20 and not category_pattern.match(text) and not question_pattern.match(text):
                        if any(kw in text for kw in company_keywords):
                            current_company = text
                        elif any(kw in text for kw in role_keywords):
                            current_role = text

    doc.close()
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({"questions": all_questions}, f, ensure_ascii=False, indent=2)
        
    print(f"✅ Fast extraction complete. Found {len(all_questions)} questions.")
    print(f"💾 Saved to {output_path}")

if __name__ == "__main__":
    pdf = r"d:\A研二\A秋招2\【校招】大厂产_运面经真题汇总（持续更新.pdf"
    out = r"d:\A研二\A秋招2\knowledge_base\phase1_raw_questions.json"
    parse_pdf_regex(pdf, out)
