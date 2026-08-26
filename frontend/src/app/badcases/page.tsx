"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bug, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";

interface BadcaseFeedback {
  id?: number | null;
  label: string;
  code: string;
  category: string;
  note?: string | null;
}

interface BadcaseItem {
  key: string;
  ai_run_id?: number | null;
  job_case_id: number;
  company?: string | null;
  role?: string | null;
  workflow_name: string;
  agent_key: string;
  agent_name: string;
  agent_display_name: string;
  model_name?: string | null;
  run_status: string;
  original_input?: string | null;
  original_output?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  created_at?: string | null;
  feedbacks: BadcaseFeedback[];
  primary_category: string;
  problem_label: string;
  severity: "high" | "medium";
  suggested_action: string;
}

interface BadcaseResponse {
  summary: {
    total: number;
    high_severity: number;
    by_category: Record<string, number>;
    by_agent: Record<string, {
      agent_key: string;
      agent_name: string;
      agent_display_name: string;
      total: number;
      high_severity: number;
      by_category: Record<string, number>;
    }>;
  };
  items: BadcaseItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  accuracy: "准确性",
  specificity: "具体程度",
  faithfulness: "事实忠实度",
  relevance: "相关性",
  difficulty: "深度",
  tone: "语气",
  system_error: "运行错误",
  other: "其他",
};

const WORKFLOW_LABELS: Record<string, string> = {
  JDAnalysis: "岗位分析",
  JobMatching: "岗位匹配",
  ResumeOptimization: "简历优化",
  InterviewPrep: "面试准备",
  InterviewEvaluation: "面试复盘",
  GreetingGeneration: "沟通话术",
  ContentGeneration: "内容生成",
  Reflection: "复盘记忆",
};

export default function BadcasePage() {
  const [data, setData] = useState<BadcaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/backend-api/badcases")
      .then((response) => {
        if (!response.ok) throw new Error("问题复盘数据加载失败");
        return response.json() as Promise<BadcaseResponse>;
      })
      .then((responseData) => {
        setData(responseData);
        const firstAgent = Object.values(responseData.summary.by_agent).sort((a, b) => b.total - a.total)[0];
        if (firstAgent) setAgentFilter(firstAgent.agent_key);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "问题复盘数据加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const agents = useMemo(() => Object.values(data?.summary.by_agent || {}).sort((a, b) => b.total - a.total), [data]);
  const selectedAgent = agentFilter ? data?.summary.by_agent[agentFilter] : undefined;
  const categories = useMemo(() => Object.keys(selectedAgent?.by_category || {}), [selectedAgent]);
  const items = useMemo(() => (
    (data?.items || []).filter((item) => item.agent_key === agentFilter && (categoryFilter === "all" || item.primary_category === categoryFilter))
  ), [agentFilter, categoryFilter, data]);

  return (
    <main className="min-h-screen flex-1 bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7">
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Bug className="h-6 w-6 text-amber-600" />问题复盘中心</h1>
          <p className="mt-2 text-sm text-slate-500">按智能体聚合用户负反馈和运行记录，针对单个智能体的提示词、规则与数据进行专项优化。</p>
        </div>

        {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在整理问题记录</div>
        ) : data && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">待复盘</p><p className="mt-1 text-2xl font-black text-slate-900">{data.summary.total}</p></div>
              <div className="rounded-xl border border-red-100 bg-red-50/50 p-4"><p className="text-xs text-red-600">高优先级</p><p className="mt-1 text-2xl font-black text-red-700">{data.summary.high_severity}</p></div>
              <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 md:col-span-1"><p className="text-xs text-indigo-600">涉及智能体</p><p className="mt-1 text-2xl font-black text-indigo-700">{agents.length}</p></div>
            </div>

            <div className="mb-5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <p className="px-2 pb-2 pt-1 text-[11px] font-black tracking-wider text-slate-400">选择要优化的智能体</p>
              <div className="flex flex-wrap gap-2">
                {agents.map((agent) => <button key={agent.agent_key} onClick={() => { setAgentFilter(agent.agent_key); setCategoryFilter("all"); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${agentFilter === agent.agent_key ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{agent.agent_display_name}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${agentFilter === agent.agent_key ? "bg-white/20" : "bg-slate-200"}`}>{agent.total}</span></button>)}
              </div>
            </div>

            {selectedAgent && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
              <div><h2 className="font-black text-indigo-900">{selectedAgent.agent_display_name}</h2><p className="mt-0.5 text-xs text-indigo-700/70">{selectedAgent.total} 个待复盘，{selectedAgent.high_severity} 个高优先级</p></div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCategoryFilter("all")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryFilter === "all" ? "bg-slate-900 text-white" : "border border-indigo-100 bg-white text-slate-600"}`}>全部 {selectedAgent.total}</button>
                {categories.map((category) => <button key={category} onClick={() => setCategoryFilter(category)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryFilter === category ? "bg-slate-900 text-white" : "border border-indigo-100 bg-white text-slate-600"}`}>{CATEGORY_LABELS[category] || category} {selectedAgent.by_category[category]}</button>)}
              </div>
            </div>}

            <div className="space-y-4">
              {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">当前筛选下没有问题记录</div>}
              {items.map((item) => {
                const isExpanded = !!expanded[item.key];
                return (
                  <article key={item.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="p-5">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-black text-slate-800">{item.company || "未知公司"} · {item.role || "未知岗位"}</h2>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.severity === "high" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{item.severity === "high" ? "高优先级" : "中优先级"}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{WORKFLOW_LABELS[item.workflow_name] || item.workflow_name} · {item.agent_display_name}{item.ai_run_id ? ` · 运行 #${item.ai_run_id}` : ""}</p>
                        </div>
                        <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{item.problem_label}</span>
                      </div>

                      <div className="mb-3 flex flex-wrap gap-2">{item.feedbacks.map((feedback, index) => <span key={`${feedback.code}-${index}`} className="rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-xs text-red-700">{feedback.label}</span>)}</div>
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 text-sm leading-relaxed text-indigo-900"><Sparkles className="mr-1.5 inline h-4 w-4" /><span className="font-bold">建议动作：</span>{item.suggested_action}</div>

                      <button onClick={() => setExpanded((current) => ({ ...current, [item.key]: !current[item.key] }))} className="mt-4 flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{isExpanded ? "收起运行详情" : "查看原始输入与输出"}
                      </button>
                    </div>

                    {isExpanded && <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 p-5 md:grid-cols-2">
                      <div><h3 className="mb-2 text-xs font-black text-slate-600">原始输入</h3><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">{item.original_input || "无可用输入快照"}</pre></div>
                      <div><h3 className="mb-2 text-xs font-black text-slate-600">原始输出</h3><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">{item.original_output || item.error_message || "无可用输出快照"}</pre></div>
                      {item.error_message && <div className="md:col-span-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{item.error_message}</div>}
                    </div>}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
