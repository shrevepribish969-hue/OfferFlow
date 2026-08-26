import React, { useState } from 'react';
import { InterviewWorkView } from './InterviewWorkView';
import { InterviewEvalWorkView } from './InterviewEvalWorkView';
import { Target, Mic, BrainCircuit } from 'lucide-react';

interface InterviewRoundViewProps {
  job: any;
  roundId: string; // "1", "2", "hr"
  roundLabel: string; // "一面", "二面", "HR面"
  messages: any[];
  isProcessing?: boolean;
  onGeneratePrep: (roundId: string) => void;
  onGenerateEval: (input: string, roundId: string) => void;
  onComplete: () => void;
}

export const InterviewRoundView: React.FC<InterviewRoundViewProps> = ({
  job,
  roundId,
  roundLabel,
  messages,
  isProcessing,
  onGeneratePrep,
  onGenerateEval,
  onComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'prep' | 'eval'>('prep');

  const getRoundId = (m: any) => m.data?.round_id || m.card_data?.round_id;

  // Filter messages specifically for this round_id
  const roundPrepCards = messages.filter(
    (m) => m.card_type === 'InterviewPrep' && (getRoundId(m) === roundId || (!getRoundId(m) && roundId === '1'))
  );
  const latestPrepCard = roundPrepCards[roundPrepCards.length - 1] || null;

  const roundEvalCards = messages.filter(
    (m) => m.card_type === 'InterviewEvaluation' && (getRoundId(m) === roundId || (!getRoundId(m) && roundId === '1'))
  );
  const latestEvalCard = roundEvalCards[roundEvalCards.length - 1] || null;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Sub Header / Tab Bar */}
      <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="bg-indigo-600 text-white font-bold text-xs px-2.5 py-1 rounded-md">
            {roundLabel}
          </span>
          <span className="text-sm font-semibold text-slate-700">面试全流程跟进</span>
        </div>

        <div className="flex items-center bg-slate-200/90 p-1.5 rounded-2xl gap-2 shadow-inner border border-slate-300/50">
          <button
            onClick={() => setActiveTab('prep')}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-extrabold transition-all shadow-sm ${
              activeTab === 'prep'
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50 shadow-indigo-200 shadow-md scale-[1.02]'
                : 'bg-white text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/80 border border-slate-200'
            }`}
          >
            <Target className={`w-4 h-4 ${activeTab === 'prep' ? 'text-white' : 'text-indigo-500'}`} />
            面试前预测
          </button>
          <button
            onClick={() => setActiveTab('eval')}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-extrabold transition-all shadow-sm ${
              activeTab === 'eval'
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50 shadow-indigo-200 shadow-md scale-[1.02]'
                : 'bg-white text-slate-700 hover:text-indigo-600 hover:bg-indigo-50/80 border border-slate-200'
            }`}
          >
            <Mic className={`w-4 h-4 ${activeTab === 'eval' ? 'text-white' : 'text-indigo-500'}`} />
            面后复盘反思
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'prep' ? (
          <InterviewWorkView
            job={job}
            cardMsg={latestPrepCard}
            isProcessing={isProcessing}
            onGenerate={() => onGeneratePrep(roundId)}
            onComplete={() => setActiveTab('eval')}
          />
        ) : (
          <InterviewEvalWorkView
            job={job}
            cardMsg={latestEvalCard}
            prepCardMsg={latestPrepCard}
            isProcessing={isProcessing}
            onGenerate={(input) => onGenerateEval(input, roundId)}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  );
};
