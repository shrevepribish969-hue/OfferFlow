# OfferFlow Tool Specification (Version 1.0)

## 1. Tool Design Principles

在 OfferFlow 架构中，Tool 是连接 LLM（推理层）与 Job Case Controller（执行层）的唯一桥梁。
所有 Tool 设计遵循以下原则：
1. **单一入口**：Skill 不允许绕过 Controller 直接写库。
2. **读写分离**：上下文读取主要由 Workflow 在执行前注入，Tool 主要用于处理“写”操作或“复杂查”操作。
3. **强类型校验**：所有 Tool 的 Input 必须符合严格的 JSON Schema。

---

## 2. Core Tool List

### 2.1 Update_Job_Case_Stage
* **描述**：更新当前 Job Case 的生命周期状态（如：Applied -> Interview）。
* **输入 (Input)**：`job_case_id` (UUID), `new_stage` (Enum), `reason` (String)
* **输出 (Output)**：`success` (Boolean), `updated_timestamp` (String)
* **权限**：Job Case Controller

### 2.2 Propose_Resume_Merge
* **描述**：当 AI 在重写专属简历发现极佳的表述时，向用户发起将该表述合入 Master Resume 的建议（PR）。
* **输入 (Input)**：`job_case_id` (UUID), `original_text` (String), `optimized_text` (String), `improvement_reason` (String)
* **输出 (Output)**：`proposal_id` (UUID)
* **权限**：Resume Strategist 域下的 Skill

### 2.3 Create_Task
* **描述**：在特定节点（如刚投递完、面试前夕）自动生成待办事项。
* **输入 (Input)**：`job_case_id` (UUID), `task_title` (String), `due_date` (ISO8601), `priority` (Enum: High/Med/Low)
* **输出 (Output)**：`task_id` (UUID)
* **权限**：Workflow Planning Skill

### 2.4 Update_Memory
* **描述**：在复盘结束后，提取具有长期价值的知识（如高频短板、偏好表达）写入全局长期记忆。
* **输入 (Input)**：`user_id` (UUID), `reflection_id` (UUID), `knowledge_tags` (Array), `insights` (Array)
* **输出 (Output)**：`success` (Boolean)
* **权限**：Reflection Skill

### 2.5 Save_Job_Matching_Result
* **描述**：持久化保存 JD 与 Resume 之间的匹配差异分析结果，供后续优化环节使用。
* **输入 (Input)**：`job_case_id` (UUID), `matching_score` (Int 0-100), `missing_skills` (Array), `gap_analysis_json` (Object)
* **输出 (Output)**：`success` (Boolean)
* **权限**：Job Matching Skill

### 2.6 Save_Interview_Reflection
* **描述**：保存针对单次面试的详细复盘记录。
* **输入 (Input)**：`job_case_id` (UUID), `interview_id` (UUID), `reflection_content` (Object)
* **输出 (Output)**：`success` (Boolean)
* **权限**：Reflection Skill

### 2.7 Save_Job_Case_Resume
* **描述**：保存 AI 优化过后的 Job Case 专属简历分支。
* **输入 (Input)**：`job_case_id` (UUID), `optimized_resume_json` (Object)
* **输出 (Output)**：`success` (Boolean)
* **权限**：Resume Optimization Skill

### 2.8 Create_Communication_Record
* **描述**：将 AI 生成的物料（如 Follow-up 邮件等）归档至该岗位的 Communication 时间线中。
* **输入 (Input)**：`job_case_id` (UUID), `communication_type` (Enum), `generated_content` (String)
* **输出 (Output)**：`communication_id` (UUID)
* **权限**：Content Generation Skill

### 2.9 Save_Interview_Preparation
* **描述**：持久化保存生成的模拟面试题库，供后续用户作答与 Evaluation 使用。
* **输入 (Input)**：`job_case_id` (UUID), `interview_prep_result` (Object)
* **输出 (Output)**：`success` (Boolean)
* **权限**：Interview Preparation Skill
