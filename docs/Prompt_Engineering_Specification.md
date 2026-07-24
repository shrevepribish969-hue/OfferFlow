# OfferFlow Prompt Engineering Framework（Version 1.0）

## 1. Framework Overview

Prompt 是 OfferFlow 整个 AI 系统最重要的能力资产（AI Asset），也是连接大语言模型与业务系统之间的核心桥梁。在 OfferFlow 中，Prompt 并不被视为简单的提示词，而是一套可持续维护、可独立演进、可版本管理的 AI 业务规则。因此，Prompt 不属于业务代码，也不属于模型本身，而属于整个 AI Capability Layer。

整个系统遵循"Workflow 负责调度、Skill 负责能力、Prompt 负责推理"的设计思想。Workflow 决定什么时候调用某一个 Skill，Skill 决定需要完成什么业务，而 Prompt 决定模型应该如何思考并完成当前任务。通过这种职责划分，Prompt 能够独立于代码持续优化，而无需影响整个系统架构。

---

## 2. Prompt Design Philosophy

OfferFlow 所有 Prompt 均遵循"Single Responsibility Prompt"原则，即每一个 Prompt 只负责完成一个明确的业务目标，不承担多个业务能力。例如，JD Analysis Prompt 只负责理解岗位描述，不负责岗位匹配；Resume Optimization Prompt 只负责优化简历，不负责生成面试问题。复杂业务通过多个 Skill 串联完成，而不是不断增加 Prompt 的复杂度。

同时，Prompt 始终围绕业务对象（Domain Object）构建上下文，而不是围绕聊天记录构建上下文。模型获得的信息来自 Job Case、Resume、Interview、Reflection、Memory 等结构化对象，而不是完整的 Conversation History。这使得 Prompt 能够保持稳定、可预测且易于维护。

---

## 3. Prompt Layer Architecture

OfferFlow 将 Prompt 按职责划分为四个层级。

System Prompt 用于定义整个项目的长期行为规范，包括 AI 的身份定位、行为边界、安全约束以及统一输出规范。这部分 Prompt 在整个项目生命周期内保持稳定，不针对具体业务发生变化。

Skill Prompt 是系统中数量最多、也是最重要的一层。每一个 Skill 都拥有独立 Prompt，用于完成特定业务能力，例如岗位分析、简历优化或面试复盘。Skill Prompt 之间相互独立，彼此不存在直接依赖关系。

Output Prompt 用于规范模型输出格式。所有 Skill 都必须遵循统一的数据结构和输出要求，确保模型返回结果能够直接进入 Workflow 或 Tool 调用，而无需再次解析。

Evaluation Prompt 用于结果自检。在正式返回结果之前，模型根据预设检查项验证输出是否符合业务规则，例如是否存在虚构经历、是否遗漏关键字段、是否符合 JSON Schema 等。只有通过检查后，结果才进入下一流程。

---

## 4. Prompt Lifecycle

每一次 Skill 执行都会经历统一的 Prompt 生命周期。

首先，Workflow 根据当前 Job Case 状态决定需要调用哪个 Skill。随后，系统加载该 Skill 对应的 Prompt 文件，并读取当前业务对象，包括 User Profile、Job Case、Resume、Interview、Reflection 以及所需的 Memory。系统根据 Prompt 模板完成上下文注入后，将完整请求发送至 Gemini。

模型完成推理后，并不会直接返回给用户，而是先经过 Output Validation，检查格式是否正确、规则是否满足、是否需要触发 Tool Call。若需要执行系统操作，则生成标准化 Tool 请求，由后端完成数据库更新。整个过程中，Prompt 始终保持无状态，仅负责当前任务的推理，不直接承担系统执行职责。

---

## 5. Prompt Structure Standard

为了保证不同 Skill 保持一致的行为规范，OfferFlow 为所有 Prompt 制定统一模板。

每一个 Prompt 均包含 Identity、Objective、Input Schema、Output Schema、Constraints、Execution Rules、Reasoning Process、Few-shot Examples、Evaluation Checklist 以及 Version Information 十个部分。

Identity 用于定义当前 Skill 的专业角色，而非聊天人格；Objective 明确当前任务的唯一目标；Input Schema 和 Output Schema 分别规定输入对象和输出数据结构；Constraints 描述业务边界与安全限制；Execution Rules 定义业务规则、Tool 调用规则以及异常处理方式；Reasoning Process 规定模型应遵循的分析流程；Few-shot Examples 提供高质量参考案例；Evaluation Checklist 用于输出前的自动检查；Version Information 负责 Prompt 的版本管理与迭代记录。

通过统一模板，不同 Skill 的 Prompt 能够保持一致的组织形式，提高维护效率，并降低模型行为的不确定性。

---

## 6. Context Injection Strategy

OfferFlow 不采用"长上下文对话"作为主要上下文来源，而采用"按需注入（Context Injection）"策略。

系统根据不同 Skill 自动决定需要注入哪些业务对象。例如 Resume Optimization 会读取 Resume、JD Analysis 与 Job Matching；Interview Preparation 会读取 Reflection 与长期 Memory；JD Analysis 则仅需要当前岗位描述即可。

所有 Prompt 均遵循"最小必要上下文"原则，即只注入完成当前任务所需的信息，而不是简单地将所有历史记录发送给模型。这不仅能够降低 Token 消耗，也能够减少模型注意力分散，提高推理稳定性。

---

## 7. Memory Injection Strategy

Memory 被视为 Prompt 的可选上下文，而不是默认输入。

Workflow 根据 Skill 特性决定是否需要读取 Memory。只有涉及长期成长、能力分析或跨 Job Case 推理时，系统才会主动检索相关 Memory，并以结构化摘要形式注入 Prompt。

Memory 永远不会以完整历史记录的形式提供给模型，而是经过摘要和筛选，仅保留与当前任务高度相关的信息。这种方式能够避免历史信息污染模型推理，同时保证长期知识能够持续发挥作用。

---

## 8. Tool Calling Strategy

Prompt 不直接执行系统操作，而是负责决定"是否需要调用 Tool"。

当模型认为需要创建 Job Case、更新岗位状态、保存 Resume、生成 Task 或写入 Reflection 时，只生成符合规范的 Tool Call 请求，由 Workflow 调度对应 Tool 完成实际执行。

Tool 调用始终遵循"模型负责决策，系统负责执行"的原则，避免 Prompt 直接影响数据库或业务状态，提高整个系统的安全性和可控性。

---

## 9. Prompt Quality Assurance

OfferFlow 将 Prompt 视为可持续优化的产品资产，因此建立统一的质量保障机制。

每一个 Prompt 在正式投入使用前，都应完成结构检查、规则检查、输出检查以及业务验证。Prompt 更新采用版本管理，每一次修改均记录版本号、更新时间、修改原因以及预期效果。当存在多个优化方案时，可通过 A/B Test 比较不同版本 Prompt 的表现，再决定是否正式替换。

这种持续迭代机制，使 Prompt 能够随着产品的发展不断优化，而无需频繁修改业务代码。

---

## 10. Prompt Design Principles

OfferFlow 的 Prompt Engineering Framework 遵循以下原则。

第一，Prompt 只负责推理，不负责业务流程；Workflow 永远负责调度，Tool 永远负责执行。

第二，一个 Prompt 只完成一个 Skill，不承担多个业务目标，保持单一职责。

第三，Prompt 始终围绕业务对象构建上下文，而不是围绕聊天历史构建上下文。

第四，Prompt 输出必须保持标准化，使不同 Skill 能够自由组合，并直接进入 Workflow。

第五，Prompt 与业务代码完全解耦，通过独立文件进行维护和版本管理。

第六，Prompt 的复杂度应保持稳定，优先通过新增 Workflow 或组合 Skill 解决复杂问题，而不是不断堆叠 Prompt 内容。

第七，Prompt 是产品规则的体现，而不仅仅是模型提示词。所有业务约束、行为规范、安全边界以及 Tool 调用规则都应在 Prompt 中明确规定，使模型行为始终符合产品设计目标。

通过以上框架，OfferFlow 将 Prompt 从传统的提示词提升为整个 AI 系统的核心能力规范，使 Prompt、Skill、Workflow、Memory 与 Tool 共同构成完整的 AI Engineering Framework，为整个产品提供稳定、可扩展且可持续演进的智能能力基础。
