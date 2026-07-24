# OfferFlow Workflow Specification (Version 1.0)

## 1. Workflow Engine Principles

Workflow 是系统的大脑，完全由**硬编码的程序（代码逻辑）**控制。
LLM（Intent Router）只负责指明要走哪一条 Workflow，一旦进入 Workflow，上下文的组装、Skill 的调用顺序、Tool 的校验全部是确定性的。

---

## 2. Core Workflows Definition

### 2.1 Creation Workflow (岗位建档流)
* **触发条件**：Intent Router 识别到用户输入了新岗位的 JD 或点击了“新建 Job Case”。
* **执行编排**：
  1. Engine 锁定 `job_case_id`。
  2. 调起 `Skill: JD Analysis` -> 产出 `jd_result`。
  3. Workflow Engine 自动 Fork Master Resume 为当前的 Job Case Resume（纯程序执行，无 AI 介入）。
  4. 调起 `Skill: Resume Analysis` -> 产出 `resume_result`。
  5. 调起 `Skill: Job Matching` -> 产出 `gap_report` 并调用 `Save_Job_Matching_Result` 落库。
  6. 调起 `Skill: Workflow Planning` -> 生成首批 Task（如“优化简历”）。
* **结束状态**：Job Case 进入 `Prepared` 状态。

### 2.2 Optimization Workflow (定向优化流)
* **触发条件**：用户在 Workspace 点击“智能优化简历”或输入相关诉求。
* **执行编排**：
  1. Engine 提取该岗位的 `jd_result` 和 `job_matching_result`。
  2. 调起 `Skill: Resume Optimization`。
  3. Skill 输出 `optimized_resume_json`，并调用 `Save_Job_Case_Resume` 存入当前岗位分支。
  4. 若 AI 识别到更优表述，同时调用 `Propose_Resume_Merge`，在 GUI 侧边栏向用户展示 PR 弹窗。
  5. 若用户意图还包含生成沟通物料，调起 `Skill: Content Generation`，产出 `generated_content` 并调用 `Create_Communication_Record` 归档。
* **结束状态**：生成投递就绪版的 Resume 和配套沟通物料。

### 2.3 Interview Prep Workflow (备战流)
* **触发条件**：Job Case 状态被更新为 `Interview`（由 Router 或用户手动更改）。
* **执行编排**：
  1. 调起 `Skill: Workflow Planning` -> 生成“准备面试”相关的 Task。
  2. Engine 检索 Supabase 中的 Memory，提取用户的历史短板。
  3. 调起 `Skill: Interview Preparation` (结合 JD + Memory) -> 生成定制化模拟题库 `interview_prep_result`。
  4. Skill 调用 `Save_Interview_Preparation` 进行数据持久化。
  5. 推送提醒至用户 Workspace。

### 2.4 Post-Interview Reflection Workflow (复盘与沉淀流)
* **触发条件**：面试日程结束，用户提交了面经或面试录音。
* **执行编排**：
  1. 调起 `Skill: Interview Evaluation` -> 生成对本次回答的深度评价。
  2. 调起 `Skill: Reflection`。
  3. Reflection 执行完毕后，调用 `Save_Interview_Reflection` 存入当前 Job Case 记录。
  4. Reflection 继续调用 `Update_Memory`，提炼全局高价值知识存入全局 User Profile。
* **结束状态**：面试归档，系统静待下一次状态流转。

### 2.5 Status Update Workflow (状态兜底流转)
* **触发条件**：Intent Router 识别到针对某岗位的泛状态更新指令（例如：“我通过腾讯初筛了，下周一面”）。
* **执行编排**：
  1. 调起 `Skill: Job Case Management`。
  2. Skill 判定目标状态，输出 Tool Call `Update_Job_Case_Stage`。
  3. Job Case Controller 执行写操作。
  4. Workflow Engine 监听到状态变更（如变更为 Interview），自动触发下游联动 Workflow（如 2.3 Interview Prep Workflow）。
