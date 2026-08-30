"use client";

import { useState, useEffect } from "react";
import { Plus, Send, BrainCircuit, ShieldCheck, Trophy, ChevronRight, X, Loader2, Download, Calendar, Clock, ExternalLink, ArrowRight, LayoutGrid, List, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

interface ScheduleTask {
  id: string;
  jobId: number;
  company: string;
  role: string;
  dateStr: string; // YYYY-MM-DD
  link?: string;
  completed: boolean;
}

const JOBS_CACHE_KEY = "offerflow-render-jobs-cache-v1";
const JOBS_FETCH_TIMEOUT_MS = 90_000;
const JOBS_RETRY_DELAYS_MS = [12_000, 25_000, 45_000];

function readCachedJobs(cacheKey = JOBS_CACHE_KEY): JobCase[] {
  try {
    const cached = window.localStorage.getItem(cacheKey);
    if (!cached) return [];
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedJobs(data: JobCase[], cacheKey = JOBS_CACHE_KEY) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    // Cache is only a resilience layer; the live database remains authoritative.
  }
}

export function Dashboard({ demoMode = false }: { demoMode?: boolean }) {
  const router = useRouter();
  const apiBase = demoMode ? "/backend-api/demo/jobs" : "/backend-api/jobs";
  const jobsCacheKey = demoMode ? `${JOBS_CACHE_KEY}-public-demo` : JOBS_CACHE_KEY;
  const workspaceHref = (jobId: number) => `/workspace/${jobId}${demoMode ? "?demo=1" : ""}`;
  const [jobs, setJobs] = useState<JobCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jdContent, setJdContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeView, setTimeView] = useState<"day" | "week" | "month">("day");
  
  // 7-Day Schedule Board State
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0); // 0 = Today
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [completedTasksLoaded, setCompletedTasksLoaded] = useState(false);
  const [scheduleViewMode, setScheduleViewMode] = useState<"list" | "matrix">("list");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("offerflow-completed-schedule-tasks");
      if (saved) setCompletedTaskIds(JSON.parse(saved));
    } catch (error) {
      console.error("Failed to load completed schedule tasks:", error);
    } finally {
      setCompletedTasksLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!completedTasksLoaded) return;
    window.localStorage.setItem(
      "offerflow-completed-schedule-tasks",
      JSON.stringify(completedTaskIds),
    );
  }, [completedTaskIds, completedTasksLoaded]);

  // Generate next 7 days list starting from today
  const getNext7Days = () => {
    const days = [];
    const weekMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const label = i === 0 ? "今天" : i === 1 ? "明天" : weekMap[d.getDay()];
      const shortDate = `${d.getMonth() + 1}/${d.getDate()}`;
      days.push({
        index: i,
        dateStr,
        label,
        shortDate,
        dayOfWeek: weekMap[d.getDay()],
        isToday: i === 0
      });
    }
    return days;
  };
  const weekDays = getNext7Days();

  // Helper to extract 7-day schedule tasks from job cases
  const getAllScheduleTasks = (): ScheduleTask[] => {
    const tasks: ScheduleTask[] = [];
    const todayStr = weekDays[0].dateStr;

    jobs.forEach((j) => {
      const applyStatus = j.workflow_data?.apply_status;

      // 1. 投递跟进 / 追溯任务 (Only if a reminder_time is explicitly set)
      if (applyStatus && applyStatus.reminder_time) {
        let rawDate = applyStatus.reminder_time;
        let parsedDate = todayStr;
        
        // 尝试提取 YYYY-MM-DD 或 YYYY年MM月DD日
        const dateMatch = rawDate.match(/(20\d{2})[-年/.]?(\d{1,2})[-月/.]?(\d{1,2})/);
        if (dateMatch) {
          parsedDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
        } else if (rawDate.match(/^\d{1,2}月\d{1,2}日/)) {
          // 只有月日的情况，补充今年
          const mdMatch = rawDate.match(/^(\d{1,2})月(\d{1,2})日/);
          if (mdMatch) {
            parsedDate = `${new Date().getFullYear()}-${mdMatch[1].padStart(2, '0')}-${mdMatch[2].padStart(2, '0')}`;
          }
        } else if (rawDate.includes("-")) {
          parsedDate = rawDate;
        }

        tasks.push({
          id: `apply-${j.id}`,
          jobId: j.id,
          company: j.company,
          role: j.role,
          dateStr: parsedDate,
          link: applyStatus.link,
          completed: completedTaskIds.includes(`apply-${j.id}`)
        });
      }
    });

    return tasks;
  };

  const allTasks = getAllScheduleTasks();
  const selectedDateStr = weekDays[selectedDayIndex]?.dateStr || weekDays[0].dateStr;
  
  // Strict matching: Only show tasks on the exact date they are scheduled for!
  const currentDayTasks = allTasks.filter(t => t.dateStr === selectedDateStr && !t.completed);

  // Future tasks that fall beyond the 7-day window
  const futureTasks = allTasks.filter(t => {
    return !t.completed && !weekDays.some(d => d.dateStr === t.dateStr) && new Date(t.dateStr) > new Date(weekDays[6].dateStr);
  });

  const completeTask = (taskId: string) => {
    setCompletedTaskIds((prev) => prev.includes(taskId) ? prev : [...prev, taskId]);
  };

  // Compute chart data based on jobs and timeView
  const getChartData = () => {
    const counts: Record<string, number> = {};
    jobs.forEach(job => {
      const d = new Date(job.created_at || job.updated_at || Date.now());
      let key = "";
      if (timeView === "day") {
        key = `${d.getMonth() + 1}/${d.getDate()}`;
      } else if (timeView === "week") {
        const week = Math.ceil(d.getDate() / 7);
        key = `${d.getMonth() + 1}月第${week}周`;
      } else {
        key = `${d.getFullYear()}-${d.getMonth() + 1}月`;
      }
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, "投递数": count }));
  };
  const chartData = getChartData();

  // Fetch jobs from FastAPI backend
  const fetchJobs = async (attempt = 0, background = false) => {
    try {
      if (!background) setIsLoading(true);
      const response = await fetch(apiBase, {
        cache: "no-store",
        signal: AbortSignal.timeout(JOBS_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setJobs(data);
      writeCachedJobs(data, jobsCacheKey);
      setJobsLoadError(null);
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
      const cachedJobs = readCachedJobs(jobsCacheKey);
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
  }, [apiBase, jobsCacheKey]);

  const handleCreateJob = async () => {
    if (!jdContent.trim()) return;
    try {
      setIsSubmitting(true);
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd_content: jdContent })
      });
      if (response.ok) {
        const newJob = await response.json();
        setIsModalOpen(false);
        setJdContent("");
        router.push(workspaceHref(newJob.id));
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

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Header Area */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            下午好，张三 <span className="animate-wave inline-block origin-bottom-right">👋</span>
          </h1>
          <p className="text-sm text-slate-500 mt-2 font-medium">OfferFlow 智能助您高效率完成求职目标。</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportData}
            className="bg-white text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-slate-50 transition-all flex items-center gap-2"
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

      {jobsLoadError && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <span>{jobsLoadError}</span>
          <button onClick={() => fetchJobs()} className="shrink-0 font-bold hover:text-red-900">重新加载</button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
         <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
           <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">总投递数</p>
           <p className="text-3xl font-black text-slate-800">{jobs.length}</p>
           <p className="text-xs text-slate-400 font-medium mt-1">
             今日新增: {jobs.filter(j => new Date(j.created_at || j.updated_at).toDateString() === new Date().toDateString()).length}
           </p>
         </div>
         <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
           <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">投递中</p>
           <p className="text-3xl font-black text-slate-800">{jobs.filter(j => j.status === '投递中' || j.status.includes('优化') || j.status.includes('分析') || j.status.includes('等待')).length}</p>
           <p className="text-xs text-slate-400 font-medium mt-1">AI 助理准备中</p>
         </div>
         <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden group cursor-pointer hover:border-indigo-400 transition hover:shadow-md">
           <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
           <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">面试中</p>
           <p className="text-3xl font-black text-indigo-600">{jobs.filter(j => j.status === '面试中').length}</p>
           <p className="text-xs text-indigo-600 font-medium mt-1">稳扎稳打</p>
           <BrainCircuit className="absolute -bottom-2 -right-2 w-12 h-12 text-indigo-100 group-hover:text-indigo-200 transition-colors" />
         </div>
         <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
           <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Offer</p>
           <p className="text-3xl font-black text-slate-800 flex items-center gap-2">
             {jobs.filter(j => j.status.toLowerCase().includes('offer')).length} <Trophy className="w-5 h-5 text-amber-500" />
           </p>
           <p className="text-xs text-slate-400 font-medium mt-1">再接再厉</p>
         </div>
      </div>

      {/* Chart Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-8 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
             投递趋势记录 <BrainCircuit className="w-4 h-4 text-slate-400" />
          </h2>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setTimeView("day")} className={`px-3 py-1 text-xs font-bold rounded-lg ${timeView === "day" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"}`}>日</button>
            <button onClick={() => setTimeView("week")} className={`px-3 py-1 text-xs font-bold rounded-lg ${timeView === "week" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"}`}>周</button>
            <button onClick={() => setTimeView("month")} className={`px-3 py-1 text-xs font-bold rounded-lg ${timeView === "month" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500"}`}>月</button>
          </div>
        </div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f4f4f5' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
              <Bar dataKey="投递数" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 🌟 7-Day Task Schedule Board (7天求职任务日程表) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-12">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              7天求职任务日程表
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">清晰查看每天需要完成的跟进、面试与简历优化 Task。</p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setScheduleViewMode("list")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                scheduleViewMode === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <List className="w-3.5 h-3.5" /> 日程清单
            </button>
            <button
              onClick={() => setScheduleViewMode("matrix")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                scheduleViewMode === "matrix" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> 7天周历全景
            </button>
          </div>
        </div>

        {/* 7-Day Tabs Navigation */}
        {scheduleViewMode === "list" && (
          <div className="grid grid-cols-7 gap-2 mb-6">
            {weekDays.map((day) => {
              const isSelected = selectedDayIndex === day.index;
              const dayTaskCount = allTasks.filter(t => {
                if (day.index === 0) {
                  return t.dateStr === day.dateStr || (new Date(t.dateStr) < new Date(day.dateStr) && !t.completed);
                }
                return t.dateStr === day.dateStr;
              }).length;

              return (
                <button
                  key={day.index}
                  onClick={() => setSelectedDayIndex(day.index)}
                  className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl transition-all relative border ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 scale-[1.03]"
                      : "bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-100"
                  }`}
                >
                  <span className={`text-xs font-bold ${isSelected ? "text-indigo-100" : "text-slate-400"}`}>
                    {day.label}
                  </span>
                  <span className="text-sm font-black mt-0.5">{day.shortDate}</span>

                  {dayTaskCount > 0 && (
                    <span
                      className={`mt-1.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isSelected
                          ? "bg-white text-indigo-700"
                          : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                      }`}
                    >
                      {dayTaskCount} Task
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* View Mode 1: Detailed List for Selected Day */}
        {scheduleViewMode === "list" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                {weekDays[selectedDayIndex]?.dateStr} ({weekDays[selectedDayIndex]?.label}) 的待办任务 ({currentDayTasks.length})
              </span>
              <span className="text-[11px] text-slate-400 font-medium">点击岗位进入对应 Job Case</span>
            </div>

            {isLoading ? (
              <div className="p-12 flex justify-center items-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : currentDayTasks.length === 0 ? (
              <div className="p-10 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center text-center">
                <Calendar className="w-10 h-10 text-slate-300 mb-2" />
                <h3 className="font-bold text-slate-700 text-sm">当日暂无排期 Task</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  去【岗位管理】开启更多岗位的面试或投递流程，任务将自动添加至此。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentDayTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 transition-all flex items-center justify-between gap-4"
                  >
                    <Link
                      href={workspaceHref(t.jobId)}
                      className="min-w-0 flex-1 group"
                    >
                      <p className="text-xs font-semibold text-slate-400">{t.company}</p>
                      <h4 className="mt-0.5 text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                        {t.role}
                      </h4>
                    </Link>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => completeTask(t.id)}
                        className="px-3 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-xl transition flex items-center gap-1.5"
                        title="完成并移除任务"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        完成
                      </button>
                      {t.link && (
                        <a
                          href={t.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl transition flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          岗位链接
                        </a>
                      )}
                      <Link
                        href={workspaceHref(t.jobId)}
                        className="px-3 py-2 bg-slate-50 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold rounded-xl text-xs transition flex items-center gap-1.5 border border-slate-200"
                      >
                        Job Case <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Future Reminders Section (Beyond 7-Day Window, e.g., 8月1日) */}
            {futureTasks.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="mb-3 text-xs font-bold text-slate-500">之后的岗位 ({futureTasks.length})</div>
                <div className="space-y-2">
                  {futureTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between gap-4"
                    >
                      <Link
                        href={workspaceHref(t.jobId)}
                        className="min-w-0 flex-1 group"
                      >
                        <p className="text-xs font-semibold text-slate-400">{t.company}</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600">{t.role}</p>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => completeTask(t.id)} className="px-3 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-xl flex items-center gap-1.5" title="完成并移除任务">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 完成
                        </button>
                        {t.link && (
                          <a href={t.link} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5" /> 岗位链接
                          </a>
                        )}
                        <Link href={workspaceHref(t.jobId)} className="px-3 py-2 bg-slate-50 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold rounded-xl text-xs transition flex items-center gap-1.5 border border-slate-200">
                          Job Case <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Mode 2: 7-Day Matrix Grid View */}
        {scheduleViewMode === "matrix" && (
          <div className="grid grid-cols-7 gap-3 pt-2">
            {weekDays.map((day) => {
              const dayTasks = allTasks.filter(t => {
                if (t.completed) return false;
                if (day.index === 0) {
                  return t.dateStr === day.dateStr || (new Date(t.dateStr) < new Date(day.dateStr) && !t.completed);
                }
                return t.dateStr === day.dateStr;
              });

              return (
                <div
                  key={day.index}
                  className="bg-slate-50/70 border border-slate-100 rounded-2xl p-3 flex flex-col min-h-[220px]"
                >
                  <div className="pb-2 mb-2 border-b border-slate-200/60 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">{day.label}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{day.shortDate}</span>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto">
                    {dayTasks.length === 0 ? (
                      <span className="text-[10px] text-slate-300 font-medium block text-center mt-6">无 Task</span>
                    ) : (
                      dayTasks.map((t) => (
                        <Link
                          key={t.id}
                          href={workspaceHref(t.jobId)}
                          className="block bg-white p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 transition shadow-2xs group"
                        >
                          <p className="text-[10px] font-semibold text-slate-400 truncate">{t.company}</p>
                          <p className="mt-0.5 text-[11px] font-bold text-slate-800 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">{t.role}</p>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Job Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold">新建 Job Case</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 transition">
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
                  className="w-full h-40 p-4 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> 上传 PDF/Word
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">取消</button>
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

export default function HomePage() {
  return <Dashboard />;
}
