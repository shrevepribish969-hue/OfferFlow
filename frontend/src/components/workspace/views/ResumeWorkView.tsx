import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Check, X, Download, RotateCw, ArrowRight, Sparkles, Target, Info, Eye, Loader2, ChevronDown } from 'lucide-react';
import { ResumeViewer } from '@/components/ResumeViewer';

interface ResumeWorkViewProps {
  job: any;
  cardMsg: any; // The ResumeOptimizer card message
  finalResumeCard?: any; // The ContentGeneration card message
  isProcessing?: boolean;
  progressSteps?: { content: string; status: string }[];
  onComplete?: () => void;
  onRegenerate?: () => void;
  onGenerateResume?: (acceptedIndices: number[]) => void;
}

export const ResumeWorkView = ({ job, cardMsg, finalResumeCard, isProcessing, progressSteps, onComplete, onRegenerate, onGenerateResume }: ResumeWorkViewProps) => {
  const patches = useMemo(
    () => (cardMsg?.data?.optimization_patches || [])
      .map((patch: any, sourceIndex: number) => ({ ...patch, __sourceIndex: sourceIndex }))
      .filter((patch: any) => String(patch?.suggestion || '').trim()),
    [cardMsg?.data?.optimization_patches]
  );
  const summary = cardMsg?.data?.sidebar_summary || '';
  
  const [showPreview, setShowPreview] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Local state to track which patches have been accepted or rejected
  const [patchStates, setPatchStates] = useState<Record<number, 'pending' | 'accepted' | 'rejected'>>({});

  useEffect(() => {
    // Unspecified items already render as pending. Reset decisions only when a
    // different saved result is opened; depending on a derived patch array can
    // cause a render loop when historical messages are reconstructed.
    setPatchStates({});
  }, [cardMsg?.id]);

  const handleAction = (idx: number, action: 'accepted' | 'rejected') => {
    setPatchStates(prev => ({
      ...prev,
      [idx]: action
    }));
  };

  if (!cardMsg && !finalResumeCard) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              简历定向优化
            </h2>
            <p className="text-sm text-slate-500 mt-1">Review AI-suggested optimizations tailored to this job description.</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex flex-col items-center justify-center gap-4">
          {isProcessing ? (
            <>
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-2 animate-pulse">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
              <div className="text-center font-bold text-indigo-600">AI 正在为您量身定制简历优化建议...</div>
              <p className="text-xs text-slate-400">结合 JD 核心考点与您的过往经历，生成具有针对性的修改方案，请稍候</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <FileText className="w-8 h-8 text-slate-300" />
              </div>
              <div className="text-center text-slate-500 font-medium">您是否需要针对该岗位定向优化简历？</div>
              <p className="text-sm text-slate-400 mb-4 max-w-md text-center">AI 会根据刚才的匹配度分析结果，为您提供具体的简历内容修改建议，并可以直接生成终版简历。</p>
              <button 
                onClick={onRegenerate}
                className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                是的，帮我优化简历
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Parse final resume data if available
  let finalResumeData = null;
  if (finalResumeCard?.data?.preview) {
    try {
      finalResumeData = JSON.parse(finalResumeCard.data.preview);
    } catch(e) {}
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Workspace Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shrink-0 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            简历定向优化
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            基于 {job?.job_title || '当前岗位'} 的要求，AI 已为您生成针对性的简历优化建议。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={onRegenerate}
            disabled={isProcessing}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              isProcessing 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-none' 
                : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-indigo-600'
            }`}
          >
            <RotateCw className="w-4 h-4" />
            {isProcessing ? '正在生成...' : '重新生成'}
          </button>

          <button 
            onClick={onComplete}
            disabled={isProcessing}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              isProcessing
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'text-white bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            完成
          </button>
        </div>
      </div>

      {/* Main Diff Workspace */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
        <div className="max-w-3xl mx-auto space-y-4">
          
          {isProcessing && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">AI 正在为您逐字重写简历...</h3>
              <p className="text-sm text-slate-500 mb-6">请耐心等待约 20-30 秒，大模型正在比对每一项能力要求</p>
              
              {progressSteps && progressSteps.length > 0 && (
                <div className="w-full max-w-md space-y-3">
                  {progressSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      {step.status === 'done' || step.status === 'success' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : step.status === 'running' ? (
                        <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 bg-slate-100"></div>
                      )}
                      <span className={step.status === 'running' ? 'text-indigo-600 font-medium' : 'text-slate-600'}>
                        {step.content}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isProcessing && summary && (
            <details className="group bg-indigo-50 border border-indigo-100 rounded-xl shadow-sm">
              <summary className="list-none cursor-pointer p-3 flex items-center gap-2 text-sm font-bold text-indigo-900">
              <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                优化说明
              </summary>
              <p className="px-4 pb-4 text-sm text-indigo-800/80 leading-relaxed">{summary.replace('Summary: ', '')}</p>
            </details>
          )}

          {!isProcessing && patches.length === 0 ? (
            <div className="text-center text-slate-500 py-12">未检测到需要优化的建议，您的简历已经很棒了！</div>
          ) : !isProcessing ? (
            patches.map((patch: any, idx: number) => {
              const state = patchStates[idx] || 'pending';
              const isAccepted = state === 'accepted';
              const isRejected = state === 'rejected';
              const isAddition = !String(patch.original || '').trim();

              return (
                <details
                  key={idx} 
                  className={`group bg-white rounded-xl border transition-all duration-300 overflow-hidden ${
                    isAccepted ? 'border-green-300 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 
                    isRejected ? 'border-slate-200 opacity-60 grayscale-[0.5]' : 
                    'border-slate-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  {/* Header */}
                  <summary className={`list-none cursor-pointer px-4 py-3 flex flex-col gap-2.5 ${
                    isAccepted ? 'bg-green-50/50' : 'bg-slate-50/80'
                  }`}>
                    <div className="flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 rounded-md bg-white border border-slate-200 px-2 py-1 font-bold text-[11px] text-slate-500">{patch.module || '模块'}</span>
                        <span className="truncate font-bold text-xs text-slate-800">{patch.target_name || (isAddition ? '新增内容' : '修改建议')}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                    </div>
                      
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {patch.gap_addressed && (
                        <div className="flex min-w-0 items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-full text-[11px] font-medium">
                          <Target className="w-3.5 h-3.5" />
                          <span className="truncate">{patch.gap_addressed}</span>
                        </div>
                      )}
                    
                    <div className="flex gap-1.5 ml-auto">
                      <button 
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleAction(idx, 'rejected');
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isRejected 
                            ? 'bg-red-100 text-red-700 border border-red-200' 
                            : 'bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" /> 忽略
                      </button>
                      <button 
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleAction(idx, 'accepted');
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isAccepted 
                            ? 'bg-green-600 text-white shadow-sm' 
                            : 'bg-white border border-green-200 text-green-600 hover:bg-green-50 hover:shadow-sm'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" /> 采纳建议
                      </button>
                    </div>
                    </div>
                  </summary>
                  
                  {/* Diff Content */}
                  <div className="p-4 grid grid-cols-1 gap-3 items-center bg-white relative">
                    {/* Original */}
                    {!isAddition && <div className="h-full">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-400"></div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">原文</span>
                      </div>
                      <div className="p-4 bg-red-50/30 rounded-lg border border-red-100 text-sm text-slate-600 h-full relative">
                        <div className="absolute top-0 left-0 w-1 h-full bg-red-400 rounded-l-lg opacity-50"></div>
                        <p className="whitespace-pre-wrap">{patch.original}</p>
                      </div>
                    </div>}

                    {/* Arrow */}
                    {!isAddition && <div className="flex items-center justify-center text-slate-300 rotate-90">
                      <div className="w-8 h-[1px] bg-slate-200 mb-2"></div>
                      <ArrowRight className="w-5 h-5 text-indigo-400" />
                      <div className="w-8 h-[1px] bg-slate-200 mt-2"></div>
                    </div>}
                    
                    {/* Optimized */}
                    <div className="h-full">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-xs font-bold text-green-600 tracking-wider">{isAddition ? '建议新增' : '优化后'}</span>
                      </div>
                      <div className="p-4 bg-green-50/40 rounded-lg border border-green-200 text-sm text-slate-800 h-full shadow-[inset_2px_0_0_#22c55e] relative group">
                        <p className="whitespace-pre-wrap font-medium">{patch.suggestion || '无建议'}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* AI Explanation */}
                  {patch.reason && (
                    <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-slate-600 leading-relaxed">
                          <span className="font-bold text-indigo-700 mr-1">AI 优化依据:</span>
                          {patch.reason}
                        </p>
                      </div>
                    </div>
                  )}
                </details>
              );
            })
          ) : null}
          
          {/* Bottom Action Button for Final Resume */}
          {!isProcessing && summary && (
            <div className="mt-8 mb-8 flex flex-col items-center gap-4">
              {finalResumeData ? (
                <button 
                  onClick={() => setShowPreview(true)}
                  className="px-8 py-3.5 text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg rounded-xl transition-all shadow-md flex items-center gap-2 transform hover:-translate-y-0.5"
                >
                  <Eye className="w-5 h-5" />
                  预览与导出最终简历
                </button>
              ) : (
                <button 
                  onClick={() => {
                    const acceptedIndices = Object.entries(patchStates)
                      .filter(([_, state]) => state === 'accepted')
                      .map(([idx]) => patches[parseInt(idx, 10)]?.__sourceIndex)
                      .filter((idx): idx is number => typeof idx === 'number');
                    onGenerateResume?.(acceptedIndices);
                  }}
                  className="px-8 py-3.5 text-base font-bold text-white bg-indigo-500 hover:bg-indigo-600 hover:shadow-lg rounded-xl transition-all shadow-md flex items-center gap-2 transform hover:-translate-y-0.5"
                >
                  <Download className="w-5 h-5" />
                  采纳以上建议并生成最终简历
                </button>
              )}
            </div>
          )}

        </div>
      </div>
      {/* Preview Modal */}
      {mounted && showPreview && finalResumeData && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-12">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                预览与导出简历
              </h2>
              <button 
                onClick={() => setShowPreview(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative bg-slate-200/50">
              <ResumeViewer data={finalResumeData} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
