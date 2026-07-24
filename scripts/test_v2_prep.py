import asyncio
import os
import sys

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(PROJECT_ROOT)

from runtime.api.database import SessionLocal, engine, Base
from runtime.api import models
from runtime.services.story_service import StoryService
from runtime.api.workflow_engine import SkillExecutor

async def run_v2_test():
    print("=== 初始化测试数据库 ===")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 1. 准备测试数据
    user = db.query(models.UserProfile).first()
    if not user:
        print(">> 创建测试用户与简历...")
        sample_resume = """
        OfferFlow AI 面试助手：主导开发基于大模型的面试准备系统，通过 Prompt Engineering 和 RAG 架构提供个性化面经推荐，将准备效率提升 50%。
        AI 课堂分析系统：负责多模态数据处理（音频+视频），通过数据分析评估学生课堂专注度，并设计 PRD。
        """
        user = models.UserProfile(base_resume=sample_resume)
        db.add(user)
        db.commit()
        db.refresh(user)

    job = db.query(models.JobCase).first()
    if not job:
        print(">> 创建测试岗位（腾讯 - 产品经理）...")
        job = models.JobCase(
            company="腾讯",
            role="产品经理",
            workflow_data={
                "jd_analysis_result": {
                    "required_skills": ["产品设计", "需求分析", "AI 认知"],
                    "keywords": ["ToB", "Agent"]
                }
            }
        )
        db.add(job)
        db.commit()
        db.refresh(job)

    # 2. 测试 Phase 1: 资产层 (Story Service)
    print("\n=== 测试 Phase 1: 解析简历为 Story Bank 资产 ===")
    stories = db.query(models.StoryCard).filter(models.StoryCard.user_id == user.id).all()
    if not stories:
        print(">> 首次运行，正在调用大模型解析简历提取 Story Bank (请耐心等待10-20秒)...")
        result = await StoryService.parse_resume_to_stories(db, user.id)
        if "error" in result:
            print(f"解析失败: {result['error']}")
            return
        print(f"成功提取了 {result['inserted_cards']} 个 Story Cards!")
    else:
        print(f">> 发现已有 {len(stories)} 个 Story Cards，直接复用资产！")
        for s in stories:
            print(f"   - {s.project_name}: {s.competency_tags}")

    # 3. 测试 Phase 2 & 3: 五层检索与动态生成
    print("\n=== 测试 Phase 2 & 3: 触发 RAG 检索与 Interview Prep 生成 ===")
    print(">> 正在执行 (包含五层分级检索漏斗及 Story Mapping)...")
    
    prep_result = await SkillExecutor.execute_interview_prep(job, db)
    
    if "error" in prep_result:
        print(f"\n[错误] {prep_result['error']}")
    else:
        print("\n=== 生成成功！最终输出的 Interview Prep Pack 如下 ===")
        import json
        print(json.dumps(prep_result, indent=2, ensure_ascii=False))
        
    db.close()

if __name__ == "__main__":
    asyncio.run(run_v2_test())
