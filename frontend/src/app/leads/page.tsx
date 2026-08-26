"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, Briefcase, ChevronRight, X, ExternalLink, Activity, Send, CheckCircle2, ShieldCheck, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface JobLead {
  id: number;
  company: string;
  role: string;
  source_url: string;
  status: "unscreened" | "analyzed" | "promoted" | "rejected" | "error";
  match_score: number | null;
  analysis_reason: string | null;
  created_at: string;
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<JobLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Bulk import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchLeads = async () => {
    try {
      const res = await fetch("/backend-api/leads");
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    // Poll every 3 seconds to catch async analysis updates
    const interval = setInterval(fetchLeads, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const response = await fetch("/backend-api/leads/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd_content: importText
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || `提交失败（HTTP ${response.status}）`);
      }
      setShowImportModal(false);
      setImportText("");
      fetchLeads();
    } catch (e) {
      console.error(e);
      setImportError(e instanceof Error ? e.message : "提交失败，请稍后重试。");
    } finally {
      setIsImporting(false);
    }
  };

  const handleRetry = async (id: number) => {
    try {
      const res = await fetch(`/backend-api/leads/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(`重新识别失败（HTTP ${res.status}）`);
      await fetchLeads();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePromote = async (id: number) => {
    try {
      const res = await fetch(`/backend-api/leads/${id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/workspace/${data.job_case_id}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: number) => {
    try {
      const res = await fetch(`/backend-api/leads/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchLeads();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-slate-400 bg-slate-100";
    if (score >= 80) return "text-emerald-600 bg-emerald-100";
    if (score >= 60) return "text-amber-600 bg-amber-100";
    return "text-rose-600 bg-rose-100";
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="p-8 border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 mb-2">
              <Search className="w-8 h-8 text-indigo-600" />
              官网线索池 (Leads Pool)
            </h1>
            <p className="text-slate-500 font-medium">在全网收集JD线索，让AI帮你做第一轮筛选与打分，告别低效海投。</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowImportModal(true)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              快速导入JD
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-4" />
              <p className="text-slate-500">正在加载线索...</p>
            </div>
          ) : leads.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 border-dashed">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">线索池还是空的</h3>
              <p className="text-slate-500 mb-6">点击右上角"快速导入JD"，或者使用 Chrome 插件一键抓取官网JD。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {leads.map((lead) => (
                <div key={lead.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="p-5 border-b border-slate-100 flex-1">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-lg text-slate-800 line-clamp-1" title={lead.role || "未提取出岗位"}>
                          {lead.role || "未提取出岗位"}
                        </h3>
                        <p className="text-slate-500 text-sm flex items-center gap-1.5 mt-1">
                          <Briefcase className="w-4 h-4" />
                          {lead.company || "未提取出公司"}
                        </p>
                      </div>
                      
                      <div className={`px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-1.5 whitespace-nowrap ${getScoreColor(lead.match_score)}`}>
                        {lead.status === "unscreened" && <Loader2 className="w-4 h-4 animate-spin" />}
                        {lead.status === "unscreened" ? "分析中" : lead.status === "error" ? "分析失败" : `${lead.match_score}分`}
                      </div>
                    </div>
                    
                    {lead.source_url && (
                      <a href={lead.source_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-1 mb-3">
                        <ExternalLink className="w-3 h-3" />
                        查看 JD 原文
                      </a>
                    )}
                    
                    <div className="mt-4 bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
                      <span className="font-bold text-slate-700 block mb-1">💡 AI 初筛建议：</span>
                      {lead.status === "unscreened" ? (
                        <span className="text-slate-400">请稍后，AI 正在分析简历匹配度...</span>
                      ) : (
                        lead.analysis_reason || "无额外建议。"
                      )}
                    </div>
                  </div>
                  
                  <div className="p-3 bg-slate-50 flex gap-2">
                    <button 
                      onClick={() => handleReject(lead.id)}
                      className="flex-1 py-2 rounded-xl text-slate-500 hover:bg-slate-200 font-medium text-sm transition-colors"
                    >
                      忽略
                    </button>
                    <button 
                      onClick={() => handlePromote(lead.id)}
                      disabled={lead.status === "unscreened" || lead.status === "promoted" || lead.status === "error"}
                      className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      确认投递
                    </button>
                    {lead.status === "error" && (
                      <button
                        onClick={() => handleRetry(lead.id)}
                        className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-colors"
                      >
                        重新识别
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">快速导入 JD 线索</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              <textarea 
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="在此粘贴大段的岗位要求、职责描述。AI 会自动帮您提取公司名称、岗位名称并打分..."
                className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none text-slate-700"
              />
              {importError && <p className="mt-3 text-sm font-medium text-red-600">{importError}</p>}
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-6 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleImport}
                disabled={isImporting || !importText.trim()}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                提交并自动分析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
