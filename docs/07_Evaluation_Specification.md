# OfferFlow Evaluation Specification (AI 能力评测体系)

> **Document Type**: Core Specification (07/10)
> **Positioning**: 连接 Prompt Engineering 与底层代码实现的桥梁，OfferFlow 全局 AI 节点的持续迭代基准与防退化（Regression-proof）防线。

## 一、 Evaluation Architecture (评估体系架构)

在传统的软件工程中，测试是开发结束后的附属工作（QA）。但在 AI Native 与 LLMOps 的范式下，大模型天然的非确定性（Non-deterministic）决定了 **Evaluation 必须作为 Prompt Engineering 的必不可少的一层**。

在 OfferFlow 中，Evaluation 所处的核心生命周期如下：
`Architecture` ➔ `Workflow` ➔ `Skill` ➔ `Prompt` ➔ **`Evaluation`** ➔ `Regression Test` ➔ `Production`

**为什么它是核心？**
1. **防止代码腐化（Code Rot）**：大模型的底层 API 随时可能更新（如 GPT-4o 的某次静默升级），只有完善的 Evaluation 才能保证系统在模型漂移（Model Drift）时不崩溃。
2. **重构的底气**：当您想优化一个耗 Token 太多的 Prompt，或者想把 OpenAI 换成更便宜的 DeepSeek 时，Evaluation 是一键验证新方案是否达标的唯一依据。
3. **消除玄学调参**：把“我觉得这个回答更好”的主观感性，降维到精准的 Recall、Precision 与 Schema Correctness 得分。

---

## 二、 Skill Classification (节点分类)

OfferFlow 中的 10 个 Skill 承担着完全不同的业务目标，输出形态差异巨大。必须根据它们的特性进行分类，严禁采用“一招鲜”的评估方式。

1. **Structured Extraction (结构化提取)**
   - **包含节点**：`JD Analysis`, `Resume Analysis`
   - **特性**：从非结构化文本中榨取绝对的客观事实。
2. **Structured Analysis (结构化分析)**
   - **包含节点**：`Job Matching`, `Interview Evaluation`, `Reflection`
   - **特性**：基于输入的事实进行逻辑推理（如算分、提炼 Insights），不涉及长文本创作。
3. **Content Generation (内容生成)**
   - **包含节点**：`Resume Optimization`, `Content Generation`, `Interview Preparation`
   - **特性**：面向用户侧（User-facing）的 Markdown 长文本输出，对语言风格、排版、专业度要求极高。
4. **Workflow Control (流转控制)**
   - **包含节点**：`Workflow Planning`, `Job Case Management`
   - **特性**：只输出纯纯的 Tool Calls 数组，无根级业务数据，直接决定状态机的走向。

---

## 三、 Evaluation Strategy (分级评估策略)

针对上述四大类 Skill，OfferFlow 采用截然不同的降维打击式评估方案：

### 1. 针对 Structured Skill (提取 & 分析)
* **策略**：`Golden Dataset + JSON Diff + Rule-based Score`
* **依据**：这类节点的答案有绝对的对错之分。
* **执行**：把 Ground Truth 分为 Exact Match（必须 100% 一样，如学历）和 Semantic Match（算 Embedding 相似度，如技能标签）。采用硬编码脚本进行确定性打分。

### 2. 针对 Content Generation (内容生成)
* **策略**：`LLM-as-a-Judge (如 Ragas) + Rule-based Constraint Check`
* **依据**：一封感谢信有无数种写法，无法用 Golden Dataset 逐字比对。
* **执行**：
  - **规则层**：用脚本校验 Schema 是否合法，是否幻觉了不存在的经历（Constraint Check）。
  - **评委层**：唤起一个更高智能的模型（如 Claude 3.5 Sonnet）作为 Judge，根据预设的 Rubric（评分维度）为生成的内容打分（语气专业度、上下文关联度）。

### 3. 针对 Workflow Control (流转控制)
* **策略**：`Workflow Replay + Tool Call Validation + State Transition Validation`
* **依据**：控制节点的唯一价值是“调对了函数”，而不是“说了什么话”。
* **执行**：重放特定状态（如“面试失败”），用正则或断言验证模型是否严格吐出了 `Update_Job_Case_Stage` Tool，且参数 `new_stage` 必须等于 `Rejected`。

---

## 四、 Evaluation Pipeline (标准执行流水线)

未来任何一个新的 Skill 接入或迭代，都必须在 CI/CD 中跑通以下标准化 Pipeline：

1. **Load Prompt**: 动态拼装 `Base Prompt` + `Skill Prompt`
2. **Load Test Cases**: 加载针对该节点的边缘测试集（Edge Cases & Happy Paths）
3. **Run Skill**: 并发请求 LLM 推理接口
4. **Collect Output**: 拦截并捕获所有 JSON / Tool Calls
5. **Compare Golden / Run Judge**: 根据 Skill 类型路由到 JSON Diff 或 LLM-as-a-Judge
6. **Calculate Score**: 计算多维度的指标得分
7. **Generate Report**: 自动生成 Markdown / HTML 测试报告
8. **Regression Test**: 与上个版本（或基准线）对比
9. **Pass / Fail**: 决定代码是否允许合并至主分支

---

## 五、 Score Specification (全局打分体系)

整个 OfferFlow 的评分体系被标准化为以下维度，满分 100 分。不同类的 Skill 挂载不同的权重（Weight）：

| 评分维度 (Score Item) | 描述 (Description) | 适用节点 | 目标 |
| :--- | :--- | :--- | :--- |
| **Schema Correctness** | 是否输出了合法的 JSON，有无 Markdown ````json 冗余包裹 | All Skills | 100% |
| **Constraint Compliance** | 有无闲聊废话？是否触发了预期的 Failure Handling？ | All Skills | 100% |
| **Accuracy (Exact Match)** | 客观事实提取的准确率（如学历要求、状态流转参数） | Extraction / Control | ≥ 95% |
| **Completeness (Recall)** | 召回率：Golden 里的技能点，模型有没有漏掉？ | Extraction | ≥ 90% |
| **Reasoning Quality** | 逻辑质量：Judge 模型打出的专业度、语气、逻辑自洽分 | Content Gen / Analysis | ≥ 85% |
| **Robustness** | 鲁棒性：在面临极端噪音（如纯聊天、脏数据）时防崩溃的能力 | All Skills | 100% |
| **Latency & Token Usage** | 工程指标：耗时与上下文开销，作为成本监控不计入绝对得分 | All Skills | N/A |

---

## 六、 Evaluation Assets (节点资产清单)

在真正的工程化体系下，一个 Skill 不仅仅是一段文字。每一个完全落地的 AI Module 必须具备以下完整资产，方可宣告“竣工”：

1. `prompt.md` (包含 Base 继承)
2. `test_cases.json` (覆盖至少 10 个代表性业务/边界场景)
3. `golden_dataset.json` (手工校对的三层评测基准)
4. `evaluator.py/ts` (针对该节点的私有打分脚本/配置)
5. `regression_report.md` (最近一次运行的通过率报告)
6. `version_history.md` (修改 Prompt 的原因与效果对比日志)

---

## 七、 Project Folder Structure (评测目录重构)

为了支持未来的全自动化测试，整个 Evaluation 层应与 Prompts 和源码平级，采用以下隔离式的目录结构设计：

```text
OfferFlow/
├── ... (其他工程目录)
├── Prompts/                  # 运行时挂载的纯净 Prompt
├── evaluation/               # 评测体系根目录
│   ├── framework/            # 评测引擎基建 (Diff 算法, Ragas 配置, Metrics 定义)
│   ├── skill_jd_analysis/    # 单个 Skill 的独立评测上下文
│   │   ├── test_cases.json
│   │   ├── golden.json
│   │   └── reports/
│   ├── skill_resume_analysis/
│   ├── skill_workflow_planning/
│   └── ... (支持无限扩充 Skill)
```

---

## 八、 Development SOP (后续开发标准作业程序)

基于以上评测体系，OfferFlow 项目**彻底废弃“写完 Prompt 直接写界面”**的作坊式打法。后续全项目标准开发顺序（SOP）变更为：

**Phase 1: AI Logic Definition (AI 逻辑定义)**
1. **Prompt Definition** (编写 Skill 业务契约)
2. **Test Cases Construction** (构造真实世界测试用例集)
3. **Golden Dataset Definition** (定义 MLOps 标准答案)

**Phase 2: Evaluation & Tuning (评估与调优)**
4. **Run Evaluation** (执行评测脚本跑分)
5. **Prompt Optimization** (针对低分 Case 修改 Prompt)
6. **Regression Passed** (通过回归测试，打上 `Ready for Prod` 标签)

**Phase 3: Engineering Implementation (工程落地)**
7. **Workflow Integration** (用 TS/Python 编写业务状态机，串联各 Skill)
8. **Frontend Integration** (编写用户交互界面 UI)
9. **Release** (部署上线)

> 核心铁律：只要 Phase 2 没有跑通 `Regression Passed`，决不允许进入 Phase 3。
