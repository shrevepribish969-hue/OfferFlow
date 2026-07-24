# Workflow Planning 评测修复计划

## Goal Description
第 8 个核心 Skill：`Workflow Planning` 是一个非常特殊的“纯动作节点”。它的任务是根据用户的求职状态（如“已投递”、“安排面试”）生成对应的任务（Create_Task）。

您可能注意到了，刚才它在测试中瞬间拿到了 100 分。**但这是一个“假性满分”**！
因为目前的 `eval_engine.py` 并不支持读取旧版 Golden Dataset 中配置的 `rule_based_check`。由于原版要求大模型不输出任何分析结果（直接输出 `tool_calls`），Evaluator 在没有任何校验标尺的情况下，直接给它放行了。

为了让这个总控调度节点也纳入坚固的质量防线，我们需要进行重构。

## Proposed Changes

### 1. 升级 Output Schema (引入解释性黑盒)
以前模型只输出冷冰冰的 `tool_calls`，一旦规划出错，我们连原因都找不到。
修改 `prompts/260713Prompt_Workflow_Planning.md`：
- 要求大模型首先输出 `workflow_planning_result`，包含 `analysis_confidence` 和 `planning_rationale`（一句话解释为什么派发这些任务）。
- 依然保持严苛的任务数量限制（< 3 个）。
- 增加 Error Code Contract：如果遇到的状态完全无法解析（如传入了一堆乱码或者未知状态），严格输出 `UNKNOWN_STATUS` 错误码。

### 2. 修复 Golden Dataset (激活评测引擎)
修改 `evaluation/workflow_planning/golden_dataset.json`：
- 废除无法运行的 `rule_based_check`。
- 启用针对 `tool_calls` 的 `semantic_match`。例如 Case 1 中，检测生成的任务里是否包含 `"Mock Interview"`, `"Research Company"`。从而真正验证它是否派发了正确的任务！

### 3. 扩充异常阻断测试
修改 `evaluation/workflow_planning/test_cases.json`：
- 新增 Case 3 (Unknown Status)，传入一个非标准的、乱码形式的状态，测试大模型能否坚守底线，正确抛出异常错误码。

---

## User Review Required

> [!TIP]
> 大模型在执行任务分发时，加入一层简单的 `planning_rationale` (规划理由) 也就是我们在提示词工程里常说的 CoT（Chain of Thought），不仅方便我们在后台排查 Bug，更能显著提高它最终分配任务的合理性。
> 
> 如果您觉得为这个纯动作节点增加“思考黑盒”并激活真实评测的方案可行，请点击 **Proceed**，我将为您光速拿下这第 8 个节点！
