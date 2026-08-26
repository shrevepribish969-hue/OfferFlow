import React from "react";
import { Check, Circle, Sparkles } from "lucide-react";
import type { WorkflowStage } from "./WorkflowSidebar";

interface WorkflowNavigatorProps {
  stages: WorkflowStage[];
  activeStageId: string;
  onStageSelect: (stageId: string) => void;
}

export const WorkflowNavigator = ({
  stages,
  activeStageId,
  onStageSelect,
}: WorkflowNavigatorProps) => {
  const completedCount = stages.filter((stage) => stage.status === "done").length;

  return (
    <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-3">
      <div className="flex items-center gap-4">
        <div className="hidden xl:flex items-center gap-2 shrink-0 pr-4 border-r border-slate-200">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Agent plan</div>
            <div className="text-xs font-semibold text-slate-700">{completedCount}/{stages.length} 已完成</div>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {stages.map((stage, index) => {
            const active = activeStageId === stage.id;
            const done = stage.status === "done";
            return (
              <React.Fragment key={stage.id}>
                {index > 0 && <div className={`w-4 h-px shrink-0 ${done ? "bg-emerald-300" : "bg-slate-200"}`} />}
                <button
                  onClick={() => onStageSelect(stage.id)}
                  className={`shrink-0 flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : done
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : active ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-300 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
                    </span>
                  ) : (
                    <Circle className="w-3 h-3 text-slate-300" />
                  )}
                  {stage.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
