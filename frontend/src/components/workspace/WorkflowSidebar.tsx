import React from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';

export type StageStatus = 'done' | 'current' | 'pending';

export interface WorkflowStage {
  id: string;
  label: string;
  status: StageStatus;
  group: string;
}

interface WorkflowSidebarProps {
  stages: WorkflowStage[];
  activeStageId: string;
  onStageSelect: (stageId: string) => void;
}

export const WorkflowSidebar = ({ stages, activeStageId, onStageSelect }: WorkflowSidebarProps) => {
  // Group stages by their group property
  const groupedStages = stages.reduce((acc, stage) => {
    if (!acc[stage.group]) {
      acc[stage.group] = [];
    }
    acc[stage.group].push(stage);
    return acc;
  }, {} as Record<string, WorkflowStage[]>);

  // Maintain the order of groups based on their first appearance in the stages array
  const groupOrder = Array.from(new Set(stages.map(s => s.group)));

  return (
    <div className="w-[300px] bg-slate-50 border-r border-slate-200 h-full shrink-0 flex flex-col">
      <div className="p-5 border-b border-slate-200 bg-slate-100/50">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          Workflow
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {groupOrder.map(groupName => (
          <div key={groupName} className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
              {groupName}
            </h3>
            <div className="space-y-1">
              {groupedStages[groupName].map((stage) => {
                const isActive = activeStageId === stage.id;
                const isDone = stage.status === 'done';
                const isCurrent = stage.status === 'current';
                const isPending = stage.status === 'pending';

                return (
                  <button
                    key={stage.id}
                    onClick={() => onStageSelect(stage.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                      isActive 
                        ? 'bg-white shadow-sm ring-1 ring-slate-200' 
                        : 'hover:bg-slate-200/50'
                    }`}
                  >
                    <div className="shrink-0 flex items-center justify-center w-5 h-5">
                      {isDone && <Check className="w-4 h-4 text-green-600" />}
                      {isCurrent && (
                        <div className="w-3 h-3 bg-blue-600 rounded-sm transform rotate-45 relative">
                          <div className="absolute inset-0 bg-blue-400 animate-ping rounded-sm opacity-50"></div>
                        </div>
                      )}
                      {isPending && <Circle className="w-3.5 h-3.5 text-slate-300" />}
                    </div>
                    
                    <span className={`text-sm font-semibold flex-1 ${
                      isActive ? 'text-slate-900' : 
                      isDone ? 'text-slate-600' : 
                      isCurrent ? 'text-blue-700' : 'text-slate-400'
                    }`}>
                      {stage.label}
                    </span>
                    
                    {isActive && <ChevronRight className="w-4 h-4 text-slate-400 opacity-50" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
