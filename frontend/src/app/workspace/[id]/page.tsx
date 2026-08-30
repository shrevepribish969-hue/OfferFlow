"use client";

import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { X, Sparkles } from "lucide-react";
import { JobOverviewHeader } from "@/components/workspace/JobOverviewHeader";
import { WorkflowStage } from "@/components/workspace/WorkflowSidebar";
import { AiCopilotSidebar } from "@/components/workspace/AiCopilotSidebar";
import { ResumeWorkView } from "@/components/workspace/views/ResumeWorkView";
import { JDAnalysisView } from "@/components/workspace/views/JDAnalysisView";
import { JobMatchView } from "@/components/workspace/views/JobMatchView";
import { ApplicationWorkView } from "@/components/workspace/views/ApplicationWorkView";
import { InterviewRoundView } from "@/components/workspace/views/InterviewRoundView";
import { OfferWorkView } from "@/components/workspace/views/OfferWorkView";

interface JobCase {
  id: number;
  company: string;
  role: string;
  status: string;
  match_score: number | null;
  updated_at: string;
  jd_content: string;
  workflow_data?: any;
}

interface FeedbackEvent {
  id: number;
  message_id?: string | null;
  card_type?: string | null;
  feedback: string;
  feedback_type: string;
  event_data?: {
    ai_run_id?: number;
    [key: string]: any;
  } | null;
  created_at?: string | null;
}

interface AIRun {
  id: number;
  workflow_name: string;
  agent_name?: string | null;
  status: string;
  model_name?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  run_data?: {
    card_type?: string;
    artifact_count?: number | null;
    sidebar_summary?: string | null;
    [key: string]: any;
  } | null;
  started_at?: string | null;
}

const sanitizeAssistantText = (value: unknown) => {
  let text = String(value || "");
  const internalAgentNames = [
    "Case Manager Agent",
    "Resume Agent",
    "Interview Agent",
    "Communication Agent",
    "Reflection Agent",
    "岗位分析 Agent",
    "岗位匹配 Agent",
    "简历优化 Agent",
    "简历生成 Agent",
    "面试准备 Agent",
    "面试复盘 Agent",
    "沟通话术 Agent",
    "复盘记忆 Agent",
    "求职进度 Agent",
  ];
  internalAgentNames.forEach((name) => {
    text = text.replaceAll(`我会请 ${name}`, "我会");
    text = text.replaceAll(`我会调用 ${name}`, "我会");
    text = text.replaceAll(name, "");
  });
  return text.replace(/ {2,}/g, " ").trim();
};

export default function WorkspaceV3() {
  const params = useParams();
  const searchParams = useSearchParams();
  const apiBase = searchParams.get("demo") === "1" ? "/backend-api/demo/jobs" : "/backend-api/jobs";
  
  const [job, setJob] = useState<JobCase | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeStageId, setActiveStageId] = useState<string>("");
  const [chatLoaded, setChatLoaded] = useState(false);
  const [openingLoaded, setOpeningLoaded] = useState(false);
  const [caseOpening, setCaseOpening] = useState<string>("");
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    "直接优化简历",
    "分析岗位要求",
    "生成投递话术",
    "准备面试",
  ]);
  const [completedStageIds, setCompletedStageIds] = useState<string[]>([]);
  const [feedbackEvents, setFeedbackEvents] = useState<FeedbackEvent[]>([]);
  const [aiRuns, setAiRuns] = useState<AIRun[]>([]);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(38);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const fetchFeedbackEvents = async (jobId: string | number) => {
    try {
      const res = await fetch(`${apiBase}/${jobId}/feedback`);
      if (res.ok) {
        const data = await res.json();
        setFeedbackEvents(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAiRuns = async (jobId: string | number) => {
    try {
      const res = await fetch(`${apiBase}/${jobId}/ai_runs`);
      if (res.ok) {
        const data = await res.json();
        setAiRuns(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch Job & Chat History
  useEffect(() => {
    if (params?.id) {
      fetch(`${apiBase}/${params.id}`)
        .then((res) => res.json())
        .then((data) => setJob(data))
        .catch((err) => console.error(err));

      fetch(`${apiBase}/${params.id}/chat`)
        .then((res) => res.json())
        .then((history) => {
          if (history && history.length > 0) {
            const parsedMessages = history.map((msg: any, index: number, arr: any[]) => {
              if (msg.role === "agent") {
                try {
                  const data = JSON.parse(msg.content);
                  if (data.card) {
                    const isLegacyJdArtifact = ["ExecutionSummary", "JDAnalysis"].includes(data.card.card_type);
                    if (data.card.card_type === "ApplicationStatus") {
                      const applyStatus = data.card.data?.apply_status || {};
                      const linkPrompt = applyStatus.link
                        ? "投递链接也已经保存，之后可以直接从这里打开。"
                        : "为了方便后续一键跳转，需要我同时记录投递链接吗？你可以直接把链接发给我。";
                      return {
                        id: msg.id.toString(),
                        role: "agent",
                        type: "text",
                        content: sanitizeAssistantText(`${data.card.content || "投递记录已更新。"}\n\n${linkPrompt}`),
                        is_system_hidden: false,
                      };
                    }
                    return { id: msg.id.toString(), role: "agent", type: "card", card_type: data.card.card_type, content: sanitizeAssistantText(data.card.content), data: data.card.data, is_system_hidden: isLegacyJdArtifact };
                  }
                  return { id: msg.id.toString(), role: "agent", type: "text", content: sanitizeAssistantText(msg.content), is_system_hidden: msg.is_system_trigger };
                } catch (e) {
                  // Heuristic to hide raw markdown that the backend generated for cards
                  const isRawCardText = msg.content.includes("【岗位名称】") || msg.content.includes("【岗位摘要】");
                  return { id: msg.id.toString(), role: "agent", type: "text", content: sanitizeAssistantText(msg.content), is_system_hidden: msg.is_system_trigger || isRawCardText };
                }
              }
              return { id: msg.id.toString(), role: "user", type: "text", content: msg.content };
            });
            setMessages(parsedMessages);
          }
          setChatLoaded(true);
        })
        .catch((err) => {
          console.error(err);
          setChatLoaded(true);
        });

      fetch(`${apiBase}/${params.id}/opening`)
        .then((res) => {
          if (!res.ok) throw new Error(`opening request failed: ${res.status}`);
          return res.json();
        })
        .then((opening) => {
          setCaseOpening(opening.message || "");
          if (Array.isArray(opening.suggestions) && opening.suggestions.length > 0) {
            setSuggestedActions(opening.suggestions);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setOpeningLoaded(true));

      fetchFeedbackEvents(params.id as string);
      fetchAiRuns(params.id as string);
    }
  }, [params, apiBase]);

  useEffect(() => {
    if (!chatLoaded || !openingLoaded || !job) return;
    if (messages.some((message) => message.id === "case-agent-welcome")) return;
    setMessages((previous) => [{
      id: "case-agent-welcome",
      role: "agent",
      type: "text",
      content: caseOpening || `我目前获取到你想分析的岗位是 ${job.company || "这个公司"} · ${job.role || "这个岗位"}。\n\n你下一步更想解决什么？可以直接用自己的话告诉我。`,
    }, ...previous]);
  }, [chatLoaded, openingLoaded, caseOpening, job, messages.length]);

  // Derived Workflow Stages based on messages/job progress & user completions
  const isStageDone = (id: string) => {
    if (completedStageIds.includes(id)) return true;
    if (id === "jd" && messages.some(m => m.card_type === "ExecutionSummary")) return true;
    if (id === "match" && messages.some(m => m.card_type === "MatchAnalysis")) return true;
    if (id === "resume" && messages.some(m => m.card_type === "ResumeOptimizer")) return true;
    if (id === "apply" && job?.workflow_data?.apply_status) return true;
    if (id === "interview_1" && messages.some(m => (m.card_type === "InterviewPrep" || m.card_type === "InterviewEvaluation") && ((m.data?.round_id || m.card_data?.round_id) === "1" || !(m.data?.round_id || m.card_data?.round_id)))) return true;
    if (id === "interview_2" && messages.some(m => (m.card_type === "InterviewPrep" || m.card_type === "InterviewEvaluation") && (m.data?.round_id || m.card_data?.round_id) === "2")) return true;
    if (id === "interview_hr" && messages.some(m => (m.card_type === "InterviewPrep" || m.card_type === "InterviewEvaluation") && (m.data?.round_id || m.card_data?.round_id) === "hr")) return true;
    if (id === "offer" && job?.workflow_data?.offer_status) return true;
    return false;
  };

  const rawStages = [
    { id: "jd", label: "JD 解析", group: "岗位准备" },
    { id: "match", label: "岗位匹配", group: "岗位准备" },
    { id: "resume", label: "简历定向优化", group: "岗位准备" },
    { id: "apply", label: "投递状态", group: "投递流程" },
    { id: "interview_1", label: "一面", group: "面试流程" },
    { id: "interview_2", label: "二面", group: "面试流程" },
    { id: "interview_hr", label: "HR面", group: "面试流程" },
    { id: "offer", label: "Offer 跟进", group: "结果" }
  ];

  const stages: WorkflowStage[] = rawStages.map(s => {
    const done = isStageDone(s.id);
    const isCurrent = activeStageId === s.id;
    return {
      ...s,
      status: done ? "done" : isCurrent ? "current" : "pending"
    };
  });

  const activeStageObj = stages.find(s => s.id === activeStageId);

  // Handle message sending (stream processing omitted for brevity, keeping structure similar)
  const handleSendText = async (textToSubmit: string, isSystemTrigger = false, systemWorkflow?: string, roundId?: string) => {
    if ((!textToSubmit.trim() && !isSystemTrigger) || isSending || !job) return;

    if (!isSystemTrigger) {
      const sentAt = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: sentAt.toString(), role: "user", type: "text", content: textToSubmit },
        {
          id: `thinking-${sentAt}`,
          role: "agent",
          type: "agent_run",
          main_status: "Case Agent 正在理解你的目标…",
          steps: [],
          is_completed: false,
        },
      ]);
    }
    setIsSending(true);

    const requestController = new AbortController();
    // Specialist work such as interview preparation can combine local retrieval
    // with a long model response. Keep one generous ceiling for conversational
    // routing too, because the chosen workflow is only known by the backend.
    const requestTimeoutMs = 330000;
    const requestTimeout = window.setTimeout(() => requestController.abort(), requestTimeoutMs);

    try {
      const response = await fetch(`${apiBase}/${job.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSubmit || "system_trigger", is_system_trigger: isSystemTrigger, system_workflow: systemWorkflow, round_id: roundId }),
        signal: requestController.signal,
      });

      if (!response.ok) {
        throw new Error(`请求失败（${response.status}）`);
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let eventBuffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          eventBuffer += decoder.decode(value, { stream: true });
          const lines = eventBuffer.split("\n");
          eventBuffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (Array.isArray(data.data?.suggestions) && data.data.suggestions.length > 0) {
                setSuggestedActions(data.data.suggestions);
              }
              setMessages((prev) => {
                const newMessages = [...prev];
                if (data.type === "text" || data.type === "card") {
                  // Remove the instant waiting cue once a real response arrives.
                  // It should never remain as a standalone "completed" block.
                  for (let i = newMessages.length - 1; i >= 0; i--) {
                    if (String(newMessages[i].id).startsWith("thinking-") && !newMessages[i].is_completed) {
                      newMessages.splice(i, 1);
                    }
                  }
                  newMessages.push({
                    id: Date.now().toString() + Math.random(),
                    role: "agent", type: data.type, content: sanitizeAssistantText(data.content), card_type: data.card_type, data: data.data,
                    is_system_hidden: false
                  });
                  // Mark a real streamed analysis run complete. The lightweight
                  // waiting cue above has already been removed.
                  for (let i = newMessages.length - 2; i >= 0; i--) {
                    if (newMessages[i].type === "agent_run" && !newMessages[i].is_completed) {
                      newMessages[i].is_completed = true;
                      newMessages[i].main_status = "已完成";
                      newMessages[i].steps = (newMessages[i].steps || []).map((step: any) => ({ ...step, status: "done" }));
                      break;
                    }
                  }
                  return newMessages;
                }

                let agentRunMsg = newMessages[newMessages.length - 1];
                if (!agentRunMsg || agentRunMsg.role !== "agent" || agentRunMsg.type !== "agent_run" || agentRunMsg.is_completed) {
                  agentRunMsg = { id: Date.now().toString() + Math.random(), role: "agent", type: "agent_run", main_status: "正在处理...", steps: [], is_completed: false };
                  newMessages.push(agentRunMsg);
                }

                if (data.type === "progress") {
                  agentRunMsg.main_status = data.content;
                  if (data.data?.steps) {
                    agentRunMsg.steps = data.data.steps.map((s: string) => ({ content: s, status: "running" }));
                  }
                } else if (data.type === "main_status") {
                  agentRunMsg.main_status = data.content;
                  if (data.content === "已完成") agentRunMsg.is_completed = true;
                } else if (data.type === "sub_status") {
                  const existingStepIndex = agentRunMsg.steps.findIndex((s: any) => s.content === data.content);
                  if (existingStepIndex >= 0) agentRunMsg.steps[existingStepIndex].status = data.status;
                  else agentRunMsg.steps.push({ content: data.content, status: data.status });
                }
                return newMessages;
              });
              if (data.type === "card" && job) {
                fetchAiRuns(job.id);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      const errorText = error instanceof DOMException && error.name === "AbortError"
        ? "生成超时，请点击“重新预测”再试一次。"
        : `生成失败：${error instanceof Error ? error.message : "未知错误"}`;
      setMessages((prev) => {
        const completed = prev.map((message) =>
          message.type === "agent_run" && !message.is_completed
            ? { ...message, is_completed: true, main_status: "请求未完成" }
            : message
        );
        return [...completed, {
          id: `error-${Date.now()}`,
          role: "agent",
          type: "text",
          content: errorText,
        }];
      });
    } finally {
      window.clearTimeout(requestTimeout);
      setIsSending(false);
    }
  };

  if (!job) {
    return <div className="p-8 text-slate-400 animate-pulse text-center w-full h-screen flex items-center justify-center">Loading Workspace...</div>;
  }

  // Handlers for Workspace View buttons
  const handleStageComplete = (_nextStageId: string) => {
    setCompletedStageIds((prev) => Array.from(new Set([...prev, activeStageId])));
    setIsCanvasOpen(false);
  };

  const handleStageSelect = (stageId: string) => {
    setActiveStageId(stageId);
    setIsCanvasOpen(true);
  };

  const handleOpenCanvasForCard = (cardType?: string, data?: any) => {
    const stageByCard: Record<string, string> = {
      MatchAnalysis: "match",
      ResumeOptimizer: "resume",
      ContentGeneration: "resume",
      ApplicationStatus: "apply",
      InterviewPrep: data?.round_id === "2" ? "interview_2" : data?.round_id === "hr" ? "interview_hr" : "interview_1",
      InterviewEvaluation: data?.round_id === "2" ? "interview_2" : data?.round_id === "hr" ? "interview_hr" : "interview_1",
    };
    if (!cardType || !stageByCard[cardType]) return;
    setActiveStageId(stageByCard[cardType]);
    setIsCanvasOpen(true);
  };

  const getDefaultArtifactStage = () => {
    const latestCard = messages.slice().reverse().find((message) =>
      ["MatchAnalysis", "ResumeOptimizer", "ContentGeneration", "ApplicationStatus", "InterviewPrep", "InterviewEvaluation"].includes(message.card_type)
    );
    if (latestCard) {
      const roundId = latestCard.data?.round_id || latestCard.card_data?.round_id;
      if (latestCard.card_type === "MatchAnalysis") return "match";
      if (["ResumeOptimizer", "ContentGeneration"].includes(latestCard.card_type)) return "resume";
      if (latestCard.card_type === "ApplicationStatus") return "apply";
      if (["InterviewPrep", "InterviewEvaluation"].includes(latestCard.card_type)) {
        return roundId === "2" ? "interview_2" : roundId === "hr" ? "interview_hr" : "interview_1";
      }
    }
    const workflowData = job?.workflow_data || {};
    if (workflowData.offer_status) return "offer";
    if (workflowData.interview_evaluation_result || workflowData.interview_prep_result) return "interview_1";
    if (workflowData.apply_status) return "apply";
    if (workflowData.resume_optimization_result || workflowData.content_generation_result || workflowData.resume_json) return "resume";
    if (workflowData.job_matching_result || job?.match_score !== null) return "match";
    return "";
  };

  const defaultArtifactStage = getDefaultArtifactStage();
  const handleToggleCanvas = () => {
    if (isCanvasOpen) {
      setIsCanvasOpen(false);
      return;
    }
    if (!activeStageId && defaultArtifactStage) {
      setActiveStageId(defaultArtifactStage);
    }
    if (activeStageId || defaultArtifactStage) {
      setIsCanvasOpen(true);
    }
  };

  const beginCanvasResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!workspaceRef.current) return;
    event.preventDefault();
    const container = workspaceRef.current;
    const handleMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const nextWidth = ((rect.right - moveEvent.clientX) / rect.width) * 100;
      setCanvasWidth(Math.min(65, Math.max(30, nextWidth)));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleRegenerate = (workflowName: string) => {
    handleSendText("", true, workflowName);
  };

  const handleSubmitFeedback = async (payload: { message_id?: string; card_type?: string; feedback: string; feedback_type?: string; feedback_code?: string; feedback_category?: string; ai_run_id?: number }) => {
    if (!job) return;
    try {
      const res = await fetch(`${apiBase}/${job.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          feedback_type: payload.feedback_type || "quality",
          event_data: {
            source: "copilot_card",
            active_stage_id: activeStageId,
            ai_run_id: payload.ai_run_id,
            feedback_code: payload.feedback_code,
            feedback_category: payload.feedback_category,
            feedback_label: payload.feedback,
          }
        })
      });
      if (res.ok) {
        await fetchFeedbackEvents(job.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Render the central workspace view based on activeStageId
  const renderWorkspaceView = () => {
    // Find if there's an ongoing processing task
    const latestAgentRun = messages.slice().reverse().find(m => m.type === "agent_run");
    const isProcessing = latestAgentRun ? !latestAgentRun.is_completed : false;

    switch (activeStageId) {
      case "jd":
        const jdCards = messages.filter(m => (m.card_type === "ExecutionSummary" || m.card_type === "JDAnalysis") && !m.content?.includes("Greeting generated") && m.card_type !== "GreetingGeneration");
        const latestJdCard = jdCards[jdCards.length - 1] || null;
        return (
          <JDAnalysisView 
            job={job} 
            cardMsg={latestJdCard} 
            isProcessing={isProcessing}
            onComplete={() => handleStageComplete("match")}
            onRegenerate={() => handleRegenerate("JDAnalysis")}
          />
        );
      case "match":
        const matchCards = messages.filter(m => m.card_type === "MatchAnalysis");
        const latestMatchCard = matchCards[matchCards.length - 1] || null;
        return (
          <JobMatchView 
            job={job}
            cardMsg={latestMatchCard}
            isProcessing={isProcessing}
            onComplete={() => handleStageComplete("resume")}
            onRegenerate={() => handleRegenerate("JobMatching")}
          />
        );
      case "resume":
        const resumeCards = messages.filter(m => m.card_type === "ResumeOptimizer");
        const latestResumeCard = resumeCards[resumeCards.length - 1] || null;
        
        const contentCards = messages.filter(m => m.card_type === "ContentGeneration");
        const latestContentCard = contentCards[contentCards.length - 1] || null;
        
        return (
          <ResumeWorkView 
            job={job} 
            cardMsg={latestResumeCard} 
            finalResumeCard={latestContentCard}
            isProcessing={isProcessing}
            progressSteps={isProcessing ? latestAgentRun?.steps : undefined}
            onComplete={() => handleStageComplete("apply")} 
            onRegenerate={() => handleRegenerate("ResumeOptimization")} 
            onGenerateResume={(acceptedIndices) => handleSendText(JSON.stringify({ accepted_indices: acceptedIndices }), true, "ContentGeneration")}
          />
        );
      case "apply":
        return (
          <ApplicationWorkView 
            job={job}
            apiBase={apiBase}
            onComplete={() => handleStageComplete("interview_1")}
          />
        );
      case "interview_1":
        return (
          <InterviewRoundView
            job={job}
            roundId="1"
            roundLabel="一面"
            messages={messages}
            isProcessing={isProcessing}
            onGeneratePrep={(rId) => handleSendText("", true, "InterviewPrep", rId)}
            onGenerateEval={(input, rId) => handleSendText(input, true, "InterviewEvaluation", rId)}
            onComplete={() => handleStageComplete("interview_2")}
          />
        );
      case "interview_2":
        return (
          <InterviewRoundView
            job={job}
            roundId="2"
            roundLabel="二面"
            messages={messages}
            isProcessing={isProcessing}
            onGeneratePrep={(rId) => handleSendText("", true, "InterviewPrep", rId)}
            onGenerateEval={(input, rId) => handleSendText(input, true, "InterviewEvaluation", rId)}
            onComplete={() => handleStageComplete("interview_hr")}
          />
        );
      case "interview_hr":
        return (
          <InterviewRoundView
            job={job}
            roundId="hr"
            roundLabel="HR面"
            messages={messages}
            isProcessing={isProcessing}
            onGeneratePrep={(rId) => handleSendText("", true, "InterviewPrep", rId)}
            onGenerateEval={(input, rId) => handleSendText(input, true, "InterviewEvaluation", rId)}
            onComplete={() => handleStageComplete("offer")}
          />
        );
      case "offer":
        return (
          <OfferWorkView
            job={job}
            apiBase={apiBase}
            onStatusUpdated={() => {
              // Reload job case to reflect updated status
              if (params.id) {
                fetch(apiBase)
                  .then((res) => res.json())
                  .then((jobs) => {
                    const currentJob = jobs.find((j: any) => j.id === Number(params.id));
                    if (currentJob) setJob(currentJob);
                  });
              }
            }}
          />
        );
      default:
        return <div className="p-8">Select a stage</div>;
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f4f5f8] overflow-hidden font-sans">
      <JobOverviewHeader
        job={job}
        currentStageLabel={isCanvasOpen ? activeStageObj?.label : undefined}
        isCanvasOpen={isCanvasOpen}
        hasArtifacts={Boolean(defaultArtifactStage)}
        onToggleCanvas={handleToggleCanvas}
      />

      <div ref={workspaceRef} className="flex-1 flex gap-2 overflow-hidden p-3">
        <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <AiCopilotSidebar
            messages={messages}
            input={input}
            setInput={setInput}
            isSending={isSending}
            onSend={(text) => handleSendText(text)}
            suggestedActions={suggestedActions}
            feedbackEvents={feedbackEvents}
            onSubmitFeedback={handleSubmitFeedback}
            aiRuns={aiRuns}
            activeStageLabel={activeStageObj?.label}
            isCanvasOpen={isCanvasOpen}
            onOpenCanvas={handleOpenCanvasForCard}
          />
        </section>

        {isCanvasOpen && (
          <div
            role="separator"
            aria-label="调整对话与成果区域宽度"
            aria-orientation="vertical"
            onPointerDown={beginCanvasResize}
            className="hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center rounded-full hover:bg-indigo-50 group"
          >
            <div className="h-12 w-1 rounded-full bg-slate-200 group-hover:bg-indigo-300 transition-colors" />
          </div>
        )}

        {isCanvasOpen && (
          <section
            className="fixed inset-3 z-40 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl flex flex-col lg:static lg:w-[var(--canvas-width)] lg:min-w-[380px] lg:max-w-[65%] lg:shadow-sm"
            style={{ "--canvas-width": `${canvasWidth}%` } as any}
          >
            <div className="h-12 shrink-0 border-b border-slate-100 bg-white px-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Canvas</div>
                  <div className="text-xs font-bold text-slate-800 truncate">{activeStageObj?.label || "任务成果"}</div>
                </div>
              </div>
              <button
                onClick={() => setIsCanvasOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="关闭 Canvas"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{renderWorkspaceView()}</div>
          </section>
        )}
      </div>
    </div>
  );
}
