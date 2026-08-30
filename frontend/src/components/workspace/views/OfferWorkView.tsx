import React, { useState, useEffect } from 'react';
import { Award, CheckCircle2, XCircle, Archive, Sparkles, MessageSquare, Save } from 'lucide-react';

interface OfferWorkViewProps {
  job: any;
  onStatusUpdated?: () => void;
  apiBase?: string;
}

export const OfferWorkView: React.FC<OfferWorkViewProps> = ({ job, onStatusUpdated, apiBase = "/backend-api/jobs" }) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('Offer Received');
  const [thoughts, setThoughts] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (job?.workflow_data?.offer_status) {
      const { result, thoughts } = job.workflow_data.offer_status;
      if (result) setSelectedStatus(result);
      if (thoughts) setThoughts(thoughts);
    } else if (job?.status) {
      setSelectedStatus(job.status);
    }
  }, [job]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${apiBase}/${job.id}/offer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: selectedStatus,
          thoughts: thoughts,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        if (onStatusUpdated) onStatusUpdated();
      }
    } catch (e) {
      console.error("Failed to update offer status", e);
    } finally {
      setIsSaving(false);
    }
  };

  const statusOptions = [
    {
      id: 'Offer Received',
      label: '斩获 Offer',
      desc: '恭喜！成功拿到录用通知书',
      icon: Award,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      activeRing: 'ring-amber-500',
    },
    {
      id: 'Rejected',
      label: '遗憾落榜',
      desc: '积累经验，调整心态迎接下一个机会',
      icon: XCircle,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-300',
      activeRing: 'ring-rose-500',
    },
    {
      id: 'Archived',
      label: '主动放弃 / 归档',
      desc: '流程终止或已放弃该岗位推进',
      icon: Archive,
      color: 'text-slate-600',
      bgColor: 'bg-slate-100',
      borderColor: 'border-slate-300',
      activeRing: 'ring-slate-500',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            Offer 结果与终局总结
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            为【{job?.company || '目标岗位'} - {job?.role || ''}】记录最终求职结果及复盘心路历程。
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 flex items-center justify-center">
        <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-8">
          {/* Status Selection */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              请选择该岗位的最终申请状态：
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {statusOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedStatus(opt.id)}
                    className={`p-5 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? `${opt.bgColor} ${opt.borderColor} ring-2 ${opt.activeRing} shadow-md`
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <Icon className={`w-7 h-7 mb-3 ${opt.color}`} />
                      <div className="font-bold text-slate-800 text-base mb-1">{opt.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Final Thoughts Textarea */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              求职反思与复盘总结：
            </label>
            <textarea
              value={thoughts}
              onChange={(e) => setThoughts(e.target.value)}
              placeholder="记录在此次求职/面试过程中的关键收获、技术亮点、需要改进的地方，或者 Offer 薪资待遇等备注..."
              className="w-full h-40 p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm leading-relaxed"
            />
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            {saveSuccess ? (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> 状态与思考已保存成功！
              </span>
            ) : (
              <span />
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? '保存中...' : '保存归档'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
