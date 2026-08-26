import React, { useState } from 'react';
import { Send, Link as LinkIcon, Calendar, Clock, CheckCircle } from 'lucide-react';

interface ApplicationWorkViewProps {
  job: any;
  onComplete: () => void;
}

export const ApplicationWorkView = ({ job, onComplete }: ApplicationWorkViewProps) => {
  const [applied, setApplied] = useState(false);
  const [link, setLink] = useState('');
  const [applyTime, setApplyTime] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load existing data if available
  React.useEffect(() => {
    if (job?.workflow_data?.apply_status) {
      const { applied, link, apply_time, reminder_time } = job.workflow_data.apply_status;
      setApplied(applied || false);
      setLink(link || '');
      setApplyTime(apply_time || '');
      setReminderTime(reminder_time || '');
    }
  }, [job]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch(`/backend-api/jobs/${job.id}/apply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applied,
          link,
          apply_time: applyTime,
          reminder_time: reminderTime
        })
      });
      onComplete();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-500" />
            投递状态追踪
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            记录该岗位的投递进度，方便后续追踪。
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 flex items-center justify-center">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-700 text-lg">是否已投递？</label>
            <button
              onClick={() => setApplied(!applied)}
              className={`w-14 h-8 rounded-full p-1 transition-colors ${applied ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform ${applied ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {applied && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4 text-slate-400" />
                  投递链接
                </label>
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="如：https://jobs.bytedance.com/..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  投递时间
                </label>
                <input
                  type="date"
                  value={applyTime}
                  onChange={(e) => setApplyTime(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  跟进提醒时间
                </label>
                <input
                  type="date"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">设置后，系统将在该时间提醒您跟进进度。</p>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? '保存中...' : <><CheckCircle className="w-4 h-4" /> 完成</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
