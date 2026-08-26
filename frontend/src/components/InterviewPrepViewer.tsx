import React from 'react';

interface SourceDocument {
  document?: string;
  page?: number | null;
}

interface InterviewQuestion {
  question_text?: string;
  question?: string;
  dimension?: string;
  interviewer_intent?: string;
  question_origin?: string;
  rag_question_id?: string | null;
  competency?: string;
  source?: string | { company?: string };
  suggested_answer_star?: string;
  anticipated_follow_ups?: string[];
  trap?: string;
  rag_evidence?: {
    retrieval?: { reasons?: string[] };
    source?: { documents?: SourceDocument[] };
  };
}

interface InterviewPrepData {
  title?: string;
  overview_text?: string;
  questions?: InterviewQuestion[];
  technical_hard_questions?: InterviewQuestion[];
  routine_questions?: string[];
}

interface InterviewPrepProps {
  data?: InterviewPrepData | null;
}

export default function InterviewPrepViewer({ data }: InterviewPrepProps) {
  if (!data) return <div style={{ padding: '2rem', color: '#888' }}>加载中...</div>;

  // Support both new schema (questions) and old
  const title = data.title;
  const overview = data.overview_text;
  const questions = data.questions || [];
  const technicalHard = data.technical_hard_questions || [];
  const routine = data.routine_questions || [];

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '780px', margin: '0 auto', padding: '2rem', lineHeight: '1.7', color: '#1a1a2e' }}>

      {/* Title */}
      {title && (
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1.25rem', color: '#111' }}>
          {title}
        </h1>
      )}

      {/* Overview */}
      {overview && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: '0.6rem' }}>
            本轮策略分析
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#333', margin: 0 }}>
            {overview}
          </p>
        </section>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: '2rem' }} />

      {/* Questions */}
      {questions.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: '1.5rem' }}>
            高频真题预测
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {questions.map((q, idx) => (
              <div key={idx}>
                {/* Question */}
                <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem', color: '#111' }}>
                  <span style={{ color: '#6366f1', marginRight: '0.4rem' }}>{idx + 1}.</span>
                  {q.question_text || q.question}
                </p>

                {/* Meta: competency + source */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                  {q.competency && (
                    <span style={{ fontSize: '0.78rem', color: '#6366f1', background: '#eef2ff', padding: '2px 10px', borderRadius: '20px', fontWeight: 600 }}>
                      {q.competency}
                    </span>
                  )}
                  {q.source && (
                    <span style={{ fontSize: '0.78rem', color: '#888' }}>
                      {typeof q.source === 'string' ? q.source : `来源：${q.source.company || '面经知识库'}`}
                    </span>
                  )}
                </div>

                {q.rag_evidence && (
                  <div style={{ marginBottom: '0.8rem', padding: '0.65rem 0.8rem', borderRadius: '8px', background: '#f0f9ff', border: '1px solid #e0f2fe', fontSize: '0.78rem', color: '#475569' }}>
                    <div><strong style={{ color: '#0369a1' }}>推荐理由：</strong>{(q.rag_evidence.retrieval?.reasons || []).join('；')}</div>
                    {(q.rag_evidence.source?.documents?.length ?? 0) > 0 && (
                      <div><strong style={{ color: '#0369a1' }}>原始出处：</strong>{(q.rag_evidence.source?.documents || []).map((source) => `${source.document}${source.page ? ` · 第 ${source.page} 页` : ''}`).join('；')}</div>
                    )}
                  </div>
                )}

                {/* Suggested Answer STAR */}
                {q.suggested_answer_star && (
                  <div style={{ marginBottom: '0.7rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid #6366f1' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4338ca', display: 'block', marginBottom: '0.4rem' }}>推荐答题思路 (STAR)</span>
                    <span style={{ fontSize: '0.88rem', color: '#333', whiteSpace: 'pre-line' }}>{q.suggested_answer_star}</span>
                  </div>
                )}

                {/* Anticipated Follow-ups */}
                {q.anticipated_follow_ups && q.anticipated_follow_ups.length > 0 && (
                  <div style={{ marginBottom: '0.7rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '0.3rem' }}>预判连环追问</span>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyle: 'circle' }}>
                      {q.anticipated_follow_ups.map((followUp: string, pIdx: number) => (
                        <li key={pIdx} style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '0.2rem' }}>{followUp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trap */}
                {q.trap && (
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b45309' }}>防踩坑　</span>
                    <span style={{ fontSize: '0.88rem', color: '#92400e' }}>{q.trap}</span>
                  </div>
                )}

                {idx < questions.length - 1 && (
                  <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '1.5rem' }} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Routine questions */}
      {routine.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: '0.8rem' }}>
            常规题目
          </h2>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyle: 'disc' }}>
            {routine.map((rq: string, idx: number) => (
              <li key={idx} style={{ fontSize: '0.88rem', color: '#555', marginBottom: '0.3rem' }}>{rq}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Technical Hard questions */}
      {technicalHard.length > 0 && (
        <section>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ef4444', marginBottom: '1.5rem' }}>
            技术偏难题 (硬核深度挖掘)
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {technicalHard.map((q, idx) => (
              <div key={idx}>
                {/* Question */}
                <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem', color: '#111' }}>
                  <span style={{ color: '#ef4444', marginRight: '0.4rem' }}>{idx + 1}.</span>
                  {q.question_text || q.question}
                </p>

                {/* Meta: competency + source */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                  {q.competency && (
                    <span style={{ fontSize: '0.78rem', color: '#ef4444', background: '#fef2f2', padding: '2px 10px', borderRadius: '20px', fontWeight: 600 }}>
                      {q.competency}
                    </span>
                  )}
                  {q.source && (
                    <span style={{ fontSize: '0.78rem', color: '#888' }}>
                      {typeof q.source === 'string' ? q.source : `来源：${q.source.company || '面经知识库'}`}
                    </span>
                  )}
                </div>

                {/* Suggested Answer STAR */}
                {q.suggested_answer_star && (
                  <div style={{ marginBottom: '0.7rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b91c1c', display: 'block', marginBottom: '0.4rem' }}>推荐答题思路 (STAR)</span>
                    <span style={{ fontSize: '0.88rem', color: '#333', whiteSpace: 'pre-line' }}>{q.suggested_answer_star}</span>
                  </div>
                )}

                {/* Anticipated Follow-ups */}
                {q.anticipated_follow_ups && q.anticipated_follow_ups.length > 0 && (
                  <div style={{ marginBottom: '0.7rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '0.3rem' }}>预判连环追问</span>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyle: 'circle' }}>
                      {q.anticipated_follow_ups.map((followUp: string, pIdx: number) => (
                        <li key={pIdx} style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '0.2rem' }}>{followUp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trap */}
                {q.trap && (
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b45309' }}>防踩坑　</span>
                    <span style={{ fontSize: '0.88rem', color: '#92400e' }}>{q.trap}</span>
                  </div>
                )}

                {idx < technicalHard.length - 1 && (
                  <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '1.5rem' }} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
