import os
import sys
import json
import time
import argparse
from typing import Dict, Any, Tuple
from dotenv import load_dotenv
# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
from openai import OpenAI

# 强制标准输出使用 UTF-8，防止 Windows 终端报错
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# 1. 基础配置与环境变量加载
load_dotenv()
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

# 目录映射 (Skill名称到具体Prompt文件的映射)
SKILL_PROMPT_MAP = {
    "jd_analysis": "260713Prompt_JD_Analysis.md",
    "resume_analysis": "260713Prompt_Resume_Analysis.md",
    "job_matching": "260713Prompt_Job_Matching.md",
    "resume_optimization": "260713Prompt_Resume_Optimization.md",
    "content_generation": "260713Prompt_Content_Generation.md",
    "interview_preparation": "260713Prompt_Interview_Prep.md",
    "interview_evaluation": "260713Prompt_Interview_Eval.md",
    "reflection": "260713Prompt_Reflection.md",
    "workflow_planning": "260713Prompt_Workflow_Planning.md",
    "job_case_management": "260713Prompt_Job_Case_Management.md",
}

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROMPTS_DIR = os.path.join(PROJECT_ROOT, "prompts")
EVAL_DIR = os.path.join(PROJECT_ROOT, "evaluation")

def load_prompt(skill_name: str) -> str:
    """加载并合并 Base Prompt 与对应的 Skill Prompt"""
    base_path = os.path.join(PROMPTS_DIR, "260713Prompt_Base.md")
    skill_path = os.path.join(PROMPTS_DIR, SKILL_PROMPT_MAP[skill_name])
    
    with open(base_path, 'r', encoding='utf-8') as f:
        base_prompt = f.read()
    with open(skill_path, 'r', encoding='utf-8') as f:
        skill_prompt = f.read()
        
    return f"{base_prompt}\n\n=========================\n\n{skill_prompt}"

def load_json_asset(skill_name: str, file_name: str) -> list:
    """加载测试用例或基准数据集"""
    file_path = os.path.join(EVAL_DIR, skill_name, file_name)
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def clean_json_response(raw_text: str) -> Dict[str, Any]:
    """强鲁棒性 JSON 解析器：剥离 Markdown 包裹和无关文本"""
    text = raw_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    return json.loads(text)

def call_llm(system_prompt: str, input_data: Dict) -> Tuple[Dict[str, Any], float]:
    """调用 DeepSeek 接口"""
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    user_content = f"Please process the following input strictly according to your system prompt instructions:\n\n{json.dumps(input_data, ensure_ascii=False, indent=2)}"
    
    start_time = time.time()
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=0.0 # 评测时必须用 0 温度，保证确定性
    )
    latency = time.time() - start_time
    
    raw_output = response.choices[0].message.content
    try:
        parsed_output = clean_json_response(raw_output)
        return parsed_output, latency, raw_output
    except Exception as e:
        return {"error": "JSON_PARSE_FAILED", "raw": raw_output}, latency, raw_output

def score_case(expected: Dict, actual: Dict) -> Dict:
    """核心打分器：支持 Field-Level 的精确与语义打分"""
    metrics = {
        "schema_pass": False,
        "exact_match": {},
        "semantic_match": {},
        "constraint_pass": 100,
        "exact_score": 0,
        "semantic_score": 0,
        "overall_score": 0,
        "diffs": []
    }
    
    # 1. Schema 检查
    if "error" in actual and actual["error"] == "JSON_PARSE_FAILED":
        metrics["schema_pass"] = False
        metrics["constraint_pass"] = 0
        metrics["diffs"].append("Output is not valid JSON.")
        return metrics
    metrics["schema_pass"] = True
    
    # 解决包裹层问题 (如 {"resume_analysis_result": {...}, "tool_calls": [...]})
    actual_data = actual
    # 优先查找以 _result 结尾的 key
    result_keys = [k for k in actual.keys() if k.endswith('_result')]
    if result_keys and isinstance(actual[result_keys[0]], dict):
        actual_data = actual[result_keys[0]]
        # 保留 root 级别的 tool_calls 以便评测引擎可以检测它
        if "tool_calls" in actual:
            actual_data["tool_calls"] = actual["tool_calls"]
    elif len(actual.keys()) == 1 and isinstance(list(actual.values())[0], dict):
        actual_data = list(actual.values())[0]

    # 2. Exact Match (逐字段检查)
    exp_exact = expected.get("exact_match", {})
    exact_total = len(exp_exact.keys())
    exact_hit = 0
    for k, v in exp_exact.items():
        actual_val = actual_data.get(k, None)
        
        # 2. Exact Match, Contains Match, Multiple Choice
        is_match = False
        if isinstance(v, list):
            # Multiple Choice (任一匹配即可，支持 Contains)
            for option in v:
                if actual_val == option:
                    is_match = True
                    break
                elif option and actual_val and isinstance(option, str) and isinstance(actual_val, str):
                    if option in actual_val or actual_val in option:
                        is_match = True
                        break
        else:
            # Single Option (双向包含判定 Contains Match)
            if actual_val == v:
                is_match = True
            elif v and actual_val and isinstance(v, str) and isinstance(actual_val, str):
                if v in actual_val or actual_val in v:
                    is_match = True
                
        if is_match:
            metrics["exact_match"][k] = "✔"
            exact_hit += 1
        else:
            metrics["exact_match"][k] = f"✘ (Exp: {v}, Act: {actual_val})"
            
    metrics["exact_score"] = int((exact_hit / exact_total * 100)) if exact_total > 0 else 100
    
    # 3. Semantic Match (关键字包含容错算法)
    exp_semantic = expected.get("semantic_match", {})
    semantic_scores = []
    
    for k, v_list in exp_semantic.items():
        # 如果 v_list 不是列表（比如空字典），跳过
        if not isinstance(v_list, list):
            continue
            
        actual_list = actual_data.get(k, [])
        # 将 Actual 数据转为平铺字符串，进行容错关键字检索
        actual_str = json.dumps(actual_list, ensure_ascii=False)
        
        hit_count = 0
        for expected_keyword in v_list:
            if str(expected_keyword) in actual_str:
                hit_count += 1
                
        score = int((hit_count / len(v_list) * 100)) if len(v_list) > 0 else 100
        metrics["semantic_match"][k] = score
        semantic_scores.append(score)
        
    metrics["semantic_score"] = int(sum(semantic_scores) / len(semantic_scores)) if semantic_scores else 100
    
    # 4. Overall 综合打分 (Exact: 40, Semantic: 40, Schema: 10, Constraint: 10)
    # 对于只需要校验 Exact 的场景，自动调平权重
    metrics["overall_score"] = int(
        (metrics["exact_score"] * 0.4) + 
        (metrics["semantic_score"] * 0.4) + 
        (100 if metrics["schema_pass"] else 0) * 0.1 +
        (metrics["constraint_pass"] * 0.1)
    )
    
    return metrics

def run_evaluation(skill_name: str):
    print(f"=======================================")
    print(f" OfferFlow Evaluation Engine Starting ")
    print(f" Target Skill: {skill_name}")
    print(f"=======================================\n")
    
    if not API_KEY:
        print("❌ 致命错误：未找到 DEEPSEEK_API_KEY 环境变量！")
        print("请参考 runtime/.env.example 创建 .env 文件。")
        return

    try:
        prompt = load_prompt(skill_name)
        test_cases = load_json_asset(skill_name, "test_cases.json")
        golden_dataset = load_json_asset(skill_name, "golden_dataset.json")
    except Exception as e:
        print(f"❌ 加载资产失败: {str(e)}")
        return
        
    print(f"✅ 加载成功: 找到 {len(test_cases)} 个测试用例。")
    print(f"🚀 开始调用 {MODEL_NAME} 进行推理...\n")
    
    total_latency = 0
    passed = 0
    failed = 0
    schema_ok = 0
    
    failures_log = []
    
    golden_dict = {item['case_id']: item['expected_output'] for item in golden_dataset}
    
    for case in test_cases:
        case_id = case['case_id']
        expected = golden_dict.get(case_id, {})
        
        print(f"正在运行 {case_id}...", end="", flush=True)
        
        actual, latency, raw = call_llm(prompt, case['input'])
        total_latency += latency
        
        metrics = score_case(expected, actual)
        
        if metrics["schema_pass"] and metrics["overall_score"] >= 80:
            schema_ok += 1
            passed += 1
            print(f" ✅ (耗时: {latency:.2f}s)")
            status_symbol = "✅ PASS"
        else:
            if metrics["schema_pass"]:
                schema_ok += 1
            failed += 1
            print(f" ❌ (耗时: {latency:.2f}s)")
            status_symbol = "❌ FAIL"
            
        failures_log.append({
            "case_id": case_id,
            "status": status_symbol,
            "latency": f"{latency:.2f}s",
            "input": case['input'],
            "expected": expected,
            "actual": actual if metrics["schema_pass"] else raw,
            "metrics": metrics,
            "diffs": metrics["diffs"]
        })
            
    # 构造并输出结果看板
    import hashlib
    prompt_hash = hashlib.md5(prompt.encode('utf-8')).hexdigest()[:8]
    
    report_content = []
    report_content.append(f"=======================================")
    report_content.append(f" Evaluation Report: {skill_name.upper()}")
    report_content.append(f"=======================================")
    report_content.append(f"Prompt Version (MD5): {prompt_hash}")
    report_content.append(f"Model Version:        {MODEL_NAME}")
    report_content.append(f"Total Cases:          {len(test_cases)}")
    report_content.append(f"Passed:               {passed}")
    report_content.append(f"Failed:               {failed}\n")
    
    report_content.append("[Metrics]")
    report_content.append(f"Schema Correctness: {(schema_ok/len(test_cases))*100:.0f}%")
    report_content.append(f"Avg Latency:        {(total_latency/len(test_cases)):.2f}s")
    
    if failed == 0:
        report_content.append("\n[Status]: ✅ REGRESSION PASS")
    else:
        report_content.append("\n[Status]: ❌ REGRESSION FAILED")
        
    report_content.append("\n\n=======================================")
    report_content.append(" Detailed Case Reports (Field-Level)")
    report_content.append("=======================================\n")
    
    for log in failures_log:
        overall = log['metrics']['overall_score']
        status_text = "PASS" if overall >= 80 else "FAIL" # 80分及格线
        
        report_content.append(f"## {log['case_id']}")
        report_content.append(f"Overall {overall} {status_text}")
        report_content.append("--------------------------------")
        report_content.append(f"Schema {'100' if log['metrics']['schema_pass'] else '0'}")
        report_content.append("--------------------------------")
        
        if log['metrics']['exact_match']:
            report_content.append("Exact Match")
            for k, v in log['metrics']['exact_match'].items():
                report_content.append(f"{k} {v}")
            report_content.append("--------------------------------")
            
        if log['metrics']['semantic_match']:
            report_content.append("Semantic Match")
            for k, score in log['metrics']['semantic_match'].items():
                report_content.append(f"{k} {score}")
            report_content.append("--------------------------------")
            
        report_content.append(f"Constraint {log['metrics']['constraint_pass']}")
        report_content.append("--------------------------------")
        report_content.append(f"Latency {log['latency']}\n")
        
        # 为了方便调试，仍然在折叠块中提供原始输出
        report_content.append("<details><summary>View Raw JSON</summary>\n")
        report_content.append("### Input")
        report_content.append(f"```json\n{json.dumps(log['input'], ensure_ascii=False, indent=2)}\n```\n")
        report_content.append("### Actual Output")
        if isinstance(log['actual'], dict):
            report_content.append(f"```json\n{json.dumps(log['actual'], ensure_ascii=False, indent=2)}\n```\n")
        else:
            report_content.append(f"```text\n{log['actual']}\n```\n")
        report_content.append("</details>\n")
        
        report_content.append("\n---\n")

    final_report = "\n".join(report_content)
    print(f"\n{final_report}")
    
    # 保存测试结果到对应 Skill 的 reports 目录下
    reports_dir = os.path.join(EVAL_DIR, skill_name, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    report_file_path = os.path.join(reports_dir, f"report_{timestamp}.md")
    
    with open(report_file_path, 'w', encoding='utf-8') as f:
        f.write(final_report)
        
    print(f"\n📂 测试结果已永久保存至: {report_file_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OfferFlow Evaluation Engine")
    parser.add_argument("--skill", type=str, required=True, help="要评测的 Skill 名称，如 jd_analysis")
    args = parser.parse_args()
    
    run_evaluation(args.skill)
