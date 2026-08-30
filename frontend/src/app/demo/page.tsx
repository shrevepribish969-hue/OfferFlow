"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Loader2, RotateCcw, Sparkles } from "lucide-react";

type DemoJob = {
  id: number;
  company: string;
  role: string;
  status: string;
  match_score: number | null;
};

export default function PublicDemoPage() {
  const [jobs, setJobs] = useState<DemoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch("/backend-api/demo/jobs", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setJobs(await response.json());
      setError("");
    } catch {
      setError("Demo 服务暂时无法连接，请稍后刷新重试。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetDemo = async () => {
    try {
      setResetting(true);
      const response = await fetch("/backend-api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("reset failed");
      await load();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-slate-50 px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-col gap-5 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-7 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-600"><Sparkles size={16} /> OfferFlow 公开体验</div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">像真实求职一样，和 Agent 对话</h1>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">这里提供虚拟岗位和虚拟简历。你可以自由发起岗位分析、匹配、简历优化和面试准备；体验产生的数据会保留在 Demo 中，不会影响任何真实资料。</p>
          </div>
          <button onClick={resetDemo} disabled={resetting} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60">
            {resetting ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />} 重置体验数据
          </button>
        </div>

        {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</div>}
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> 正在准备 Demo…</div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {jobs.map((job) => (
              <Link key={job.id} href={`/workspace/${job.id}?demo=1`} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
                <div className="mb-7 flex items-start justify-between gap-3"><div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><BriefcaseBusiness size={22} /></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{job.status}</span></div>
                <p className="text-sm text-slate-500">{job.company}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{job.role}</h2>
                <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><span className="font-medium text-emerald-600">匹配度 {job.match_score ?? "待分析"}{job.match_score !== null ? "%" : ""}</span><span className="inline-flex items-center gap-1 font-medium text-indigo-600">开始体验 <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span></div>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-slate-400">公开体验数据会被其他体验者共享；请勿在此输入个人隐私信息。</p>
      </div>
    </div>
  );
}
