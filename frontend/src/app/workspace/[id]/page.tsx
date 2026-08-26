"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { X, Sparkles } from "lucide-react";
import { JobOverviewHeader } from "@/components/workspace/JobOverviewHeader";
import { WorkflowStage } from "@/components/workspace/WorkflowSidebar";
import { WorkflowNavigator } from "@/components/workspace/WorkflowNavigator";
import { AiCopilotSidebar, NextBestAction } from "@/components/workspace/AiCopilotSidebar";
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

export default function WorkspaceV3() {
  const params = useParams();
  
  const [job, setJob] = useState<JobCase | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeStageId, setActiveStageId] = useState<string>("");
  const [chatLoaded, setChatLoaded] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    "直接优化简历",
    "分析岗位要求",
    "生成投递话术",
    "准备面试",
  ]);
  const [completedStageIds, setCompletedStageIds] = useState<string[]>([]);
  const [dismissedRecommendationKey, setDismissedRecommendationKey] = useState<string | null>(null);
  const [feedbackEvents, setFeedbackEvents] = useState<FeedbackEvent[]>([]);
  const [aiRuns, setAiRuns] = useState<AIRun[]>([]);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);

  const fetchFeedbackEvents = async (jobId: string | number) => {
    try {
      const res = await fetch(`/backend-api/jobs/${jobId}/feedback`);
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
      const res = await fetch(`/backend-api/jobs/${jobId}/ai_runs`);
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
      fetch(`/backend-api/jobs/${params.id}`)
        .then((res) => res.json())
        .then((data) => setJob(data))
        .catch((err) => console.error(err));

      fetch(`/backend-api/jobs/${params.id}/chat`)
        .then((res) => res.json())
        .then((history) => {
          if (history && history.length > 0) {
            const parsedMessages = history.map((msg: any, index: number, arr: any[]) => {
              if (msg.role === "agent") {
                try {
                  const data = JSON.parse(msg.content);
                  if (data.card) {
                    return { id: msg.id.toString(), role: "agent", type: "card", card_type: data.card.card_type, content: data.card.content, data: data.card.data };
                  }
                  return { id: msg.id.toString(), role: "agent", type: "text", content: msg.content, is_system_hidden: msg.is_system_trigger };
                } catch (e) {
                  // Heuristic to hide raw markdown that the backend generated for cards
                  const isRawCardText = msg.content.includes("【岗位名称】") || msg.content.includes("【岗位摘要】");
                  return { id: msg.id.toString(), role: "agent", type: "text", content: msg.content, is_system_hidden: msg.is_system_trigger || isRawCardText };
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

      fetchFeedbackEvents(params.id as string);
      fetchAiRuns(params.id as string);
    }
  }, [params]);

  useEffect(() => {
    if (!chatLoaded || !job) return;
    const hasConversationalAgentMessage = messages.some(
      (message) => message.role === "agent" && message.type === "text" && !message.is_system_hidden
    );
    if (hasConversationalAgentMessage) return;
    setMessages((previous) => [{
      id: "case-agent-welcome",
      role: "agent",
      type: "text",
      content: `我们来处理 ${job.company || "这个公司"} · ${job.role || "这个岗位"}。${job.jd_content ? "我已经读取了岗位信息。" : "目前还没有完整 JD。"}\n\n你想先做什么？你可以直接说“这个岗位我一定会投，跳过匹配，直接优化简历”，也可以让我分析岗位、准备面试或生成投递话术。流程不是固定的，我会根据你的目标调用合适的 Agent。`,
    }, ...previous]);
  }, [chatLoaded, job, messages.length]);

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

    if (textToSubmit === "生成打招呼语" || textToSubmit === "生成打招呼") {
      systemWorkflow = "GreetingGeneration";
    }

    if (!isSystemTrigger) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", type: "text", content: textToSubmit }]);
    }
    setIsSending(true);

    const requestController = new AbortController();
    const requestTimeoutMs = systemWorkflow === "InterviewEvaluation" ? 330000 : 150000;
    const requestTimeout = window.setTimeout(() => requestController.abort(), requestTimeoutMs);

    try {
      const response = await fetch(`/backend-api/jobs/${job.id}/chat`, {
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
                  newMessages.push({
                    id: Date.now().toString() + Math.random(),
                    role: "agent", type: data.type, content: data.content, card_type: data.card_type, data: data.data,
                    is_system_hidden: false
                  });
                  if (data.type === "card" && job) {
                    fetchAiRuns(job.id);
                    handleOpenCanvasForCard(data.card_type, data.data);
                  }
                  // mark last run complete
                  for (let i = newMessages.length - 2; i >= 0; i--) {
                    if (newMessages[i].type === "agent_run" && !newMessages[i].is_completed) {
                      newMessages[i].is_completed = true;
                      newMessages[i].main_status = "已完成";
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
        return [...prev, {
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
      ExecutionSummary: "jd",
      JDAnalysis: "jd",
      MatchAnalysis: "match",
      ResumeOptimizer: "resume",
      ContentGeneration: "resume",
      ApplicationStatus: "apply",
      InterviewPrep: data?.round_id === "2" ? "interview_2" : data?.round_id === "hr" ? "interview_hr" : "interview_1",
      InterviewEvaluation: data?.round_id === "2" ? "interview_2" : data?.round_id === "hr" ? "interview_hr" : "interview_1",
    };
    if (cardType && stageByCard[cardType]) {
      setActiveStageId(stageByCard[cardType]);
    }
    setIsCanvasOpen(true);
  };

  const handleRegenerate = (workflowName: string) => {
    handleSendText("", true, workflowName);
  };

  const getLatestAgentRun = () => messages.slice().reverse().find(m => m.type === "agent_run");

  const hasCard = (cardTypes: string[]) => messages.some(m => cardTypes.includes(m.card_type));

  const getNextBestAction = (): (NextBestAction & { workflow?: string; stageId?: string; message?: string; roundId?: string }) | null => {
    if (!job) return null;
    const latestAgentRun = getLatestAgentRun();
    if (latestAgentRun && !latestAgentRun.is_completed) return null;

    const workflowData = job.workflow_data || {};
    const hasJDContent = Boolean(job.jd_content && job.jd_content.trim());
    const hasJDAnalysis = hasCard(["ExecutionSummary", "JDAnalysis"]) || Boolean(workflowData.jd_analysis_result);
    const hasMatch = hasCard(["MatchAnalysis"]) || Boolean(workflowData.job_matching_result) || job.match_score !== null;
    const hasResumeOptimization = hasCard(["ResumeOptimizer"]) || Boolean(workflowData.resume_optimization_result);
    const hasFinalResume = hasCard(["ContentGeneration"]) || Boolean(workflowData.content_generation_result || workflowData.resume_json);
    const hasApplied = Boolean(workflowData.apply_status) || job.status === "已投递";
    const hasInterviewPrep = hasCard(["InterviewPrep"]);
    const hasInterviewEvaluation = hasCard(["InterviewEvaluation"]) || Boolean(workflowData.interview_evaluation_result);
    const hasReflection = Boolean(workflowData.latest_reflection);

    if (!hasJDContent) {
      return {
        key: "missing-jd",
        status: "当前 Job Case 还没有完整 JD 内容。",
        title: "先补充岗位 JD",
        reason: "没有岗位信息时，系统无法可靠地分析岗位要求、计算匹配度或生成定向简历建议。",
        risk: "如果缺少 JD 就直接生成内容，AI 容易给出泛泛建议。",
        primaryLabel: "去补充 JD",
        stageId: "jd"
      };
    }

    if (!hasJDAnalysis) {
      return {
        key: "run-jd-analysis",
        status: "已导入 JD，但还没有结构化岗位分析。",
        title: "建议先分析 JD",
        reason: "JD 分析会提取岗位职责、核心能力和关键词，是岗位匹配与简历优化的基础。",
        risk: "跳过 JD 分析会让后续匹配和简历优化缺少依据。",
        primaryLabel: "开始 JD 分析",
        workflow: "JDAnalysis",
        stageId: "jd"
      };
    }

    if (!hasMatch) {
      return {
        key: "run-job-matching",
        status: "JD 已完成分析，但还没有岗位匹配结果。",
        title: "建议进行岗位匹配",
        reason: "岗位匹配能先判断你的优势、短板和投入优先级，再决定简历应该重点突出什么。",
        risk: "如果直接优化简历，AI 可能无法判断哪些经历最值得强化。",
        primaryLabel: "开始岗位匹配",
        workflow: "JobMatching",
        stageId: "match"
      };
    }

    if (!hasResumeOptimization) {
      return {
        key: "run-resume-optimization",
        status: "已有岗位匹配结果，但还没有定向简历优化建议。",
        title: "建议优化简历",
        reason: "当前已经知道岗位要求和你的能力缺口，可以生成更有针对性的简历修改建议。",
        risk: "简历修改需要基于真实经历，后续仍需要你审核确认。",
        primaryLabel: "优化简历",
        workflow: "ResumeOptimization",
        stageId: "resume"
      };
    }

    if (!hasFinalResume) {
      return {
        key: "review-resume-patches",
        status: "已有简历优化建议，但还没有生成最终简历版本。",
        title: "建议审核简历修改",
        reason: "简历属于职业关键材料，AI 可以提出建议，但最终内容应该由用户确认后再生成。",
        risk: "未经审核直接使用可能出现夸大、不准确或表达不符合个人风格的问题。",
        primaryLabel: "查看修改建议",
        stageId: "resume"
      };
    }

    if (!hasApplied) {
      return {
        key: "prepare-application",
        status: "简历版本已准备好，但当前 Job Case 还没有投递记录。",
        title: "建议推进投递",
        reason: "完成简历准备后，下一步应该生成沟通话术或记录投递状态，避免流程停在材料准备阶段。",
        primaryLabel: "进入投递阶段",
        stageId: "apply"
      };
    }

    if (!hasInterviewPrep && activeStageId.startsWith("interview")) {
      return {
        key: "run-interview-prep",
        status: "当前进入面试阶段，但还没有本轮面试准备包。",
        title: "建议生成面试准备",
        reason: "面试准备应结合 JD、简历亮点和真实面经问题，提前组织答题策略。",
        risk: "如果只临场准备，容易遗漏岗位核心能力和高频追问。",
        primaryLabel: "生成面试准备",
        workflow: "InterviewPrep",
        stageId: activeStageId,
        roundId: activeStageId === "interview_2" ? "2" : activeStageId === "interview_hr" ? "hr" : "1"
      };
    }

    if (hasInterviewEvaluation && !hasReflection) {
      return {
        key: "confirm-reflection",
        status: "已有面试复盘结果，但还没有沉淀为长期记忆。",
        title: "建议沉淀复盘记忆",
        reason: "面试中暴露的问题可以转化为长期准备重点，让后续面试准备更个性化。",
        risk: "记忆写入前应让用户确认，避免系统记住不准确结论。",
        primaryLabel: "查看复盘",
        stageId: activeStageId.startsWith("interview") ? activeStageId : "interview_1"
      };
    }

    return {
      key: "steady-progress",
      status: "当前 Job Case 的核心准备流程已经比较完整。",
      title: "建议检查整体进度",
      reason: "可以从左侧流程查看是否还有未完成的投递、面试或 Offer 跟进事项。",
      primaryLabel: "查看流程",
      stageId: activeStageId
    };
  };

  const nextBestAction = getNextBestAction();
  const visibleNextBestAction = nextBestAction?.key === dismissedRecommendationKey ? null : nextBestAction;

  const handleRunNextBestAction = () => {
    if (!visibleNextBestAction) return;
    if (visibleNextBestAction.stageId) {
      setActiveStageId(visibleNextBestAction.stageId);
    }
    if (visibleNextBestAction.workflow) {
      setIsCanvasOpen(false);
      handleSendText(visibleNextBestAction.message || "", true, visibleNextBestAction.workflow, visibleNextBestAction.roundId);
    } else {
      setIsCanvasOpen(true);
    }
  };

  const handleSubmitFeedback = async (payload: { message_id?: string; card_type?: string; feedback: string; feedback_type?: string; feedback_code?: string; feedback_category?: string; ai_run_id?: number }) => {
    if (!job) return;
    try {
      const res = await fetch(`/backend-api/jobs/${job.id}/feedback`, {
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
            onStatusUpdated={() => {
              // Reload job case to reflect updated status
              if (params.id) {
                fetch(`/backend-api/jobs`)
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
        currentStageLabel={activeStageObj?.label}
        isCanvasOpen={isCanvasOpen}
        onToggleCanvas={() => setIsCanvasOpen((open) => !open)}
      />

      <WorkflowNavigator
        stages={stages}
        activeStageId={activeStageId}
        onStageSelect={handleStageSelect}
      />

      <div className="flex-1 flex gap-3 overflow-hidden p-3">
        <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <AiCopilotSidebar
            messages={messages}
            input={input}
            setInput={setInput}
            isSending={isSending}
            onSend={(text) => handleSendText(text)}
            suggestedActions={suggestedActions}
            nextBestAction={null}
            onRunNextAction={handleRunNextBestAction}
            onDismissNextAction={() => visibleNextBestAction && setDismissedRecommendationKey(visibleNextBestAction.key)}
            feedbackEvents={feedbackEvents}
            onSubmitFeedback={handleSubmitFeedback}
            aiRuns={aiRuns}
            activeStageLabel={activeStageObj?.label}
            isCanvasOpen={isCanvasOpen}
            onOpenCanvas={handleOpenCanvasForCard}
          />
        </section>

        {isCanvasOpen && (
          <section className="fixed inset-3 z-40 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl flex flex-col lg:static lg:w-[40%] lg:min-w-[480px] lg:max-w-[720px] lg:shadow-sm">
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
