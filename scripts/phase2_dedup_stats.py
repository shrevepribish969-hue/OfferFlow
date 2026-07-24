import json
import os
import hashlib
import sys
from collections import defaultdict

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def generate_hash(text):
    # simple hash for deduplication based on text (normalized)
    normalized = "".join(text.split()).lower()
    return hashlib.md5(normalized.encode('utf-8')).hexdigest()

def run_dedup_and_stats():
    input_path = r"d:\A研二\A秋招2\knowledge_base\phase1_raw_questions.json"
    output_path = r"d:\A研二\A秋招2\knowledge_base\phase2_deduped_questions.json"
    stats_path = r"d:\A研二\A秋招2\knowledge_base\knowledge_base_stats.md"
    
    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return
        
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    raw_questions = data.get("questions", [])
    
    # Deduplication map
    dedup_map = {}
    
    company_stats = defaultdict(int)
    role_stats = defaultdict(int)
    
    for q in raw_questions:
        q_text = q.get("question", "")
        if not q_text: continue
            
        q_hash = generate_hash(q_text)
        company = q.get("company") or "Unknown"
        role = q.get("role") or "Unknown"
        
        if q_hash in dedup_map:
            # Add company to list if not already there
            if company not in dedup_map[q_hash]["companies"]:
                dedup_map[q_hash]["companies"].append(company)
            # Increase duplicate count
            dedup_map[q_hash]["duplicate_count"] += 1
            # Merge sources
            dedup_map[q_hash]["sources"].append(q.get("source"))
        else:
            dedup_map[q_hash] = {
                "question": q_text,
                "question_hash": q_hash,
                "duplicate_count": 1,
                "companies": [company],
                "primary_role": role, # Just keep the first role for simplicity or make it an array
                "category": q.get("category"),
                "raw_text": q.get("raw_text"),
                "sources": [q.get("source")]
            }
            
        company_stats[company] += 1
        role_stats[role] += 1
        
    deduped_list = list(dedup_map.values())
    
    # Save deduped JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({"questions": deduped_list}, f, ensure_ascii=False, indent=2)
        
    # Generate Stats Markdown
    total_companies = len(company_stats)
    total_roles = len(role_stats)
    total_questions = len(raw_questions)
    total_unique = len(deduped_list)
    
    md = f"""# 面经知识库统计报告 (Knowledge Base Stats)

**统计摘要**
- **解析公司数**: {total_companies} 家
- **解析岗位数**: {total_roles} 个
- **总问题数**: {total_questions} 道 (去重前)
- **独立问题数**: {total_unique} 道 (去重后)
- **重复率**: {((total_questions - total_unique) / total_questions * 100):.2f}%

## 🏢 按公司分布 (Company Distribution)
"""
    # Sort companies by count descending
    for comp, count in sorted(company_stats.items(), key=lambda x: x[1], reverse=True):
        md += f"- **{comp}**: {count} 题\n"
        
    md += "\n## 💼 按岗位分布 (Role Distribution)\n"
    for role, count in sorted(role_stats.items(), key=lambda x: x[1], reverse=True):
        md += f"- **{role}**: {count} 题\n"
        
    with open(stats_path, 'w', encoding='utf-8') as f:
        f.write(md)
        
    print(f"✅ Deduplication complete. Unique questions: {total_unique}")
    print(f"💾 Saved deduped data to {output_path}")
    print(f"📊 Saved stats report to {stats_path}")

if __name__ == "__main__":
    print("🚀 Starting Phase 2: Deduplication and Statistics...")
    run_dedup_and_stats()
