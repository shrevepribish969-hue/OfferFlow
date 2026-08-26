import React, { useState } from 'react';
import { Target, CheckCircle2, XCircle, ChevronDown, ChevronUp, Mic, Play, MessageSquare, BrainCircuit, Activity } from 'lucide-react';

interface InterviewEvalWorkViewProps {
  job: any;
  cardMsg?: any;
  prepCardMsg?: any;
  isProcessing?: boolean;
  onGenerate?: (input: string) => void;
  onComplete?: () => void;
}

export const InterviewEvalWorkView = ({ job, cardMsg, prepCardMsg, isProcessing, onGenerate, onComplete }: InterviewEvalWorkViewProps) => {
  const [transcript, setTranscript] = useState('');
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});

  let parsedData = null;
  let prepData = null;
  try {
    if (cardMsg?.data?.preview && !cardMsg.data.preview.endsWith('...')) {
      parsedData = JSON.parse(cardMsg.data.preview);
    }
    if (prepCardMsg?.data?.preview && !prepCardMsg.data.preview.endsWith('...')) {
      prepData = JSON.parse(prepCardMsg.data.preview);
    }
  } catch (e) {
    // silently fail
  }

  const allPrepQuestions = [
    ...(prepData?.questions || []).map((q: any) => q.question_text),
    ...(prepData?.technical_hard_questions || []).map((q: any) => q.question_text),
    ...(prepData?.routine_questions || [])
  ];

  const getQuestionContent = (ans: any, idx: number) => {
    if (ans.question_content) return ans.question_content;
    const match = String(ans.question_id).match(/Q(\d+)/i);
    if (match) {
      const qIdx = parseInt(match[1]) - 1;
      if (qIdx >= 0 && qIdx < allPrepQuestions.length) return allPrepQuestions[qIdx];
    }
    if (idx < allPrepQuestions.length) return allPrepQuestions[idx];
    return null;
  };

  const confidence = parsedData?.analysis_confidence || 0;
  const overallScore = parsedData?.overall_score || 0;
  const answers = parsedData?.evaluated_answers || [];
  const roleSummary = parsedData?.role_summary;
  const nextRoundBrief = parsedData?.next_round_brief;
  const generationError = typeof cardMsg?.content === 'string' && cardMsg.content.startsWith('Error:')
    ? cardMsg.content.replace(/^Error:\s*/, '')
    : null;

  const toggleExpand = (id: string) => {
    setExpandedAnswers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePredict = () => {
    if (onGenerate && transcript.trim()) {
      onGenerate(transcript);
    }
  };

  const hasValidData = parsedData && (parsedData.overall_score !== undefined || parsedData.evaluated_answers?.length > 0);

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            面后复盘与反思
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            提交您的面试录音文字稿，AI将为您进行深度评估并更新全局薄弱项记忆。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onComplete}
            disabled={isProcessing}
            className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-1.5 ${
              isProcessing
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'text-white bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            完成
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {isProcessing && (
            <div className="py-20 text-center animate-pulse">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4 border-[3px] border-indigo-200">
                <BrainCircuit className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">AI 正在深度复盘面试表现...</h3>
              <p className="text-slate-500 text-sm">正在核对 STAR 结构与命中考点</p>
            </div>
          )}

          {!isProcessing && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
              {generationError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  上次复盘生成失败：{generationError}。逐字稿已保留，可以直接重新提交。
                </div>
              )}
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                <Mic className="w-5 h-5 text-indigo-500" />
                {hasValidData ? '重新输入面试文字稿' : '输入面试文字稿'}
              </h3>
              <textarea 
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="在此粘贴您的面试录音转写稿，或者凭记忆写下的面试问答（例如：Q：请介绍一下你负责的XX模块？ A：当时我采用了...）"
                className={`w-full p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none text-sm leading-relaxed ${hasValidData ? 'h-32' : 'h-64'}`}
              ></textarea>
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={handlePredict}
                  disabled={!transcript.trim()}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition-all"
                >
                  {hasValidData ? '重新复盘评估' : '开始复盘评估'}
                </button>
              </div>
            </div>
          )}

          {!isProcessing && hasValidData && (
            <>
              <div className="flex gap-4">
                <div className="flex-1 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-6">
                  <div className="w-24 h-24 rounded-full border-[6px] border-indigo-100 flex items-center justify-center relative">
                    <span className="text-3xl font-black text-indigo-600">{overallScore}</span>
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8" className="text-indigo-500" strokeDasharray={`${overallScore * 2.89} 289`} />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-1">综合面试表现得分</h3>
                    <p className="text-slate-500 text-sm">AI 评估可信度：{(confidence * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </div>

              {roleSummary && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h3 className="text-base font-bold text-slate-800 mb-3">岗位与本轮面试总结</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{roleSummary.jd_summary}</p>
                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-500 mb-2">面试官实际关注点</p>
                    <div className="flex flex-wrap gap-2">
                      {roleSummary.actual_interviewer_focus?.map((item: string, idx: number) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">{item}</span>
                      ))}
                    </div>
                  </div>
                  {roleSummary.fit_conclusion && (
                    <p className="mt-4 text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{roleSummary.fit_conclusion}</p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-indigo-500" />
                  各题作答深度分析
                </h3>
                {answers.map((ans: any, idx: number) => {
                  const isExpanded = !!expandedAnswers[ans.question_id || idx.toString()];
                  const strengths = ans.strengths || ans.criteria_hit || [];
                  const issues = ans.issues || ans.criteria_missed || [];
                  return (
                    <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-slate-800 text-base">{ans.question_id}</h4>
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              ans.score >= 80 ? 'bg-green-100 text-green-700' :
                              ans.score >= 60 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              得分: {ans.score}
                            </span>
                          </div>
                        </div>
                        {getQuestionContent(ans, idx) && (
                          <div className="text-sm text-slate-700 font-medium">
                            {getQuestionContent(ans, idx)}
                          </div>
                        )}
                      </div>
                      
                      <div className="p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                          <div>
                            <h5 className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> 命中得分点
                            </h5>
                            <ul className="space-y-1.5">
                              {strengths.map((c: string, cidx: number) => (
                                <li key={cidx} className="text-[13px] text-slate-700 flex items-start gap-2">
                                  <span className="text-green-500 mt-1">•</span> {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                              <XCircle className="w-3.5 h-3.5 text-red-400" /> 遗漏扣分点
                            </h5>
                            <ul className="space-y-1.5">
                              {issues.map((c: string, cidx: number) => (
                                <li key={cidx} className="text-[13px] text-slate-700 flex items-start gap-2">
                                  <span className="text-red-400 mt-1">•</span> {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {ans.dimension_scores && (
                          <div className="grid grid-cols-5 gap-2 mb-4">
                            {[
                              ["切题", ans.dimension_scores.relevance],
                              ["结构", ans.dimension_scores.structure],
                              ["证据", ans.dimension_scores.evidence],
                              ["表达", ans.dimension_scores.clarity],
                              ["岗位匹配", ans.dimension_scores.job_fit],
                            ].map(([label, score]) => (
                              <div key={String(label)} className="rounded-lg bg-slate-50 p-2 text-center border border-slate-100">
                                <div className="text-[10px] text-slate-400">{label}</div>
                                <div className="text-sm font-bold text-slate-700 mt-0.5">{score ?? "-"}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                          <h5 className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" /> AI 深度反馈与改进建议
                          </h5>
                          <p className="text-sm text-indigo-900/80 leading-relaxed mb-3">
                            {ans.actionable_feedback}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {ans.improvement_areas?.map((ia: string, iidx: number) => (
                              <span key={iidx} className="text-[11px] font-medium bg-white text-indigo-600 px-2.5 py-1 rounded-md border border-indigo-200">
                                {ia}
                              </span>
                            ))}
                          </div>
                        </div>

                        {ans.improved_answer && (
                          <div className="mt-4 bg-emerald-50/60 p-4 rounded-lg border border-emerald-100">
                            <h5 className="text-xs font-bold text-emerald-800 mb-2">更优回答示范</h5>
                            <p className="text-sm text-emerald-950/80 leading-relaxed whitespace-pre-wrap">{ans.improved_answer}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {nextRoundBrief && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h3 className="text-base font-bold text-slate-800 mb-4">下一轮面试输入</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-2">重点考察</p>
                      <ul className="space-y-1.5 text-sm text-slate-700">
                        {nextRoundBrief.focus_dimensions?.map((item: string, idx: number) => <li key={idx}>• {item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-2">必须追问</p>
                      <ul className="space-y-1.5 text-sm text-slate-700">
                        {nextRoundBrief.must_probe?.map((item: string, idx: number) => <li key={idx}>• {item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
