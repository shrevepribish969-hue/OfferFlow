# Interview Agent 重构落地实施计划 (V2)

## 1. 背景问题与版本说明
- **版本**: V2 (2026-07-22)
- **背景问题**: 
  最开始设计的 Interview Agent 存在几个严重缺陷：
  1. 题库检索直接粗暴映射，没有任何策略，强依赖大模型的猜想。
  2. Story Bank（用户经历）在每次面试准备时都要重新通过完整简历解析，不仅浪费 Token，更重要的是这导致了 Story 与当前的 Job Case 强绑定，无法沉淀为个人通用长期资产。
  3. 所有复杂的检索过滤、Story Mapping（根据题目找对应项目）和排序重排全部强压给 Prompt 层让 LLM 去做，导致 Prompt 极其庞大、延迟极高且稳定性极差。
- **重构目标**:
  将系统按照 **“资产层（Asset）→ 检索层（Retrieval）→ 推理层（Reasoning）→ 生成层（Generation）”** 的模式解耦，建立完全可复用的全局资产（Global Story Bank），以及纯本地极速响应的 RAG 分级检索引擎（引入 FAISS）。

---

## 2. 架构核心原则
1. **Story Bank 属于全局资产**：绑定 User/Resume，脱离 Job Case 独立存在，供后续简历优化、自我介绍、模拟面试复用。
2. **极简大模型调用**：能用程序（字典匹配、向量计算、规则重排）做的事情，绝不用大模型（降低延迟和 Token 成本）。

---

## 3. 分阶段实施路径

### Phase 1: 资产层 A - 全局 Story Service

将简历解析出的 Story 资产化，独立于具体的面试准备流程。

- **创建 `runtime/services/story_service.py`**:
  实现 `StoryService` 类。负责处理新上传的简历，调用大模型一次性全量解析为 `Story Cards`。
- **持久化**:
  将提取结果保存至 `offerflow.db`，外键绑定到 `ResumeVersion` 或 `User`（绝不绑定 `Job Case`）。
- **修改 `runtime/api/database.py`**:
  新增 `StoryCard` 表模型，添加 `resume_id` 关联字段，包含 `project_name`, `summary`, `competency_tags`, `star_details`, `performance_score` (初始为 0，预留用于 Story Feedback)。

### Phase 2: 检索层 B - 五层分级检索引擎 (Hierarchical Retriever)

抛弃重度依赖 LLM 的检索，改为高度规则化+向量化的高效漏斗。

- **创建 `runtime/services/hierarchical_retriever.py`**:
  - **Layer 1: Strategy Analysis (无 LLM)**：直接读取已有的 `jd_analysis_result`（如 required_skills、keywords），提炼本轮面试策略。
  - **Layer 2: Metadata Retrieval**：根据公司、岗位、轮次精确硬匹配 `final_enriched_kb.json`。
  - **Layer 3: Competency Retrieval (字典匹配)**：建立本地 **Competency Dictionary**，根据提炼出的核心能力标签进行同义词辐射匹配。
  - **Layer 4: Semantic Search (FAISS)**：引入轻量级、极速的 **FAISS** 加上本地 Embedding 模型，当候选题目不足时进行向量召回扩充。
  - **Layer 5: Programmatic Rerank (无 LLM 排序)**：纯程序逻辑重排：去重、根据 frequency_score 和 difficulty 排序，并强制校验题目类型的分布健康度。

### Phase 3: 推理与生成层 C - 编排与打分前移

将复杂的挑选逻辑（Story Mapping）留在代码中，大模型只负责生成具体的沟通话术。

- **修改 `runtime/api/workflow_engine.py` (Interview Prep 执行环节)**:
  - **步骤 1**：查询 `offerflow.db` 获取该用户的全局 Story Bank 资产。
  - **步骤 2**：调用 `hierarchical_retriever.py` 获取 Top 10 真题。
  - **步骤 3 (新增): Programmatic Story Mapping**：编写程序逻辑，计算每道 Question 的 `competency` 与每个 Story Card `competency_tags` 之间的重合度（Score）。为每一题挑选出最高分的 Story Card。
  - **步骤 4**: 组装完整的 `Interview Context` (策略 + Top 10 题目 + 选定的 Story + Weakness Memory)。
  - **步骤 5**: 将整合好的 Context 传给大模型（修改 `260713Prompt_Interview_Prep.md`），LLM 仅负责为匹配好的“题目+Story”生成高分回答框架（STAR/SCQA）和雷区。
