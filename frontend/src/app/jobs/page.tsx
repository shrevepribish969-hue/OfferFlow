"use client";

import { useState, useEffect } from "react";
import { Plus, Send, BrainCircuit, ShieldCheck, ChevronRight, X, Loader2, Trash2, Download, Briefcase, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface JobCase {
  id: number;
  company: string;
  role: string;
  status: string;
  match_score: number | null;
  created_at?: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow_data?: any;
}

const JOBS_CACHE_KEY = "offerflow-render-jobs-cache-v1";
const JOBS_FETCH_TIMEOUT_MS = 90_000;
const JOBS_RETRY_DELAYS_MS = [12_000, 25_000, 45_000];

function readCachedJobs(): JobCase[] {
  try {
    const cached = window.localStorage.getItem(JOBS_CACHE_KEY);
    if (!cached) return [];
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedJobs(data: JobCase[]) {
  try {
    window.localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Cache is only a resilience layer; the live database remains authoritative.
  }
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jdContent, setJdContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchJobs = async (attempt = 0, background = false) => {
    try {
      if (!background) setIsLoading(true);
      const response = await fetch("/backend-api/jobs", {
        cache: "no-store",
        signal: AbortSignal.timeout(JOBS_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setJobs(data);
      writeCachedJobs(data);
      setJobsLoadError(null);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
      const cachedJobs = readCachedJobs();
      if (cachedJobs.length > 0) {
        setJobs(cachedJobs);
        setJobsLoadError("线上服务正在唤醒，已先显示上次成功加载的数据。");
      } else {
        setJobsLoadError("线上服务正在唤醒，正在自动重试。");
      }
      const delay = JOBS_RETRY_DELAYS_MS[attempt];
      if (delay) {
        window.setTimeout(() => fetchJobs(attempt + 1, true), delay);
      }
    } finally {
      if (!background) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleDeleteJob = async (jobId: number, e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`/backend-api/jobs/${jobId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        fetchJobs();
      }
    } catch (error) {
      console.error("Failed to delete job:", error);
    }
  };

  const handleUpdateStatus = async (jobId: number, newStatus: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(`/backend-api/jobs/${jobId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        fetchJobs();
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleCreateJob = async () => {
    if (!jdContent.trim()) return;
    try {
      setIsSubmitting(true);
      const response = await fetch("/backend-api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_content: jdContent })
      });
      if (response.ok) {
        const newJob = await response.json();
        setIsModalOpen(false);
        setJdContent("");
        router.push(`/workspace/${newJob.id}`);
      }
    } catch (error) {
      console.error("Failed to create job:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch("/backend-api/export_local", {
        method: "POST"
      });
      if (response.ok) {
        const data = await response.json();
        alert(`导出成功！数据已备份至：\n\n${data.file_path}`);
      } else {
        alert("导出失败，请检查后端服务。");
      }
    } catch (error) {
      console.error("Failed to export data:", error);
      alert("导出失败！");
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.company.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          job.role.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterStatus === "all") return matchesSearch;
    return matchesSearch && job.status.includes(filterStatus);
  });

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto relative">
      {/* Header Area */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-indigo-600" />
            岗位管理中心
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-medium">全生命周期跟踪并推进每一个求职目标。</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportData}
            className="bg-white text-foreground border border-border px-4 py-2.5 rounded-xl font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-secondary/50 transition-all flex items-center gap-2"
          >
            <Download className="w-5 h-5" /> 导出数据
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-indigo-700 transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> 添加新岗位
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="搜索公司名称或岗位..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">状态筛选：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value="all">全部岗位 ({jobs.length})</option>
            <option value="投递">投递中 / 待投递</option>
            <option value="简历">简历优化中</option>
            <option value="面试">面试中</option>
            <option value="Offer">已斩获 Offer</option>
          </select>
        </div>
      </div>

      {/* Job Management Table */}
      <div className="mb-12">
        {jobsLoadError && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <span>{jobsLoadError}</span>
            <button onClick={() => fetchJobs()} className="shrink-0 font-bold hover:text-red-900">重新加载</button>
          </div>
        )}

        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center p-4 border-b border-border bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
             <div className="w-[280px] pl-1">公司与岗位</div>
             <div className="w-[130px] text-center">当前阶段/状态</div>
             <div className="flex-1 px-4">AI 匹配度分值</div>
             <div className="w-[180px] text-right pr-9">最后更新时间</div>
          </div>
          
          {isLoading ? (
            <div className="p-12 flex justify-center items-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-12 flex flex-col justify-center items-center text-muted-foreground text-center">
              <BrainCircuit className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-bold text-slate-600">未找到符合条件的岗位</p>
              <p className="text-xs text-slate-400 mt-1">请尝试更换搜索词或点击右上角添加新岗位</p>
            </div>
          ) : filteredJobs.map((job) => {
            const sourceUrl = job.workflow_data?.source_url || job.workflow_data?.apply_status?.link;
            const hasSourceUrl = typeof sourceUrl === "string" && /^https?:\/\//i.test(sourceUrl);
            return (<div 
              key={job.id} 
              className="flex items-center p-4 border-b border-border hover:bg-slate-50/80 transition group relative"
            >
               <Link href={`/workspace/${job.id}`} className="flex items-center gap-4 w-[280px]">
                 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm text-white font-bold text-xs">
                   {job.company.substring(0,2)}
                 </div>
                 <div>
                   <h3 className="font-bold text-sm text-foreground hover:text-indigo-600 transition-colors">{job.company}</h3>
                   <p className="text-xs text-muted-foreground mt-0.5 font-medium">{job.role}</p>
                 </div>
               </Link>
               
               <div className="w-[130px] flex justify-center">
                 <select
                   value={job.status}
                   onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                   onChange={(e) => handleUpdateStatus(job.id, e.target.value, e)}
                   className={`px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wide border-none outline-none cursor-pointer appearance-none text-center shadow-sm
                    ${job.status.includes('面试中') || job.status.includes('面试') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 
                      job.status.includes('优化') || job.status.includes('分析') || job.status.includes('投递中') ? 'bg-green-50 text-green-600 border border-green-100' : 
                      job.status.includes('Offer') ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600'}`}
                 >
                   <option value="等待处理">等待处理</option>
                   <option value="投递中">投递中</option>
                   <option value="简历优化中">简历优化中</option>
                   <option value="面试中">面试中</option>
                   <option value="已发 Offer">已发 Offer</option>
                   <option value="已挂">已挂</option>
                 </select>
               </div>
               
               <div className="flex-1 px-4 flex items-center gap-3 relative group/score">
                 {job.match_score ? (
                   <>
                     <div className="h-2 w-full max-w-[120px] bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div className="h-full bg-indigo-600" style={{ width: `${job.match_score}%` }}></div>
                     </div>
                     <div className="flex items-center gap-1 cursor-help">
                       <span className="text-xs font-extrabold text-slate-800">匹配度 {job.match_score}%</span>
                     </div>
                     
                     {/* Score Breakdown Tooltip */}
                     {job.workflow_data?.job_matching_result?.job_matching_result?.score_breakdown && (
                       <div className="absolute left-4 top-full mt-2 w-64 bg-white border border-border rounded-xl shadow-xl p-4 z-50 opacity-0 invisible group-hover/score:opacity-100 group-hover/score:visible transition-all duration-200">
                         <div className="text-[11px] font-bold text-muted-foreground mb-2 pb-2 border-b border-border uppercase tracking-wider">
                           匹配度得分细则
                         </div>
                         <div className="space-y-2 text-xs">
                           <div className="flex justify-between items-center">
                             <span className="text-muted-foreground flex items-center gap-1">
                               {job.workflow_data?.job_matching_result?.job_matching_result?.education_match ? "✓" : "✗"} 学历
                             </span>
                             <span className="font-semibold">{job.workflow_data?.job_matching_result?.job_matching_result?.score_breakdown?.education}/10</span>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-muted-foreground flex items-center gap-1">
                               {job.workflow_data?.job_matching_result?.job_matching_result?.experience_match ? "✓" : "✗"} 经验
                             </span>
                             <span className="font-semibold">{job.workflow_data?.job_matching_result?.job_matching_result?.score_breakdown?.experience}/20</span>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-muted-foreground">核心技能 (Must)</span>
                             <span className="font-semibold">{job.workflow_data?.job_matching_result?.job_matching_result?.score_breakdown?.must_skills}/40</span>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-muted-foreground">优先技能 (Preferred)</span>
                             <span className="font-semibold">{job.workflow_data?.job_matching_result?.job_matching_result?.score_breakdown?.preferred_skills}/30</span>
                           </div>
                           <div className="pt-2 mt-2 border-t border-border flex justify-between items-center font-bold">
                             <span>总分</span>
                             <span className="text-indigo-600">{job.match_score}</span>
                           </div>
                         </div>
                       </div>
                     )}
                   </>
                 ) : (
                   <span className="text-xs font-bold text-slate-400">暂无评分</span>
                 )}
               </div>
               
               <div className="w-[180px] flex items-center justify-end gap-2 text-xs text-muted-foreground font-medium">
                 更新于 {job.updated_at ? formatDate(job.updated_at) : formatDate(new Date().toISOString())}

                 {hasSourceUrl && (
                   <a
                     href={sourceUrl}
                     target="_blank"
                     rel="noopener noreferrer"
                     title="打开原招聘页面"
                     aria-label={`打开 ${job.company} 原招聘页面`}
                     onClick={(e) => e.stopPropagation()}
                     className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                   >
                     <ExternalLink className="w-4 h-4" />
                   </a>
                 )}
                 
                 <button
                   className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition ml-1"
                   title="双击删除此卡片"
                   onClick={(e) => {
                     e.preventDefault();
                     e.stopPropagation();
                   }}
                   onDoubleClick={(e) => {
                     e.preventDefault();
                     e.stopPropagation();
                     handleDeleteJob(job.id, e);
                   }}
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
                 
                 <ChevronRight className="w-4 h-4 text-border group-hover:text-indigo-600 transition-colors" />
               </div>
            </div>);
          })}
          
          <div className="p-4 text-center border-t border-border bg-slate-50/50">
             <button onClick={() => setIsModalOpen(true)} className="text-xs font-bold text-indigo-600 hover:underline flex items-center justify-center gap-1 mx-auto">
               <Plus className="w-3.5 h-3.5" /> 添加新岗位
             </button>
          </div>
        </div>
      </div>

      {/* New Job Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold">新建 Job Case</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">上传或粘贴 JD (岗位描述)</label>
                <textarea 
                  value={jdContent}
                  onChange={(e) => setJdContent(e.target.value)}
                  placeholder="请在此粘贴 JD 文本..."
                  className="w-full h-40 p-4 border border-border rounded-xl bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary transition flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> 上传 PDF/Word
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-border bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">取消</button>
              <button 
                onClick={handleCreateJob}
                disabled={!jdContent.trim() || isSubmitting}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                提交并由 AI 分析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
