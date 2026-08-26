import React from 'react';
import { Target, BrainCircuit, Loader2, ChevronDown } from 'lucide-react';
import { ResumeViewer } from '@/components/ResumeViewer';

interface JDAnalysisViewProps {
  job: any;
  cardMsg: any; // The ExecutionSummary card message
  isProcessing?: boolean;
  onComplete?: () => void;
  onRegenerate?: () => void;
}

export const JDAnalysisView = ({ job, cardMsg, isProcessing, onComplete, onRegenerate }: JDAnalysisViewProps) => {
  if (!cardMsg) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              JD 解析与匹配度分析
            </h2>
            <p className="text-sm text-slate-500 mt-1">等待解析数据...</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col items-center justify-center gap-4">
          {isProcessing ? (
            <>
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-2 animate-pulse">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <div className="text-center font-bold text-blue-600">AI 正在深度解析 JD...</div>
              <p className="text-xs text-slate-400">正在提取核心能力要求与业务考核点，请稍候</p>
            </>
          ) : (
            <div className="text-center text-slate-400">尚未进行 JD 解析或数据为空</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            JD 解析与匹配度分析
          </h2>
          <p className="text-sm text-slate-500 mt-1">Review the AI analysis of the Job Description and your matching score.</p>
        </div>
        <div className="flex items-center gap-3">
          {onRegenerate && (
            <button 
              onClick={onRegenerate}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-blue-600 rounded-lg transition-colors shadow-sm"
            >
              重新生成
            </button>
          )}
          {onComplete && (
            <button 
              onClick={onComplete}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
            >
              完成
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-blue-600" />
              <span className="font-bold text-slate-800">解析结果摘要</span>
            </div>
            <div className="p-5">
              <p className="text-sm font-semibold mb-6 whitespace-pre-wrap leading-relaxed text-slate-800">
                {cardMsg.content}
              </p>
              
              {cardMsg.data?.is_resume_json && cardMsg.data?.preview && (
                <div className="mt-4 mb-4 border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                  <ResumeViewer data={JSON.parse(cardMsg.data.preview)} />
                </div>
              )}

              {(cardMsg.data?.details?.length > 0 || cardMsg.data?.actions_taken?.length > 0) && (
                <details className="group mt-5 rounded-xl border border-slate-200 bg-slate-50/60">
                  <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between text-sm font-bold text-slate-700">
                    查看完整解析依据与技能标签
                    <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-slate-200 p-4">
                    {cardMsg.data?.details && cardMsg.data.details.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 mb-5">
                        {cardMsg.data.details
                          .filter((detail: any) => detail.label !== "岗位分析结果")
                          .map((detail: any, idx: number) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col gap-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{detail.label}</span>
                            <span className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {cardMsg.data?.actions_taken && (
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">AI 提取的技能标签</h4>
                        <div className="flex flex-wrap gap-2">
                          {cardMsg.data.actions_taken.map((action: string, i: number) => (
                            <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
                              {action}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
