import React, { useRef, useEffect, useState } from 'react';
import { Send, Sparkles, Command, Loader2, CheckCircle2, Circle, Terminal, Compass, Info, X, ThumbsUp, AlertTriangle, Ban, PanelRightOpen, Bot } from 'lucide-react';

export interface NextBestAction {
  key: string;
  status: string;
  title: string;
  reason: string;
  risk?: string;
  primaryLabel: string;
}

export interface FeedbackEvent {
  id: number;
  message_id?: string | null;
  card_type?: string | null;
  feedback: string;
  feedback_type: string;
  event_data?: {
    ai_run_id?: number;
    feedback_code?: string;
    feedback_category?: string;
    feedback_label?: string;
    [key: string]: any;
  } | null;
  created_at?: string | null;
}

export interface AIRun {
  id: number;
  workflow_name: string;
  agent_name?: string | null;
  status: string;
  model_name?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  run_data?: {
    card_type?: string;
    artifact_count?: number | null;
    sidebar_summary?: string | null;
    [key: string]: any;
  } | null;
  started_at?: string | null;
}

interface AiCopilotSidebarProps {
  messages: any[];
  input: string;
  setInput: (val: string) => void;
  isSending: boolean;
  onSend: (text: string) => void;
  suggestedActions: string[];
  nextBestAction?: NextBestAction | null;
  onRunNextAction?: () => void;
  onDismissNextAction?: () => void;
  feedbackEvents?: FeedbackEvent[];
  onSubmitFeedback?: (payload: { message_id?: string; card_type?: string; feedback: string; feedback_type?: string; feedback_code?: string; feedback_category?: string; ai_run_id?: number }) => Promise<void> | void;
  aiRuns?: AIRun[];
  activeStageLabel?: string;
  isCanvasOpen?: boolean;
  onOpenCanvas?: (cardType?: string, data?: any) => void;
}

type FeedbackOption = {
  label: string;
  type: "quality" | "badcase_candidate";
  code: string;
  category: string;
};

const DEFAULT_FEEDBACK_OPTIONS: FeedbackOption[] = [
  { label: "有帮助", type: "quality", code: "helpful", category: "user_accepted" },
  { label: "不准确", type: "badcase_candidate", code: "accuracy_error", category: "accuracy" },
  { label: "太空泛", type: "badcase_candidate", code: "too_generic", category: "specificity" },
];

const FEEDBACK_OPTIONS_BY_CARD: Record<string, FeedbackOption[]> = {
  ResumeOptimizer: [
    { label: "有帮助", type: "quality", code: "helpful", category: "user_accepted" },
    { label: "不准确", type: "badcase_candidate", code: "accuracy_error", category: "accuracy" },
    { label: "太空泛", type: "badcase_candidate", code: "too_generic", category: "specificity" },
    { label: "有编造风险", type: "badcase_candidate", code: "fabrication_risk", category: "faithfulness" },
  ],
  InterviewPrep: [
    { label: "有帮助", type: "quality", code: "helpful", category: "user_accepted" },
    { label: "不相关", type: "badcase_candidate", code: "irrelevant", category: "relevance" },
    { label: "太简单", type: "badcase_candidate", code: "too_simple", category: "difficulty" },
    { label: "需要追问", type: "quality", code: "needs_followup", category: "coverage" },
  ],
  InterviewEvaluation: [
    { label: "有帮助", type: "quality", code: "helpful", category: "user_accepted" },
    { label: "不准确", type: "badcase_candidate", code: "accuracy_error", category: "accuracy" },
    { label: "太空泛", type: "badcase_candidate", code: "too_generic", category: "specificity" },
    { label: "需要追问", type: "quality", code: "needs_followup", category: "coverage" },
  ],
  GreetingGeneration: [
    { label: "可以使用", type: "quality", code: "ready_to_use", category: "user_accepted" },
    { label: "太正式", type: "badcase_candidate", code: "too_formal", category: "tone" },
    { label: "太随意", type: "badcase_candidate", code: "too_casual", category: "tone" },
    { label: "有不真实表述", type: "badcase_candidate", code: "fabrication_risk", category: "faithfulness" },
  ],
};

export const AiCopilotSidebar = ({
  messages,
  input,
  setInput,
  isSending,
  onSend,
  suggestedActions,
  nextBestAction,
  onRunNextAction,
  onDismissNextAction,
  feedbackEvents = [],
  onSubmitFeedback,
  aiRuns = [],
  activeStageLabel,
  isCanvasOpen,
  onOpenCanvas,
}: AiCopilotSidebarProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const positionedWelcomeRef = useRef(false);
  const [showReason, setShowReason] = useState(false);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"chat" | "logs">("chat");
  useEffect(() => {
    if (messages[0]?.id === "case-agent-welcome" && !positionedWelcomeRef.current) {
      positionedWelcomeRef.current = true;
      messagesContainerRef.current?.scrollTo({ top: 0 });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setShowReason(false);
  }, [nextBestAction?.key]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    const message = input.trim();
    setInput("");
    onSend(message);
  };

  const getMessageKey = (msg: any, idx: number) => msg.id || `${msg.card_type || msg.type || msg.role}-${idx}`;

  const getFeedbackOptions = (cardType?: string) => {
    return cardType ? FEEDBACK_OPTIONS_BY_CARD[cardType] || DEFAULT_FEEDBACK_OPTIONS : DEFAULT_FEEDBACK_OPTIONS;
  };

  const getFeedbackIcon = (option: FeedbackOption) => {
    const label = option.label;
    if (label.includes("帮助") || label.includes("可以")) return <ThumbsUp className="w-3 h-3" />;
    if (option.code === "fabrication_risk") return <AlertTriangle className="w-3 h-3" />;
    return <Ban className="w-3 h-3" />;
  };

  const handleFeedbackClick = async (msg: any, idx: number, option: FeedbackOption) => {
    const messageKey = getMessageKey(msg, idx);
    setFeedbackByMessage((prev) => ({ ...prev, [messageKey]: option.label }));
    await onSubmitFeedback?.({
      message_id: msg.id?.toString(),
      card_type: msg.card_type,
      feedback: option.label,
      feedback_type: option.type,
      feedback_code: option.code,
      feedback_category: option.category,
      ai_run_id: msg.data?.ai_run_id,
    });
  };

  const renderFeedbackBar = (msg: any, idx: number) => {
    const messageKey = getMessageKey(msg, idx);
    const selectedFeedback = feedbackByMessage[messageKey];
    const options = getFeedbackOptions(msg.card_type);

    return (
      <div className="mt-2 border-t border-slate-100 pt-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          AI Feedback
        </div>
        {selectedFeedback ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
              已记录：{selectedFeedback}
            </div>
            <button
              onClick={() => setFeedbackByMessage((prev) => {
                const next = { ...prev };
                delete next[messageKey];
                return next;
              })}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              修改
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <button
                key={option.code}
                onClick={() => handleFeedbackClick(msg, idx, option)}
                className="px-2 py-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-500 hover:text-indigo-700 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1"
              >
                {getFeedbackIcon(option)}
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAiRunLog = () => {
    if (!aiRuns.length) return null;
    const recentRuns = aiRuns.slice(0, 5);

    const getRunSummary = (run: AIRun) => {
      const rawSummary = (run.error_message || run.output_summary || "").trim();
      const isEmptySummary = !rawSummary || rawSummary.includes("Summary unavailable") || rawSummary === "Task completed.";
      if (!isEmptySummary) return rawSummary;

      const summaryByWorkflow: Record<string, string> = {
        JDAnalysis: "已完成岗位 JD 结构化分析",
        JobMatching: "已完成岗位匹配分析",
        ResumeOptimization: "已生成简历定向优化建议，请在中间工作区查看",
        ContentGeneration: "已生成最终内容版本",
        InterviewPrep: "已生成面试准备内容",
        InterviewEvaluation: "已完成面试评估与复盘",
        GreetingGeneration: "已生成投递沟通话术",
        UpdateJobCase: "已更新 Job Case 状态",
      };

      if (run.status === "failed") return "执行失败，请查看错误信息或重新生成";
      if (run.status === "running") return "正在执行中";
      return summaryByWorkflow[run.workflow_name] || "AI 任务已完成";
    };

    const getRunTrigger = (run: AIRun) => {
      const input = (run.input_summary || "").trim();
      if (!input || input === "system_trigger") {
        return "由系统按钮、Case Manager 建议或当前流程状态触发";
      }
      return `用户输入：${input.length > 80 ? `${input.slice(0, 80)}...` : input}`;
    };

    const getRunContext = (workflowName: string) => {
      const contextByWorkflow: Record<string, string> = {
        JDAnalysis: "原始 JD 文本",
        JobMatching: "JD 分析结果、基础简历 / 用户画像",
        ResumeOptimization: "JD 分析结果、岗位匹配结果、基础简历",
        ContentGeneration: "已采纳的简历优化建议、基础简历",
        InterviewPrep: "JD 分析结果、简历版本、故事库 / 记忆",
        InterviewEvaluation: "面试记录、面试准备包、岗位上下文",
        GreetingGeneration: "Job Case、JD 要点、简历亮点",
        UpdateJobCase: "当前 Job Case 状态",
      };
      return contextByWorkflow[workflowName] || "当前 Job Case 上下文";
    };

    const getRelatedFeedback = (run: AIRun) => {
      return feedbackEvents.filter((event) => {
        if (event.event_data?.ai_run_id === run.id) return true;
        const runCardType = run.run_data?.card_type;
        return Boolean(runCardType && event.card_type === runCardType);
      });
    };

    const getLatestFeedback = (run: AIRun) => {
      return getRelatedFeedback(run)[0] || null;
    };

    const getFeedbackQualityLabel = (event: FeedbackEvent) => {
      const categoryLabels: Record<string, string> = {
        user_accepted: "用户认可",
        accuracy: "准确性问题",
        specificity: "内容太泛",
        faithfulness: "真实性风险",
        relevance: "相关性问题",
        difficulty: "难度不合适",
        coverage: "需要补充追问",
        tone: "语气问题",
        format: "格式问题",
      };
      const category = event.event_data?.feedback_category;
      if (category && categoryLabels[category]) return categoryLabels[category];
      return event.feedback_type === "badcase_candidate" ? "Badcase" : "用户认可";
    };

    return (
      <div className="px-4 pb-4 border-b border-slate-200 bg-white">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">AI Work Log</div>
            <div className="text-[11px] text-slate-400">{aiRuns.length} 次</div>
          </div>
          <div className="space-y-1.5">
            {recentRuns.map((run) => {
              const latestFeedback = getLatestFeedback(run);

              return (
                <details key={run.id} className="group rounded-lg bg-white border border-slate-100 px-3 py-3">
                  <summary className="list-none cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{run.workflow_name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{run.agent_name || "Agent"} · {run.model_name || "model"}</div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      run.status === "success"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : run.status === "failed"
                        ? "bg-rose-50 text-rose-700 border border-rose-100"
                        : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                    }`}>
                      {run.status}
                    </span>
                  </div>
                  </summary>

                  <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500 leading-relaxed">
                    <div><span className="font-bold text-slate-600">为什么执行：</span>{getRunTrigger(run)}</div>
                    <div><span className="font-bold text-slate-600">使用了：</span>{getRunContext(run.workflow_name)}</div>
                    <div><span className="font-bold text-slate-600">产出了：</span>{getRunSummary(run)}</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <span className="font-bold text-slate-600">反馈：</span>
                        {latestFeedback ? (
                          <>
                            <span className="truncate">{latestFeedback.feedback}</span>
                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              latestFeedback.feedback_type === "badcase_candidate"
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            }`}>
                              {getFeedbackQualityLabel(latestFeedback)}
                            </span>
                          </>
                        ) : (
                          <span className="text-emerald-700">默认通过（未收到负向反馈）</span>
                        )}
                      </div>
                      {typeof run.latency_ms === "number" && <span className="shrink-0 text-slate-400">{(run.latency_ms / 1000).toFixed(1)}s</span>}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMessage = (msg: any, idx: number) => {
    if (msg.is_system_hidden) return null;

    if (msg.role === 'user') {
      return (
        <div key={idx} className="flex justify-end mb-4">
          <div className="bg-indigo-50 text-indigo-900 px-3 py-2 rounded-xl text-sm max-w-[85%] border border-indigo-100">
            {msg.content}
          </div>
        </div>
      );
    }

    if (msg.type === 'agent_run') {
      if (msg.is_completed) return null;
      return (
        <div key={idx} className="mb-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            <span>{msg.main_status}</span>
          </div>
          {msg.steps && msg.steps.length > 0 && (
            <div className="ml-1.5 pl-3 border-l-2 border-slate-200 space-y-1.5 py-1">
              {msg.steps.map((step: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                  {step.status === 'done' ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <Circle className="w-3 h-3 animate-pulse text-slate-400" />
                  )}
                  <span>{step.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (msg.type === 'card') {
      if (msg.card_type === "GreetingGeneration") {
        return (
          <div key={idx} className="flex gap-2 mb-4 max-w-[84%]">
            <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl rounded-tl-none text-sm text-slate-700 shadow-sm whitespace-pre-wrap">
              <div className="font-bold mb-2 text-indigo-700">为您生成的专属打招呼语：</div>
              {msg.data?.preview}
              {renderFeedbackBar(msg, idx)}
            </div>
          </div>
        );
      }

      let stageName = "任务";
      if (msg.card_type === "ExecutionSummary") stageName = "JD 解析";
      if (msg.card_type === "MatchAnalysis") stageName = "岗位匹配";
      if (msg.card_type === "ResumeOptimizer") stageName = "简历优化";
      if (msg.card_type === "InterviewPrep") stageName = "面试预测";
      if (msg.card_type === "InterviewEvaluation") stageName = "面试复盘";
      if (msg.card_type === "ApplicationStatus") stageName = "投递记录";
      const isErrorCard = typeof msg.content === "string" && msg.content.startsWith("Error:");
      let conversationContent = msg.content || "分析已经完成。";
      if (msg.card_type === "MatchAnalysis" && msg.data?.match_data) {
        const matchData = msg.data.match_data;
        const formatItems = (items: any) => Array.isArray(items)
          ? items.slice(0, 3).map((item: any) => typeof item === "string" ? item : item?.name || item?.skill || item?.requirement || "").filter(Boolean).join("、")
          : "";
        const strengths = formatItems(matchData.matching_skills);
        const gaps = formatItems(matchData.gap_skills);
        conversationContent = `初步结论：综合匹配度约为 ${matchData.score}%。“${strengths ? `你的主要优势是${strengths}` : "你的经历与岗位存在一定匹配点"}；${gaps ? `需要重点补强${gaps}` : "暂未发现明显的硬性能力缺口"}。”${matchData.reason ? ` ${matchData.reason}` : ""}`;
      }
      if (msg.card_type === "ResumeOptimizer") {
        const patchCount = Array.isArray(msg.data?.optimization_patches) ? msg.data.optimization_patches.length : 0;
        conversationContent = patchCount > 0
          ? `我已经整理出 ${patchCount} 条可逐项确认的简历修改建议。`
          : "简历修改建议已经整理完成。";
      }
      
      return (
        <div key={idx} className="flex gap-2 mb-4 max-w-[84%]">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isErrorCard ? "bg-red-100" : "bg-slate-200"}`}>
            {isErrorCard ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> : <Terminal className="w-3.5 h-3.5 text-slate-600" />}
          </div>
          <div className={`min-w-0 bg-white border px-3 py-2.5 rounded-xl rounded-tl-none text-sm shadow-sm whitespace-pre-wrap font-medium ${isErrorCard ? "border-red-200 text-red-700" : "border-slate-200 text-slate-700"}`}>
            {isErrorCard
              ? `[${stageName}] 生成失败：${msg.content.replace(/^Error:\s*/, "")}`
              : <>
                  <div className="font-bold text-slate-900 mb-1">{stageName}</div>
                  <div className="font-normal leading-relaxed line-clamp-3">{conversationContent}</div>
                </>}
            {!isErrorCard && onOpenCanvas && (
              <button
                onClick={() => onOpenCanvas(msg.card_type, msg.data)}
                className="mt-2.5 inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors items-center gap-1.5"
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
                打开成果
              </button>
            )}
            {renderFeedbackBar(msg, idx)}
          </div>
        </div>
      );
    }

    return (
      <div key={idx} className="flex gap-2 mb-4 max-w-[95%]">
        <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl rounded-tl-none text-sm text-slate-700 shadow-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full bg-white h-full flex flex-col relative overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-b from-indigo-50/80 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <Bot className="w-5 h-5" />
              <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${isSending ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900">OfferFlow Case Agent</h2>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-100">ACTIVE</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {isSending ? "正在处理你的请求…" : activeStageLabel ? `正在查看：${activeStageLabel}` : "先理解你的目标，再灵活推进下一步"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              activeTab === "chat" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Agent 对话
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              activeTab === "logs" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            运行轨迹
          </button>
        </div>
      </div>

      {activeTab === "chat" && nextBestAction && (
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-indigo-500 tracking-wider">下一步建议</div>
                  <div className="text-sm font-bold text-slate-900">{nextBestAction.title}</div>
                </div>
              </div>
              {onDismissNextAction && (
                <button
                  onClick={onDismissNextAction}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-white rounded-md transition-colors"
                  aria-label="Dismiss recommendation"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mt-3 text-xs text-slate-600 leading-relaxed">
              <span className="font-bold text-slate-700">当前状态：</span>{nextBestAction.status}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={onRunNextAction}
                disabled={isSending}
                className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {isSending ? "处理中..." : nextBestAction.primaryLabel}
              </button>
              <button
                onClick={() => setShowReason((value) => !value)}
                className="px-3 py-2 bg-white border border-indigo-100 hover:border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" />
                理由
              </button>
            </div>

            {showReason && (
              <div className="mt-3 rounded-lg bg-white border border-indigo-100 p-3 text-xs text-slate-600 leading-relaxed space-y-2">
                <p>{nextBestAction.reason}</p>
                {nextBestAction.risk && (
                  <p><span className="font-bold text-amber-700">风险提醒：</span>{nextBestAction.risk}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "logs" ? (
        <div className="flex-1 overflow-y-auto bg-slate-50/30 py-4">
          {renderAiRunLog()}
          {!aiRuns.length && (
            <div className="mx-4 rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-400">
              暂无日志。触发一次 AI 任务后，这里会显示记录。
            </div>
          )}
        </div>
      ) : (
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
          {messages.map((msg, idx) => renderMessage(msg, idx))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {activeTab === "chat" && (
      <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-3">
        {suggestedActions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Command className="w-3 h-3" /> 接下来
            </span>
            <div className="flex flex-wrap gap-2">
              {suggestedActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => onSend(action)}
                  disabled={isSending}
                  className="flex-none px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-700 rounded-full text-xs font-medium transition-all"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative flex items-end border border-slate-200 rounded-xl bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all p-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="告诉我你现在想解决什么，或继续追问…"
            className="w-full bg-transparent outline-none text-sm p-2 min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 shrink-0 m-1"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
      )}
    </div>
  );
};
