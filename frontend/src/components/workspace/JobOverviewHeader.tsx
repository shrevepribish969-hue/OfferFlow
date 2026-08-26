import React from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface JobOverviewHeaderProps {
  job: any;
  currentStageLabel?: string;
}

export const JobOverviewHeader = ({ job, currentStageLabel }: JobOverviewHeaderProps) => {
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200 shrink-0 bg-white z-10 shadow-sm relative">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-slate-700 transition-colors bg-slate-50 hover:bg-slate-100 p-2 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0 shadow-inner text-white font-bold text-sm">
            {job?.company?.substring(0, 2) || "💼"}
          </div>
          <div className="flex flex-col">
            <h1 className="font-bold text-lg text-slate-800 leading-tight">
              {job?.company || "未知公司"} · {job?.role || "未知岗位"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-bold tracking-wide border border-green-100">
                匹配度 {job?.match_score != null ? `${job.match_score}%` : "--"}
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-bold tracking-wide border border-blue-100">
                当前阶段: {currentStageLabel || job?.status || "准备中"}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
        <div className="flex flex-col text-right">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">预计面试</span>
          <span className="font-bold text-slate-800">7月27日</span>
        </div>
        <div className="h-8 w-[1px] bg-slate-200"></div>
        <div className="flex flex-col">
          <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">倒计时</span>
          <span className="font-bold text-orange-600">5 天</span>
        </div>
      </div>
    </header>
  );
};
