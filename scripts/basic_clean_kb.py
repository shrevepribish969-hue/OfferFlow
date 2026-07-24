import json
import os
import re
import sys
import threading
import concurrent.futures
from openai import OpenAI
from dotenv import load_dotenv

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(PROJECT_ROOT, 'runtime', '.env'))

# Add project root to path for runtime imports
sys.path.append(PROJECT_ROOT)

API_KEY = os.getenv("API_KEY") or os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/")
MODEL_NAME = os.getenv("MODEL_NAME", "glm-4.5-air")

# Read from phase2, write to final
KB_PATH_IN = os.path.join(PROJECT_ROOT, "knowledge_base", "phase2_deduped_questions.json")
KB_PATH_OUT = os.path.join(PROJECT_ROOT, "knowledge_base", "final_enriched_kb.json")
FAISS_PATH = os.path.join(PROJECT_ROOT, "knowledge_base", "faiss_index.bin")

def is_gibberish(text: str) -> bool:
    text = text.strip()
    # Step 1: Empty
    if not text:
        return True
    
    # Step 2: Regex gibberish (pure punctuation, single letter, single Chinese character)
    # If text has no alphanumeric or chinese characters, it's gibberish
    if not re.search(r'[a-zA-Z0-9\u4e00-\u9fa5]', text):
        return True
        
    # Single letter or single character
    if len(text) <= 1:
        return True
        
    # A bunch of random punctuation with one letter
    clean_text = re.sub(r'[^\w\s\u4e00-\u9fa5]', '', text).strip()
    if len(clean_text) <= 1:
        return True
        
    return False

def llm_judge_batch(questions_batch):
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    system_prompt = """
你是一个高级知识库质检员。你需要判断一批面试题是否是**完整、合法、可独立理解的面试问题**。

判断标准（只要不符合以下任何一条，直接标记 is_valid 为 false）：
1. 是否能够独立成为一道面试题？（如果是无意义的短句、半句话、或者选项字母如"B选项"、"对于"，则为 false）
2. 是否表达完整？（如果是被截断的乱码、只有上半句，则为 false）

注意：像"自我介绍"、"为什么想来腾讯"、"什么是多态"等虽然很短，但语意完整，属于合法问题（true）。

输出格式（必须是严格的 JSON）：
{
  "results": [
    {
      "question_hash": "string",
      "is_valid": true / false,
      "reason": "string (一句话解释)"
    }
  ]
}
"""
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(questions_batch, ensure_ascii=False)}
            ],
            temperature=0.1
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"): content = content[7:]
        if content.endswith("```"): content = content[:-3]
        return json.loads(content.strip())
    except Exception as e:
        print(f"LLM Error: {e}")
        return None

def main():
    if not os.path.exists(KB_PATH_IN):
        print(f"File not found: {KB_PATH_IN}")
        return
        
    with open(KB_PATH_IN, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    raw_questions = data.get("questions", [])
    print(f"🚀 开始清洗知识库，初始问题数量: {len(raw_questions)}")
    
    # Step 1 & 2: Local Cleaning
    passed_local = []
    discarded_local = []
    
    for q in raw_questions:
        q_text = q.get("question", "")
        if is_gibberish(q_text):
            discarded_local.append(q_text)
        else:
            passed_local.append(q)
            
    print(f"✅ Step 1 & 2 (空值与乱码过滤) 完成。删除了 {len(discarded_local)} 个垃圾碎片。剩余 {len(passed_local)} 题。")
    if len(discarded_local) > 0:
        print(f"   样例垃圾碎片: {discarded_local[:5]}")

    # Step 3: LLM Semantic Judgment
    print(f"🚀 开始 Step 3: LLM 语义判决 (通过大模型排查不完整半句话)...")
    
    batch_size = 15
    batches = []
    for i in range(0, len(passed_local), batch_size):
        batch = passed_local[i:i+batch_size]
        batches.append([{"question_hash": q["question_hash"], "question": q["question"]} for q in batch])
        
    passed_llm = []
    discarded_llm = []
    lock = threading.Lock()
    
    def process_batch(idx, batch):
        print(f"   - 正在请求 LLM 处理 Batch {idx+1}/{len(batches)}...")
        res = llm_judge_batch(batch)
        if res and "results" in res:
            with lock:
                for r in res["results"]:
                    q_hash = r.get("question_hash")
                    is_valid = r.get("is_valid", False)
                    reason = r.get("reason", "")
                    
                    # Find original question
                    orig_q = next((q for q in passed_local if q["question_hash"] == q_hash), None)
                    if not orig_q: continue
                    
                    if is_valid:
                        passed_llm.append(orig_q)
                    else:
                        discarded_llm.append((orig_q["question"], reason))
                        
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(process_batch, i, b) for i, b in enumerate(batches)]
        concurrent.futures.wait(futures)
        
    print(f"✅ Step 3 (LLM 语义判决) 完成。删除了 {len(discarded_llm)} 个语意不完整问题。剩余 {len(passed_llm)} 题。")
    if len(discarded_llm) > 0:
        print(f"   被LLM击毙的样例: {discarded_llm[:5]}")

    # Step 4: Exact Deduplication
    print(f"🚀 开始 Step 4: 精确去重...")
    final_kb = []
    seen_texts = set()
    
    for q in passed_llm:
        text_clean = re.sub(r'\s+', '', q.get("question", "").lower())
        if text_clean not in seen_texts:
            seen_texts.add(text_clean)
            final_kb.append(q)
            
    dedup_count = len(passed_llm) - len(final_kb)
    print(f"✅ Step 4 (精确去重) 完成。删除了 {dedup_count} 个重复题。最终留存 {len(final_kb)} 道优质真题。")
    
    # Save back to JSON
    if len(final_kb) > 100:
        with open(KB_PATH_OUT, 'w', encoding='utf-8') as f:
            json.dump({"questions": final_kb}, f, ensure_ascii=False, indent=2)
        print(f"💾 优质知识库已保存至 {KB_PATH_OUT}")
    else:
        print("清洗后剩余数量过少，拒绝保存！可能 API 调用失败。")
        return
    
    # Step 5: Rebuild FAISS Embedding
    print(f"🚀 开始 Step 5: 销毁并重建 FAISS 索引...")
    if os.path.exists(FAISS_PATH):
        os.remove(FAISS_PATH)
        print(f"   已删除旧向量库 {FAISS_PATH}")
        
    try:
        from runtime.services.hierarchical_retriever import HierarchicalRetriever
        print(f"   正在调用 Sentence Transformers 生成新向量索引...")
        retriever = HierarchicalRetriever()
        retriever._lazy_init_faiss() # This will force build
        print(f"✅ 向量索引重建完成！")
    except Exception as e:
        print(f"重建 FAISS 失败: {e}")

if __name__ == "__main__":
    main()
