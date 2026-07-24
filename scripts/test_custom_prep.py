import asyncio
import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "runtime", ".env"))

from runtime.api.database import get_db
from runtime.api.models import UserProfile, JobCase
from runtime.api.workflow_engine import SkillExecutor

# --- User Provided Data ---
USER_RESUME = """
# 张三

应聘岗位：AI 产品经理

## 教育经历

XX大学
计算机科学与技术
2022-2026

## 实习经历

### XX教育科技有限公司
AI产品实习生
2025.07-2025.10

负责AI课堂分析产品。
参与课堂报告、教学目标等模块设计。
通过ASR+CV分析课堂行为。
与算法团队合作优化课堂分析结果。
分析用户行为数据，提出页面改版方案。
参与8个核心功能迭代。

---

## 项目一

### FoodVibe

AI饮食助手

负责产品设计。
接入DeepSeek API。
支持图片识别食物。
支持AI分析营养。
设计Prompt优化回答质量。
通过Supabase管理用户数据。

---

## 项目二

### OfferFlow

AI求职助手

负责整体产品设计。
实现JD解析。
实现简历优化。
设计Interview Agent。
支持Story Bank。
支持Mock Interview。
支持Weakness Memory。

---

## 技能

Figma, SQL, Python, Prompt Engineering, DeepSeek API, OpenAI API, Supabase, Git

---

## 自我评价

热爱AI产品。
持续关注Agent、大模型应用。
喜欢快速验证产品想法。
"""

TARGET_JD = """
腾讯 AI 产品经理（校招）
岗位职责

负责 AI 产品能力规划与落地，包括但不限于 Agent、AIGC、智能搜索、智能助手等方向。
负责用户需求分析，完成需求拆解、PRD 编写及产品设计。
推动研发、算法、设计等团队协同，完成产品上线及迭代。
持续分析产品数据，通过实验和数据分析驱动产品优化。
关注大模型、Agent、多模态等前沿技术，并探索产品落地场景。

任职要求

本科及以上学历。
热爱 AI 产品，对大模型、Prompt、Agent 有持续关注。
具备优秀的产品思维，能够独立分析用户需求。
至少有一个完整的 AI 产品项目。
熟悉 A/B Test、数据分析。
优秀的沟通能力。
有互联网产品实习优先。

加分项

有 Agent 产品经验。
有 AI Coding 产品经验。
有个人作品。
熟悉 MCP、Function Calling。
"""

async def run_custom_test():
    print("=== 初始化测试数据库 ===")
    db = next(get_db())
    
    # Wipe old data
    db.query(JobCase).delete()
    db.query(UserProfile).delete()
    from runtime.api.models import StoryCard
    db.query(StoryCard).delete()
    db.commit()
    
    # 1. 模拟用户注册
    user = UserProfile(
        base_resume=USER_RESUME,
        user_memory={"weaknesses": ["擅长产品设计与Prompt，但在技术落地细节上不够深入"]}
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f">> 成功创建虚拟用户 ID: {user.id}")
        
    # 2. 模拟投递腾讯 AI 产品经理
    job = JobCase(
        company="腾讯",
        role="AI 产品经理",
        jd_content=TARGET_JD,
        # 模拟已经分析过的 JD 技能点
        workflow_data={
            "jd_analysis_result": {
                "required_skills": ["Agent", "AIGC", "Prompt", "需求分析", "产品设计", "数据分析", "多模态"],
                "role_type": "AI Product Manager"
            }
        }
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    print(f">> 成功创建虚拟岗位投递 ID: {job.id}")

    print("\n=== 测试 Phase 1: 解析简历为 Story Bank 资产 ===")
    from runtime.services.story_service import StoryService
    cards_response = await StoryService.parse_resume_to_stories(db, user.id)
    cards = cards_response.get("data", [])
    print(f">> 成功提取了 {len(cards)} 个 Story Cards!")
    for i, c in enumerate(cards):
        print(f"   [{i+1}] {c.get('project_name')} (标签: {', '.join(c.get('competency_tags', []))})")

    print("\n=== 测试 Phase 2 & 3: 触发 RAG 检索与 Interview Prep 生成 ===")
    print(">> 正在执行 (包含五层分级检索漏斗及 Story Mapping)...")
    
    prep_result = await SkillExecutor.execute_interview_prep(job, db)
    
    print("\n" + "="*50)
    import json
    with open("prep_pack_output.json", "w", encoding="utf-8") as f:
        json.dump(prep_result, f, ensure_ascii=False, indent=2)
    print(">> 生成成功！结果已保存至 prep_pack_output.json")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(run_custom_test())
