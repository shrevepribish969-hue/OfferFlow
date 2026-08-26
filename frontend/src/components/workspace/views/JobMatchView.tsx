import React from 'react';
import { Target, PieChart, AlertCircle, CheckCircle2, Loader2, ChevronDown } from 'lucide-react';

interface JobMatchViewProps {
  job: any;
  cardMsg: any; // Using the ExecutionSummary card which might contain gap analysis
  isProcessing?: boolean;
  onComplete?: () => void;
  onRegenerate?: () => void;
}

export const JobMatchView = ({ job, cardMsg, isProcessing, onComplete, onRegenerate }: JobMatchViewProps) => {
  const matchData = cardMsg?.data?.match_data || {};
  const score = matchData.score ?? (job?.match_score || 0);
  
  if (!cardMsg && score === 0) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              岗位匹配度分析
            </h2>
            <p className="text-sm text-slate-500 mt-1">Review your compatibility with the job requirements and identify gaps.</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col items-center justify-center gap-4">
          {isProcessing ? (
            <>
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-2 animate-pulse">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
              <div className="text-center font-bold text-indigo-600">AI 正在进行匹配度分析...</div>
              <p className="text-xs text-slate-400">正在对比您的简历和该岗位的核心要求，请稍候</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                <PieChart className="w-8 h-8 text-slate-300" />
              </div>
              <div className="text-center text-slate-500 font-medium">尚未进行岗位匹配分析</div>
              <p className="text-sm text-slate-400">请在右侧对话框输入“去匹配我的简历”或点击快捷指令开始分析。</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const matchingSkills = matchData.matching_skills || [];
  const gapSkills = matchData.gap_skills || [];
  const reason = matchData.reason || "暂无 AI 评估数据";

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-indigo-600" />
            岗位匹配度分析
          </h2>
          <p className="text-sm text-slate-500 mt-1">Review your compatibility with the job requirements and identify gaps.</p>
        </div>
        <div className="flex items-center gap-3">
          {onRegenerate && (
            <button 
              onClick={onRegenerate}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 rounded-lg transition-colors shadow-sm"
            >
              重新分析
            </button>
          )}
          {onComplete && (
            <button 
              onClick={onComplete}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
            >
              完成
            </button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Top Score Section */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
            <div className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">综合匹配度</div>
            
            <div className="relative flex items-center justify-center w-40 h-40">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-indigo-600 transition-all duration-1000 ease-out"
                  strokeDasharray={`${score}, 100`}
                  strokeWidth="3"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-4xl font-black text-slate-800">
                {score}<span className="text-xl text-slate-400">%</span>
              </div>
            </div>
          </div>

          {/* AI Evaluation Reason */}
          <div className="bg-slate-100 rounded-xl p-6 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-2">AI 匹配度综合评估</h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {reason}
            </p>
          </div>

          {/* Gaps and Matches */}
          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between text-sm font-bold text-slate-800">
              查看优势与能力差距
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400">{matchingSkills.length} 项优势 · {gapSkills.length} 项差距</span>
                <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="grid grid-cols-1 gap-5 border-t border-slate-100 p-5">
            
            {/* Matching Strengths */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                已匹配优势 ({matchingSkills.length})
              </h3>
              <div className="flex flex-col gap-3">
                {matchingSkills.length > 0 ? (
                  matchingSkills.map((skill: string, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-green-50/50 rounded-lg border border-green-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></div>
                      <span className="text-sm font-medium text-slate-700">{skill}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4">暂无数据</div>
                )}
              </div>
            </div>

            {/* Gap Analysis */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                核心差距与不足 ({gapSkills.length})
              </h3>
              <div className="flex flex-col gap-3">
                {gapSkills.length > 0 ? (
                  gapSkills.map((skill: string, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-orange-50/50 rounded-lg border border-orange-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></div>
                      <span className="text-sm font-medium text-slate-700">{skill}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400 text-center py-4">完美匹配，暂无差距！</div>
                )}
              </div>
            </div>

            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
