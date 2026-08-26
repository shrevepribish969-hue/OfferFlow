"use client";

import { useState, useEffect, useRef } from "react";
import { Save, Loader2, FileText, User, Eye, Code } from "lucide-react";
import { ResumeViewer, ResumeData } from "@/components/ResumeViewer";

export default function SettingsPage() {
  const [baseResume, setBaseResume] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('preview');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch("/backend-api/user/profile");
        if (response.ok) {
          const data = await response.json();
          setBaseResume(data.base_resume || "");
        }
      } catch (error) {
        console.error("Failed to fetch profile", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setMessage("");
      const response = await fetch("/backend-api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_resume: baseResume }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && !data.error) {
        setMessage("保存成功，基础简历已更新。");
      } else {
        const detail = data.detail;
        const errorMessage = typeof detail === "object" && detail
          ? `${detail.error_code || "保存失败"}：${detail.message || ""}`
          : data.error || detail || "保存失败，请稍后重试。";
        setMessage(errorMessage);
      }
    } catch (error) {
      console.error("Failed to save profile", error);
      setMessage("保存失败，请检查网络。");
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setMessage("正在解析文件...");
      
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/backend-api/user/resume_upload", {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json().catch(() => ({}));
      
      if (response.ok && !data.error) {
        setBaseResume(data.extracted_text);
        setMessage("文件解析成功，基础简历已更新。");
      } else {
        const detail = data.detail;
        const errorMessage = typeof detail === "object" && detail
          ? `${detail.error_code || "解析失败"}：${detail.message || ""}`
          : data.error || detail || "解析失败，请稍后重试。";
        setMessage(errorMessage);
      }
    } catch (error) {
      console.error("Upload failed", error);
      setMessage("解析失败，请检查网络或文件格式。");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setMessage(""), 4000);
    }
  };
  return (
    <div className="min-h-full p-8 max-w-4xl mx-auto relative">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
          <User className="w-8 h-8 text-primary" /> 个人设置
        </h1>
        <p className="text-sm text-muted-foreground mt-2 font-medium">管理你的基础档案，供 Agent 在各个求职流程中调用。</p>
      </div>

      <div className="bg-white border border-border rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold">我的基础简历 (Base Resume)</h2>
          </div>
          {message && <span className="text-sm font-medium text-green-600 truncate max-w-[200px]">{message}</span>}
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading || isSaving}
              className="bg-secondary text-secondary-foreground border border-border px-4 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-secondary/80 transition-colors disabled:opacity-50 text-sm"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              上传文件 (PDF/Word)
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || isSaving || isUploading}
              className="bg-primary text-white px-5 py-2 rounded-lg font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? "保存中..." : "保存更改"}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          上传简历后，系统将自动解析为结构化 JSON 数据。你可以在“预览简历”中查看排版效果，或在“编辑 JSON”中进行手动微调。
        </p>

        <div className="flex border-b border-border mb-4 gap-4">
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-2 px-1 font-semibold flex items-center gap-2 text-sm border-b-2 transition-colors ${activeTab === 'preview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Eye className="w-4 h-4" /> 预览简历 (Preview)
          </button>
          <button
            onClick={() => setActiveTab('edit')}
            className={`pb-2 px-1 font-semibold flex items-center gap-2 text-sm border-b-2 transition-colors ${activeTab === 'edit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Code className="w-4 h-4" /> 编辑 JSON (Edit JSON)
          </button>
        </div>

        {isLoading ? (
          <div className="h-[400px] flex items-center justify-center bg-gray-50 rounded-lg border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="bg-gray-50/50 rounded-lg border border-border overflow-hidden">
            {activeTab === 'preview' ? (
              <div className="h-[600px] overflow-y-auto p-4 bg-gray-100">
                <ResumeViewer data={(() => {
                  try {
                    return JSON.parse(baseResume) as ResumeData;
                  } catch {
                    return null;
                  }
                })()} />
              </div>
            ) : (
              <textarea
                value={baseResume}
                onChange={(e) => setBaseResume(e.target.value)}
                placeholder="鍦ㄦ绮樿创鎮ㄧ殑缁撴瀯鍖栫畝鍘?JSON 鍐呭..."
                className="w-full h-[600px] p-4 bg-transparent focus:outline-none resize-none font-mono text-[13px] leading-relaxed text-gray-800"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}


