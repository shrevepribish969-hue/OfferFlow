import React, { useState } from 'react';
import { Mic, RotateCw, Check, BrainCircuit, Target, AlertTriangle, Lightbulb, MessageSquare, ShieldAlert, ChevronDown, ChevronUp, Zap } from 'lucide-react';

interface SourceDocument {
  document?: string;
  page?: number | null;
}

interface InterviewQuestion {
  question_id?: string;
  priority?: "must_prepare" | "supplementary";
  question_text?: string;
  dimension?: string;
  interviewer_intent?: string;
  why_likely?: string;
  evidence_status?: string;
  question_origin?: "jd" | "resume" | "gap" | "memory" | "rag";
  rag_question_id?: string | null;
  competency?: string;
  source?: string | { company?: string };
  answer_framework?: {
    opening?: string;
    key_points?: string[];
    evidence?: string;
    closing?: string;
  };
  resume_connections?: Array<{
    confirmed_anchor?: string;
    how_to_use?: string;
  }>;
  answer_outline?: string[];
  clarification_questions?: string[];
  recommended_example?: {
    display_mode?: "collapsed_by_default";
    example_type?: "resume_based" | "resume_based_with_suggestions" | "illustrative";
    disclaimer?: string;
    answer?: string;
    confirmed_basis?: string[];
    content_to_confirm?: string[];
    illustrative_details?: string[];
    editing_tip?: string;
  };
  suggested_answer_star?: string;
  anticipated_follow_ups?: string[];
  trap?: string;
  rag_evidence?: {
    source?: { documents?: SourceDocument[] };
    retrieval?: { score?: number; reasons?: string[] };
  };
}

interface InterviewPrepData {
  title?: string;
  overview_text?: string;
  questions?: InterviewQuestion[];
  technical_hard_questions?: InterviewQuestion[];
  routine_questions?: string[];
  hiring_rubric?: Array<{
    dimension: string;
    priority: "high" | "medium" | "low";
    interviewer_concern: string;
    resume_evidence_status: string;
    resume_evidence: string;
  }>;
}

interface InterviewWorkViewProps {
  job?: { company?: string };
  cardMsg?: { data?: { preview?: string } };
  isProcessing?: boolean;
  onGenerate?: () => void;
  onComplete?: () => void;
}

export const InterviewWorkView = ({ job, cardMsg, isProcessing, onGenerate, onComplete }: InterviewWorkViewProps) => {
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});

  const toggleExpand = (key: string) => {
    setExpandedAnswers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  let parsedData: InterviewPrepData | null = null;
  try {
    parsedData = cardMsg?.data?.preview ? JSON.parse(cardMsg.data.preview) as InterviewPrepData : null;
  } catch (e) {
    console.warn("Failed to parse cardMsg.data.preview", e);
    // If it fails, we will show the empty state where they can click "重新预测"
  }
  const title = parsedData?.title || '面试题预测与策略';
  const overview = parsedData?.overview_text || '';
  const questions = parsedData?.questions || [];
  const mustPrepareQuestions = questions.filter((question) => question.priority !== 'supplementary');
  const supplementaryQuestions = questions.filter((question) => question.priority === 'supplementary');
  const hardQuestions = parsedData?.technical_hard_questions || [];
  const routineQuestions = parsedData?.routine_questions || [];
  const hiringRubric = parsedData?.hiring_rubric || [];

  const originLabels: Record<string, string> = {
    jd: 'JD 推演',
    resume: '简历验证',
    gap: '缺口验证',
    memory: '历史弱点',
    rag: '真实面经参考',
  };

  const renderQuestionCard = (q: InterviewQuestion, idx: number, isHard: boolean) => {
    const cardKey = `${isHard ? 'hard' : 'core'}-${q.question_id || idx}`;
    const isExpanded = !!expandedAnswers[cardKey];
    const sourceLabel = typeof q.source === 'string'
      ? q.source
      : q.source?.company
        ? `来源：${q.source.company}`
        : '来源：面经知识库';
    const ragEvidence = q.rag_evidence;
    const retrievalReasons: string[] = ragEvidence?.retrieval?.reasons || [];
    const sourceDocuments: Array<{ document?: string; page?: number | null }> = ragEvidence?.source?.documents || [];
    const recommendedExample = q.recommended_example || (q.suggested_answer_star ? {
      display_mode: 'collapsed_by_default' as const,
      example_type: 'resume_based' as const,
      disclaimer: '这是旧版面试准备内容，请结合真实经历核对后使用。',
      answer: q.suggested_answer_star,
      confirmed_basis: [],
      content_to_confirm: [],
      illustrative_details: [],
      editing_tip: '根据真实经历补充或删改。',
    } : undefined);
    const exampleTypeLabels: Record<string, string> = {
      resume_based: '基于简历',
      resume_based_with_suggestions: '简历＋建议补充',
      illustrative: '方法示范',
    };
    
    return (
      <div key={cardKey} className={`bg-white rounded-xl border ${isHard ? 'border-red-200' : 'border-indigo-100'} shadow-sm overflow-hidden mb-4`}>
        {/* Header */}
        <div className={`p-4 border-b ${isHard ? 'bg-red-50/50 border-red-100' : 'bg-slate-50 border-indigo-50'} flex gap-3`}>
          <div className="shrink-0 mt-1">
            {isHard ? <ShieldAlert className="w-5 h-5 text-red-500" /> : <MessageSquare className="w-5 h-5 text-indigo-500" />}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800 text-base">{q.question_text}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {q.priority && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${q.priority === 'must_prepare' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>
                  {q.priority === 'must_prepare' ? '重点准备' : '补充准备'}
                </span>
              )}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isHard ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {q.dimension || q.competency}
              </span>
              {q.question_origin && (
                <span className="text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-100">
                  {originLabels[q.question_origin] || q.question_origin}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {q.interviewer_intent && (
            <p className="mb-4 text-xs leading-relaxed text-slate-500"><span className="font-bold text-slate-600">面试官想判断：</span>{q.interviewer_intent}</p>
          )}
          {q.why_likely && (
            <p className="mb-4 text-xs leading-relaxed text-slate-500"><span className="font-bold text-slate-600">为什么可能会问：</span>{q.why_likely}</p>
          )}

          {(q.resume_connections?.length ?? 0) > 0 && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <h4 className="mb-2 text-xs font-black text-emerald-700">可以调用的简历经历</h4>
              <div className="space-y-2">
                {q.resume_connections?.map((connection, connectionIndex) => (
                  <div key={connectionIndex} className="text-sm leading-relaxed text-slate-700">
                    <span className="font-bold text-slate-800">{connection.confirmed_anchor}</span>
                    {connection.how_to_use && <span className="text-slate-500"> — {connection.how_to_use}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`mb-4 rounded-xl border p-4 ${isHard ? 'border-red-100 bg-red-50/30' : 'border-indigo-100 bg-indigo-50/40'}`}>
            <h4 className={`mb-3 text-sm font-black ${isHard ? 'text-red-700' : 'text-indigo-700'}`}>推荐答题结构</h4>
            {(q.answer_outline?.length ?? 0) > 0 ? (
              <ol className="space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 list-decimal">
                {q.answer_outline?.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}
              </ol>
            ) : q.answer_framework ? (
              <div className="space-y-3 text-sm leading-relaxed text-slate-700">
                {q.answer_framework.opening && <p><span className="font-bold text-slate-800">先说结论：</span>{q.answer_framework.opening}</p>}
                {(q.answer_framework.key_points?.length ?? 0) > 0 && (
                  <ul className="space-y-1.5 pl-5 list-decimal">
                    {q.answer_framework.key_points?.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}
                  </ul>
                )}
                {q.answer_framework.evidence && <p><span className="font-bold text-slate-800">经历证据：</span>{q.answer_framework.evidence}</p>}
                {q.answer_framework.closing && <p><span className="font-bold text-slate-800">最后回扣：</span>{q.answer_framework.closing}</p>}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-500">展开下方推荐示范查看完整回答。</p>
            )}
          </div>

          {(q.clarification_questions?.length ?? 0) > 0 && (
            <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="mb-1.5 text-xs font-bold text-amber-700">回答前可以补充</p>
              <ul className="space-y-1 text-xs text-amber-800">
                {q.clarification_questions?.map((question, questionIndex) => <li key={questionIndex}>• {question}</li>)}
              </ul>
            </div>
          )}

          {recommendedExample && (
            <button
              onClick={() => toggleExpand(cardKey)}
              className="flex w-full items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
              aria-expanded={isExpanded}
            >
              <span className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                {isExpanded ? '收起推荐示范' : '查看推荐示范'}
              </span>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}

          {isExpanded && recommendedExample && <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-indigo-700">完整推荐示范</h4>
                {recommendedExample.example_type && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                    {exampleTypeLabels[recommendedExample.example_type] || recommendedExample.example_type}
                  </span>
                )}
              </div>
              {recommendedExample.disclaimer && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">{recommendedExample.disclaimer}</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{recommendedExample.answer}</p>
              {recommendedExample.editing_tip && (
                <p className="mt-3 text-xs text-slate-500"><span className="font-bold">修改建议：</span>{recommendedExample.editing_tip}</p>
              )}
            </div>

            {((recommendedExample.content_to_confirm?.length ?? 0) > 0 || (recommendedExample.illustrative_details?.length ?? 0) > 0) && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(recommendedExample.content_to_confirm?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                    <h4 className="mb-2 text-xs font-black text-amber-700">使用前请确认</h4>
                    <ul className="space-y-1.5 text-xs leading-relaxed text-amber-900">
                      {recommendedExample.content_to_confirm?.map((item, itemIndex) => <li key={itemIndex}>• {item}</li>)}
                    </ul>
                  </div>
                )}
                {(recommendedExample.illustrative_details?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
                    <h4 className="mb-2 text-xs font-black text-sky-700">示范中补充的内容</h4>
                    <ul className="space-y-1.5 text-xs leading-relaxed text-sky-900">
                      {recommendedExample.illustrative_details?.map((item, itemIndex) => <li key={itemIndex}>• {item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                <Target className="w-3.5 h-3.5" /> 连环追问预测
              </h4>
              <ul className="space-y-1.5">
                {q.anticipated_follow_ups?.map((fu: string, fidx: number) => (
                  <li key={fidx} className="text-[13px] text-slate-700 flex items-start gap-2">
                    <span className="text-orange-400 font-bold leading-none mt-1">•</span>
                    <span className="flex-1">{fu}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5" /> 避坑指南
              </h4>
              {q.trap && <p className="text-[13px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-100">{q.trap}</p>}
            </div>
            {ragEvidence && (
              <div className="md:col-span-2 rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-slate-600">
                <p><span className="font-bold text-sky-700">出题依据：</span>{sourceLabel}{retrievalReasons.length > 0 ? `；${retrievalReasons.join('；')}` : ''}</p>
                {sourceDocuments.length > 0 && <p className="mt-1 truncate"><span className="font-bold text-sky-700">原始出处：</span>{sourceDocuments.map(source => `${source.document}${source.page ? ` · 第 ${source.page} 页` : ''}`).join('；')}</p>}
              </div>
            )}
            </div>
          </div>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Workspace Toolbar */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Mic className="w-5 h-5 text-orange-500" />
            面试题预测
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            基于 {job?.company || '目标公司'} 的真实面经和您的简历经历，为您生成专属面试预测。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onGenerate}
            disabled={isProcessing}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm flex items-center gap-1.5 ${
              isProcessing 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-none' 
                : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-orange-600'
            }`}
          >
            <RotateCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {isProcessing ? '正在预测...' : '重新预测'}
          </button>
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

      {/* Main Workspace */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {isProcessing && (
            <div className="py-20 text-center animate-pulse">
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4 border-[3px] border-orange-200">
                <BrainCircuit className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">AI 正在深度思考面试题...</h3>
              <p className="text-slate-500 text-sm">正在结合您的简历细节和岗位画像生成高频题单</p>
            </div>
          )}

          {!isProcessing && !parsedData && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">准备好迎接面试了吗？</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
                点击上方“重新预测”按钮，系统将深入分析您的简历亮点，结合岗位要求，生成专属的面试题库和答题策略。
              </p>
              <button 
                onClick={onGenerate}
                disabled={isProcessing}
                className={`px-6 py-2.5 text-white font-bold rounded-xl shadow-md transition-all ${
                  isProcessing
                    ? 'bg-orange-300 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 transform hover:-translate-y-0.5'
                }`}
              >
                {isProcessing ? '正在生成预测题…' : '开始生成预测题单'}
              </button>
            </div>
          )}

          {!isProcessing && parsedData && (
            <>
              {/* Overview */}
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-6 border border-orange-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <BrainCircuit className="w-32 h-32 text-orange-600" />
                </div>
                <h3 className="text-xl font-black text-orange-900 mb-2 tracking-wide flex items-center gap-2">
                  <Lightbulb className="w-6 h-6 text-orange-500" />
                  {title}
                </h3>
                <p className="text-orange-800/80 text-[14px] leading-relaxed relative z-10 text-justify font-medium">
                  {overview}
                </p>
              </div>

              {hiringRubric.length > 0 && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-800">
                    <BrainCircuit className="h-5 w-5 text-orange-500" />
                    本轮面试官判断维度
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {hiringRubric.map((item, index) => (
                      <div key={`${item.dimension}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h4 className="text-sm font-black text-slate-800">{item.dimension}</h4>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.priority === 'high' ? 'bg-red-100 text-red-700' : item.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {item.priority === 'high' ? '高优先级' : item.priority === 'medium' ? '中优先级' : '低优先级'}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-600">{item.interviewer_concern}</p>
                        {item.resume_evidence && <p className="mt-2 text-xs leading-relaxed text-emerald-700"><span className="font-bold">简历依据：</span>{item.resume_evidence}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Must-prepare Questions */}
              {mustPrepareQuestions.length > 0 && (
                <div>
                  <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-500" />
                    重点准备题（{mustPrepareQuestions.length}）
                  </h3>
                  {mustPrepareQuestions.map((q, idx) => renderQuestionCard(q, idx, false))}
                </div>
              )}

              {/* Supplementary Questions */}
              {supplementaryQuestions.length > 0 && (
                <div>
                  <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-slate-500" />
                    补充准备题（{supplementaryQuestions.length}）
                  </h3>
                  {supplementaryQuestions.map((q, idx) => renderQuestionCard(q, idx + mustPrepareQuestions.length, false))}
                </div>
              )}

              {/* Hard Questions */}
              {hardQuestions.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-red-500" />
                    高难度压力面预测
                  </h3>
                  {hardQuestions.map((q, idx) => renderQuestionCard(q, idx, true))}
                </div>
              )}

              {/* Routine Questions */}
              {routineQuestions.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-500" />
                    常规必考题
                  </h3>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {routineQuestions.map((q: string, idx: number) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                          <span className="text-emerald-500 font-bold">•</span> {q}
                        </li>
                      ))}
                    </ul>
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
