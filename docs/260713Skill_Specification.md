# OfferFlow Skill Specification (Version 1.0)

## 1. Skill Design Principles

Skill 是最小的 AI 推理单元。每个 Skill 只做一件事（Single Responsibility）。
它的行为模式是：`Context (Input) -> Prompt Reasoning -> JSON / Tool Call (Output)`

为保证上下游严密对接，所有 Input 和 Output 均采用**具体参数命名法**，严格对应数据库字段或工作流上下文中的变量。

---

## 2. Core Skill Definitions

### 2.1 JD Analysis (岗位分析)
* **描述**：解析非结构化的 JD，提取核心要求。
* **Input**：`jd_raw_text`
* **Output**：`jd_analysis_result` (JSON 格式：包含 `role`, `required_skills`, `nice_to_have`, `experience_years`)
* **Allowed Tools**：无（纯返回数据交由 Workflow）
* **Memory Access**：无

### 2.2 Resume Analysis (简历解析)
* **描述**：解析当前 Job Case 分支下的 Resume。
* **Input**：`current_resume_json`
* **Output**：`resume_analysis_result` (JSON 格式：包含 `structured_experience`, `skill_tags`)
* **Allowed Tools**：无
* **Memory Access**：无

### 2.3 Job Matching (人岗匹配)
* **描述**：对比 JD 需求与 Resume 现状，找出核心 Gap。
* **Input**：`jd_analysis_result`, `resume_analysis_result`
* **Output**：`job_matching_result` (JSON 格式：包含 `matching_score`, `missing_skills`, `gap_analysis_json`)
* **Allowed Tools**：`Save_Job_Matching_Result`
* **Memory Access**：无

### 2.4 Resume Optimization (简历定向优化)
* **描述**：针对 Job Matching 找出的 Gap，重写简历内容，并触发合并建议。
* **Input**：`current_resume_json`, `jd_analysis_result`, `job_matching_result` (来源于 Job Matching 环节存入数据库的数据)
* **Output**：`optimized_resume_json` (JSON 格式：更新后的简历内容)
* **Allowed Tools**：`Save_Job_Case_Resume` (存下专属简历), `Propose_Resume_Merge` (提出合并母版建议)
* **Memory Access**：Read-only (读取 Master Resume 中曾经被成功合并过的优质表达范式)

### 2.5 Content Generation (辅助内容生成)
* **描述**：生成自我介绍、Follow-up 邮件等沟通物料。
* **Input**：`jd_analysis_result`, `optimized_resume_json`, `user_generation_intent` (来源于 Intent Router 解析出的具体诉求，如“写一封催进度的邮件”)
* **Output**：`generated_content` (String：最终生成的文案正文)
* **Allowed Tools**：`Create_Communication_Record`
* **Memory Access**：无

### 2.6 Interview Preparation (面试前瞻准备)
* **描述**：根据岗位需求和过往记忆，生成模拟题库。
* **Input**：`jd_analysis_result`, `optimized_resume_json`, `user_weakness_memory` (从 Memory 中读取的历史薄弱点摘要)
* **Output**：`interview_prep_result` (JSON 格式：包含 `mock_questions`, `evaluation_criteria`)
* **Allowed Tools**：`Save_Interview_Preparation`, `Create_Task`
* **Memory Access**：Read-only (提取 `user_weakness_memory`)

### 2.7 Interview Evaluation (面试回答评价)
* **描述**：对用户的模拟回答或真实录音记录进行打分。
* **Input**：`interview_prep_result` (包含当时的模拟题和标准), `user_answers` (用户回答记录)
* **Output**：`interview_eval_result` (JSON 格式：包含 `scores`, `feedback`, `improvement_areas`)
* **Allowed Tools**：无
* **Memory Access**：无

### 2.8 Reflection (面后复盘)
* **描述**：总结单次面试得失，并提炼成长期记忆。
* **Input**：`interview_eval_result`, `jd_analysis_result`
* **Output**：`reflection_result` (JSON 格式：单次面试的详细复盘报告)
* **Allowed Tools**：`Save_Interview_Reflection`, `Update_Memory`
* **Memory Access**：Write-only (向全局 Memory 写入新发现的规律)

### 2.9 Workflow Planning (流程规划)
* **描述**：根据 Job Case 的阶段跃迁，规划用户的待办任务。
* **Input**：`job_case_status` (当前处于什么阶段), `timeline` (最近发生的事件时间点)
* **Output**：直接输出 Tool Calls (不返回展示性文本)
* **Allowed Tools**：`Create_Task`

### 2.10 Job Case Management (岗位管家)
* **描述**：兜底处理用户的通用指令，识别状态改变。
* **Input**：`user_utterance` (Intent Router 传入的解析指令)
* **Output**：直接输出 Tool Calls (不返回展示性文本)
* **Allowed Tools**：`Update_Job_Case_Stage`
