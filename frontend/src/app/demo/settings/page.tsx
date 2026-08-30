"use client";

import { useState } from "react";
import { Database, Loader2, RotateCcw, ShieldCheck } from "lucide-react";

export default function DemoSettingsPage() {
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");

  const reset = async () => {
    try {
      setResetting(true);
      setMessage("");
      const response = await fetch("/backend-api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error();
      setMessage("Demo 数据已恢复为初始状态。刷新岗位管理页即可查看。");
    } catch {
      setMessage("重置失败，请稍后重试。");
    } finally {
      setResetting(false);
    }
  };

  return <div className="min-h-full p-8 max-w-4xl mx-auto">
    <div className="mb-8"><h1 className="text-3xl font-black text-foreground flex items-center gap-3"><Database className="text-indigo-600" /> Demo 设置</h1><p className="mt-2 text-sm font-medium text-muted-foreground">管理公开体验环境，不会接触正式版的任何数据。</p></div>
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-emerald-600" /><div><h2 className="font-bold text-slate-900">数据隔离</h2><p className="mt-1 leading-6 text-sm text-slate-600">岗位、对话和操作记录均保存在公开 Demo 数据集中；内置简历为虚拟资料，正式版数据不可见也不会被修改。</p></div></div>
      <div className="mt-6 border-t border-slate-100 pt-6"><h2 className="font-bold text-slate-900">恢复初始体验数据</h2><p className="mt-1 text-sm text-slate-600">会清空 Demo 中体验者产生的岗位与对话，再恢复 8 个内置岗位。</p><button onClick={reset} disabled={resetting} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{resetting ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}{resetting ? "重置中…" : "重置 Demo 数据"}</button>{message && <p className="mt-3 text-sm font-medium text-indigo-700">{message}</p>}</div>
    </div>
  </div>;
}
