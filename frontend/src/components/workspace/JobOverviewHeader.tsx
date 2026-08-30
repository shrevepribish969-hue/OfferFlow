import React from 'react';
import { ArrowLeft, PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface JobOverviewHeaderProps {
  job: any;
  backHref?: string;
  onShowDemoResume?: () => void;
  currentStageLabel?: string;
  isCanvasOpen?: boolean;
  hasArtifacts?: boolean;
  onToggleCanvas?: () => void;
}

export const JobOverviewHeader = ({ job, backHref = "/", onShowDemoResume, currentStageLabel, isCanvasOpen, hasArtifacts = false, onToggleCanvas }: JobOverviewHeaderProps) => {
  return (
    <header className="h-16 flex items-center justify-between px-5 border-b border-slate-200 shrink-0 bg-white z-10 relative">
      <div className="flex items-center gap-4">
        <Link href={backHref} className="text-slate-400 hover:text-slate-700 transition-colors bg-slate-50 hover:bg-slate-100 p-2 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-inner text-white font-bold text-sm">
            {job?.company?.substring(0, 2) || "💼"}
          </div>
          <div className="flex flex-col">
            <h1 className="font-bold text-base text-slate-900 leading-tight">
              {job?.company || "未知公司"} · {job?.role || "未知岗位"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-bold tracking-wide border border-green-100">
                匹配度 {job?.match_score != null ? `${job.match_score}%` : "--"}
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-bold tracking-wide border border-blue-100">
                {currentStageLabel ? `正在查看：${currentStageLabel}` : "Case Agent 对话中"}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onShowDemoResume && (
          <button onClick={onShowDemoResume} className="hidden sm:flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors">
            查看内置简历
          </button>
        )}
        <div className="hidden md:flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
          <Sparkles className="w-3.5 h-3.5" />
          Case Agent 在线
        </div>
        <button
          onClick={onToggleCanvas}
          disabled={!hasArtifacts && !isCanvasOpen}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isCanvasOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          {isCanvasOpen ? "关闭成果" : hasArtifacts ? "查看成果" : "暂无成果"}
        </button>
      </div>
    </header>
  );
};
