"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Check, Loader2, Pencil, X } from "lucide-react";

interface MemoryItem {
  id: number;
  category: string;
  content: string;
  confidence: number;
  is_confirmed: -1 | 0 | 1;
  is_active: 0 | 1;
  source_type: string;
}

const API_URL = "/backend-api/memory/items";

export default function MemoryPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(API_URL)
      .then((response) => {
        if (!response.ok) throw new Error("记忆加载失败");
        return response.json() as Promise<MemoryItem[]>;
      })
      .then((data) => {
        setItems(data);
        setDrafts(Object.fromEntries(data.map((item) => [item.id, item.content])));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "记忆加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => ({
    pending: items.filter((item) => item.is_confirmed === 0),
    confirmed: items.filter((item) => item.is_confirmed === 1),
    rejected: items.filter((item) => item.is_confirmed === -1),
  }), [items]);

  const review = async (item: MemoryItem, action: "confirm" | "reject") => {
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch(`${API_URL}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, content: drafts[item.id] }),
      });
      if (!response.ok) throw new Error("记忆更新失败");
      const updated = await response.json() as MemoryItem;
      setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "记忆更新失败");
    } finally {
      setSavingId(null);
    }
  };

  const renderItems = (sectionItems: MemoryItem[], editable: boolean) => (
    <div className="space-y-3">
      {sectionItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">暂无内容</div>
      )}
      {sectionItems.map((item) => (
        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{item.category}</span>
            <span className="text-xs text-slate-400">来自 {item.source_type} · 置信度 {Math.round(item.confidence * 100)}%</span>
          </div>
          {editable ? (
            <div className="flex gap-2">
              <Pencil className="mt-2.5 h-4 w-4 shrink-0 text-slate-400" />
              <textarea
                value={drafts[item.id] ?? item.content}
                onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                className="min-h-20 flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400"
              />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-slate-700">{item.content}</p>
          )}
          {editable && (
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => review(item, "reject")} disabled={savingId === item.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <X className="h-3.5 w-3.5" />拒绝
              </button>
              <button onClick={() => review(item, "confirm")} disabled={savingId === item.id} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                {savingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}确认并启用
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <main className="min-h-screen flex-1 bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><BrainCircuit className="h-6 w-6 text-indigo-600" />可确认记忆</h1>
          <p className="mt-2 text-sm text-slate-500">AI 从面试复盘中提取候选记忆。只有你确认后的内容，才会用于后续面试准备。</p>
        </div>
        {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在加载记忆</div>
        ) : (
          <div className="space-y-9">
            <section><h2 className="mb-3 text-sm font-black text-amber-700">待你确认 · {groups.pending.length}</h2>{renderItems(groups.pending, true)}</section>
            <section><h2 className="mb-3 text-sm font-black text-emerald-700">已确认并生效 · {groups.confirmed.length}</h2>{renderItems(groups.confirmed, false)}</section>
            {groups.rejected.length > 0 && <section><h2 className="mb-3 text-sm font-black text-slate-500">已拒绝 · {groups.rejected.length}</h2>{renderItems(groups.rejected, false)}</section>}
          </div>
        )}
      </div>
    </main>
  );
}
