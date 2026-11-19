"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { botFlowApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type {
  BotFlow,
  BotFlowCreate,
  BotFlowUpdate,
  BotFlowStep,
  BotFlowStepCreate,
  BotFlowStepUpdate,
  BotFlowIssue,
  BotFlowIssueCreate,
  BotFlowIssueUpdate,
} from "@/lib/types";

const STEP_TYPES = [
  { value: "message", label: "Message" },
  { value: "question", label: "Question (Options)" },
  { value: "action", label: "Action" },
  { value: "condition", label: "Condition" },
  { value: "handoff", label: "Handoff to Human Agent" },
];

const FLOW_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface SimMessage {
  id: string;
  sender: "bot" | "user" | "system";
  text: string;
  options?: Array<{ label: string; value: string; next_step_key?: string }> | string[];
}

export default function BotFlowsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [flows, setFlows] = useState<BotFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'flows' | 'tree' | 'simulator' | 'steps' | 'issues'>('flows');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<BotFlow | null>(null);
  const [steps, setSteps] = useState<BotFlowStep[]>([]);
  const [issues, setIssues] = useState<BotFlowIssue[]>([]);
  const [treeData, setTreeData] = useState<any[]>([]);

  // Flow Modal
  const [showModal, setShowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<BotFlow | null>(null);
  const [formData, setFormData] = useState<BotFlowCreate>({
    name: "",
    description: "",
    initial_greeting: "Hello! How can I help you today? Please choose an option below or type your question.",
    status: "draft",
    is_default: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Step Modal
  const [stepModal, setStepModal] = useState(false);
  const [editingStep, setEditingStep] = useState<BotFlowStep | null>(null);
  const [stepFormData, setStepFormData] = useState<BotFlowStepCreate>({
    step_key: "",
    step_type: "question",
    message_text: "",
    options: null,
    next_step_key: "",
    is_terminal: false,
    sort_order: 0,
  });
  const [rawOptionsJson, setRawOptionsJson] = useState("");
  const [stepSubmitting, setStepSubmitting] = useState(false);
  const [stepFormError, setStepFormError] = useState<string | null>(null);

  // Issue Modal
  const [issueModal, setIssueModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState<BotFlowIssue | null>(null);
  const [issueFormData, setIssueFormData] = useState<BotFlowIssueCreate>({
    title: "",
    description: "",
    start_step_key: "",
    sort_order: 0,
    is_active: true,
  });
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueFormError, setIssueFormError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Simulator State
  const [simMessages, setSimMessages] = useState<SimMessage[]>([]);
  const [simInput, setSimInput] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && user.role !== "admin" && user.role !== "super_admin") {
      router.push("/agent");
    }
  }, [user, authLoading, router]);

  const loadFlows = async () => {
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return;

    setIsLoading(true);
    setError(null);
    try {
      const params: { status?: string } = {};
      if (filterStatus !== "all") params.status = filterStatus;

      const data = await botFlowApi.list(params);
      setFlows(data);
      if (selectedFlow) {
        const updated = data.find((f) => f.id === selectedFlow.id);
        if (updated) setSelectedFlow(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bot flows");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlows();
  }, [filterStatus, user]);

  const loadFlowDetails = async (flow: BotFlow, targetTab: 'tree' | 'simulator' | 'steps' | 'issues' = 'tree') => {
    setSelectedFlow(flow);
    try {
      const [stepsData, issuesData, treeRes] = await Promise.all([
        botFlowApi.listSteps(flow.id),
        botFlowApi.listIssues(flow.id),
        botFlowApi.getTree(flow.id).catch(() => null),
      ]);
      setSteps(stepsData);
      setIssues(issuesData);
      if (treeRes && treeRes.tree) {
        setTreeData(treeRes.tree);
      } else {
        setTreeData([]);
      }
      setActiveTab(targetTab);
      resetSimulator(flow, stepsData, issuesData);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load flow details");
    }
  };

  const resetSimulator = (flow?: BotFlow, currentSteps?: BotFlowStep[], currentIssues?: BotFlowIssue[]) => {
    const f = flow || selectedFlow;
    const s = currentSteps || steps;
    const iss = currentIssues || issues;
    if (!f) return;

    const initialOpts = iss.filter((i) => i.is_active).map((i) => ({
      label: i.title,
      value: i.start_step_key || i.title,
      next_step_key: i.start_step_key || undefined,
    }));

    setSimMessages([
      {
        id: "msg-1",
        sender: "bot",
        text: f.initial_greeting || "Hello! How can I help you today?",
        options: initialOpts,
      },
    ]);
    setSimInput("");
  };

  const handleSimSelectOption = (opt: { label: string; value: string; next_step_key?: string } | string) => {
    const label = typeof opt === "string" ? opt : opt.label;
    const nextKey = typeof opt === "string" ? opt : (opt.next_step_key || opt.value);

    // Append user message
    const newMsgList: SimMessage[] = [
      ...simMessages,
      { id: `user-${Date.now()}`, sender: "user", text: label },
    ];

    // Find next step in steps
    const step = steps.find((s) => s.step_key === nextKey);
    if (step) {
      let parsedOptions: any = null;
      if (step.options) {
        if (typeof step.options === "string") {
          try {
            parsedOptions = JSON.parse(step.options);
          } catch {
            parsedOptions = [step.options];
          }
        } else {
          parsedOptions = step.options;
        }
      }

      newMsgList.push({
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: step.message_text || "Please select an option:",
        options: parsedOptions,
      });

      if (step.step_type === "handoff" || step.is_terminal) {
        newMsgList.push({
          id: `sys-${Date.now()}`,
          sender: "system",
          text: step.step_type === "handoff"
            ? "Flow escalated: Connected to human agent queue."
            : "Flow completed.",
        });
      }
    } else {
      newMsgList.push({
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `You selected: "${label}". Our AI assistant or support team is processing your request.`,
      });
    }

    setSimMessages(newMsgList);
  };

  const handleSimSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simInput.trim()) return;

    const userText = simInput.trim();
    setSimInput("");

    // Append user message
    const newMsgList: SimMessage[] = [
      ...simMessages,
      { id: `user-${Date.now()}`, sender: "user", text: userText },
    ];

    // Try finding matching issue or step
    const lower = userText.toLowerCase();
    const matchedIssue = issues.find((i) => i.title.toLowerCase().includes(lower));
    if (matchedIssue && matchedIssue.start_step_key) {
      const step = steps.find((s) => s.step_key === matchedIssue.start_step_key);
      if (step) {
        let parsedOptions: any = null;
        if (step.options) {
          try {
            parsedOptions = typeof step.options === "string" ? JSON.parse(step.options) : step.options;
          } catch {
            parsedOptions = [step.options];
          }
        }
        newMsgList.push({
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: step.message_text || "Here are some options to help you:",
          options: parsedOptions,
        });
        setSimMessages(newMsgList);
        return;
      }
    }

    // Default simulated Gemini AI response
    newMsgList.push({
      id: `bot-${Date.now()}`,
      sender: "bot",
      text: `Thank you for your message: "${userText}". In live production, Gemini AI answers this question dynamically using your verified knowledge base, or seamlessly connects you to our support team if needed.`,
    });
    setSimMessages(newMsgList);
  };

  const handleOpenCreate = () => {
    setEditingFlow(null);
    setFormData({
      name: "",
      description: "",
      initial_greeting: "Hello! How can I help you today? Please choose an option below or type your question.",
      status: "draft",
      is_default: false,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (flow: BotFlow) => {
    setEditingFlow(flow);
    setFormData({
      name: flow.name,
      description: flow.description || "",
      initial_greeting: flow.initial_greeting || "",
      status: flow.status,
      is_default: flow.is_default,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingFlow(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingFlow) {
        const updateData: BotFlowUpdate = {
          name: formData.name,
          description: formData.description || undefined,
          initial_greeting: formData.initial_greeting,
          status: formData.status as any,
          is_default: formData.is_default,
        };
        const updated = await botFlowApi.update(editingFlow.id, updateData);
        setSelectedFlow(updated);
        setSuccessMessage(`Updated flow "${updated.name}"`);
      } else {
        const created = await botFlowApi.create(formData);
        setSelectedFlow(created);
        setSuccessMessage(`Created flow "${created.name}"`);
      }
      setShowModal(false);
      setEditingFlow(null);
      loadFlows();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save flow");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (flow: BotFlow) => {
    if (!window.confirm(`Are you sure you want to delete "${flow.name}"? This cannot be undone.`)) return;

    try {
      await botFlowApi.delete(flow.id);
      if (selectedFlow?.id === flow.id) {
        setSelectedFlow(null);
        setActiveTab("flows");
      }
      setSuccessMessage(`Deleted flow "${flow.name}"`);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete flow");
    }
  };

  const handleDuplicate = async (flow: BotFlow) => {
    try {
      const duplicated = await botFlowApi.duplicate(flow.id);
      setSuccessMessage(`Duplicated "${flow.name}" as "${duplicated.name}"`);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to duplicate flow");
    }
  };

  const handlePublish = async (flow: BotFlow) => {
    if (!window.confirm(`Publish "${flow.name}"? This will make it active and set as the default customer bot flow.`)) return;

    try {
      const published = await botFlowApi.publish(flow.id, { version_comment: "Published via Admin Console" });
      setSelectedFlow(published);
      setSuccessMessage(`Successfully published "${flow.name}" (v${published.version})! Changes are live immediately.`);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to publish");
    }
  };

  const handleArchive = async (flow: BotFlow) => {
    if (!window.confirm(`Archive "${flow.name}"? This will deactivate it from active use.`)) return;

    try {
      await botFlowApi.archive(flow.id);
      setSuccessMessage(`Archived "${flow.name}"`);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive");
    }
  };

  // Step handlers
  const handleOpenStepCreate = (prefillKey?: string) => {
    if (!selectedFlow) return;
    setEditingStep(null);
    setStepFormData({
      step_key: prefillKey || "",
      step_type: "question",
      message_text: "",
      options: null,
      next_step_key: "",
      is_terminal: false,
      sort_order: steps.length,
    });
    setRawOptionsJson("");
    setStepFormError(null);
    setStepModal(true);
  };

  const handleOpenStepEdit = (step: BotFlowStep) => {
    setEditingStep(step);
    setStepFormData({
      step_key: step.step_key,
      step_type: step.step_type,
      message_text: step.message_text || "",
      options: step.options,
      next_step_key: step.next_step_key || "",
      is_terminal: step.is_terminal,
      sort_order: step.sort_order,
    });
    if (step.options) {
      setRawOptionsJson(
        typeof step.options === "string"
          ? step.options
          : JSON.stringify(step.options, null, 2)
      );
    } else {
      setRawOptionsJson("");
    }
    setStepFormError(null);
    setStepModal(true);
  };

  const handleCloseStepModal = () => {
    setStepModal(false);
    setEditingStep(null);
    setStepFormError(null);
  };

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFlow) return;
    setStepSubmitting(true);
    setStepFormError(null);

    let parsedOptions = null;
    if (rawOptionsJson.trim()) {
      try {
        parsedOptions = JSON.parse(rawOptionsJson);
      } catch {
        setStepFormError("Options must be valid JSON (e.g. [\"Option 1\", \"Option 2\"] or [{\"label\": \"Title\", \"value\": \"code\"}])");
        setStepSubmitting(false);
        return;
      }
    }

    try {
      if (editingStep) {
        const updateData: BotFlowStepUpdate = {
          step_type: stepFormData.step_type,
          message_text: stepFormData.message_text || undefined,
          options: parsedOptions,
          next_step_key: stepFormData.next_step_key || undefined,
          is_terminal: stepFormData.is_terminal,
          sort_order: stepFormData.sort_order,
        };
        await botFlowApi.updateStep(editingStep.id, updateData);
      } else {
        await botFlowApi.createStep(selectedFlow.id, {
          ...stepFormData,
          options: parsedOptions,
        });
      }
      setStepModal(false);
      setEditingStep(null);
      // Reload steps and tree
      const [stepsData, treeRes] = await Promise.all([
        botFlowApi.listSteps(selectedFlow.id),
        botFlowApi.getTree(selectedFlow.id).catch(() => null),
      ]);
      setSteps(stepsData);
      if (treeRes && treeRes.tree) setTreeData(treeRes.tree);
      setSuccessMessage("Step saved successfully");
    } catch (err) {
      setStepFormError(err instanceof Error ? err.message : "Failed to save step");
    } finally {
      setStepSubmitting(false);
    }
  };

  const handleStepDelete = async (step: BotFlowStep) => {
    if (!window.confirm(`Delete step "${step.step_key}"?`)) return;

    try {
      await botFlowApi.deleteStep(step.id);
      if (selectedFlow) {
        const [stepsData, treeRes] = await Promise.all([
          botFlowApi.listSteps(selectedFlow.id),
          botFlowApi.getTree(selectedFlow.id).catch(() => null),
        ]);
        setSteps(stepsData);
        if (treeRes && treeRes.tree) setTreeData(treeRes.tree);
      }
      setSuccessMessage(`Deleted step ${step.step_key}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete step");
    }
  };

  // Issue handlers
  const handleOpenIssueCreate = () => {
    if (!selectedFlow) return;
    setEditingIssue(null);
    setIssueFormData({
      title: "",
      description: "",
      start_step_key: "",
      sort_order: issues.length,
      is_active: true,
    });
    setIssueFormError(null);
    setIssueModal(true);
  };

  const handleOpenIssueEdit = (issue: BotFlowIssue) => {
    setEditingIssue(issue);
    setIssueFormData({
      title: issue.title,
      description: issue.description || "",
      start_step_key: issue.start_step_key,
      sort_order: issue.sort_order,
      is_active: issue.is_active,
    });
    setIssueFormError(null);
    setIssueModal(true);
  };

  const handleCloseIssueModal = () => {
    setIssueModal(false);
    setEditingIssue(null);
    setIssueFormError(null);
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFlow) return;
    setIssueSubmitting(true);
    setIssueFormError(null);

    try {
      if (editingIssue) {
        const updateData: BotFlowIssueUpdate = {
          title: issueFormData.title,
          description: issueFormData.description || undefined,
          start_step_key: issueFormData.start_step_key,
          sort_order: issueFormData.sort_order,
          is_active: issueFormData.is_active,
        };
        await botFlowApi.updateIssue(editingIssue.id, updateData);
      } else {
        await botFlowApi.createIssue(selectedFlow.id, issueFormData);
      }
      setIssueModal(false);
      setEditingIssue(null);
      const [issuesData, treeRes] = await Promise.all([
        botFlowApi.listIssues(selectedFlow.id),
        botFlowApi.getTree(selectedFlow.id).catch(() => null),
      ]);
      setIssues(issuesData);
      if (treeRes && treeRes.tree) setTreeData(treeRes.tree);
      setSuccessMessage("Issue saved successfully");
    } catch (err) {
      setIssueFormError(err instanceof Error ? err.message : "Failed to save issue");
    } finally {
      setIssueSubmitting(false);
    }
  };

  const handleIssueDelete = async (issue: BotFlowIssue) => {
    if (!window.confirm(`Delete issue "${issue.title}"?`)) return;

    try {
      await botFlowApi.deleteIssue(issue.id);
      if (selectedFlow) {
        const [issuesData, treeRes] = await Promise.all([
          botFlowApi.listIssues(selectedFlow.id),
          botFlowApi.getTree(selectedFlow.id).catch(() => null),
        ]);
        setIssues(issuesData);
        if (treeRes && treeRes.tree) setTreeData(treeRes.tree);
      }
      setSuccessMessage(`Deleted issue ${issue.title}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete issue");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">Multi-Level Bot Flows</h1>
            {selectedFlow && (
              <Badge variant={selectedFlow.status === "published" ? "success" : "warning"}>
                {selectedFlow.name} (v{selectedFlow.version})
              </Badge>
            )}
          </div>
          <p className="text-gray-500 mt-1">
            Build, test, and manage guided customer support flows with dynamic branching and Gemini fallback
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedFlow && (
            <>
              {selectedFlow.status === "draft" && (
                <Button variant="primary" size="sm" onClick={() => handlePublish(selectedFlow)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  Publish Flow
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => handleDuplicate(selectedFlow)}>
                Duplicate
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleOpenEdit(selectedFlow)}>
                Settings
              </Button>
            </>
          )}
          <Button onClick={handleOpenCreate} className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Flow
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-4">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6 -mb-px" aria-label="Bot Flows tabs">
          <button
            onClick={() => setActiveTab('flows')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'flows' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>All Flows</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
              {flows.length}
            </span>
          </button>

          {selectedFlow && (
            <>
              <button
                onClick={() => setActiveTab('tree')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'tree' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
                <span>Visual Flow Tree (4-Levels)</span>
              </button>

              <button
                onClick={() => setActiveTab('simulator')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'simulator' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>Live Simulator Preview</span>
              </button>

              <button
                onClick={() => setActiveTab('steps')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'steps' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>Step Nodes ({steps.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('issues')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'issues' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>Level-1 Categories ({issues.length})</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* TAB 1: FLOWS LIST */}
      {activeTab === 'flows' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Statuses</option>
                {FLOW_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">
              Click any flow to open the 4-Level Visual Tree & Simulator
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {flows
              .filter((f) => filterStatus === 'all' || f.status === filterStatus)
              .map((flow) => {
                const isSelected = selectedFlow?.id === flow.id;
                return (
                  <Card
                    key={flow.id}
                    className={`overflow-hidden transition-all duration-200 border cursor-pointer hover:shadow-md ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20' : 'border-gray-200'
                    }`}
                    onClick={() => loadFlowDetails(flow, 'tree')}
                  >
                    <CardHeader className="p-4 pb-2 flex flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                          {flow.name}
                          {flow.is_default && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              Active Live
                            </span>
                          )}
                        </CardTitle>
                        <p className="text-xs text-gray-500 mt-0.5">Version {flow.version}</p>
                      </div>
                      <Badge
                        variant={
                          flow.status === "published" ? "success" :
                          flow.status === "archived" ? "default" : "warning"
                        }
                      >
                        {flow.status.toUpperCase()}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-3">
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {flow.description || "Multi-level guided customer support flow."}
                      </p>
                      <div className="bg-gray-50 p-2.5 rounded text-xs text-gray-500 italic line-clamp-2 border border-gray-100">
                        "{flow.initial_greeting || "Hello! How can I help you today?"}"
                      </div>
                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            className="text-xs h-7 px-2.5 bg-blue-600 hover:bg-blue-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadFlowDetails(flow, 'tree');
                            }}
                          >
                            Open Tree
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadFlowDetails(flow, 'simulator');
                            }}
                          >
                            Simulator
                          </Button>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            title="Duplicate"
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(flow);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                          </button>
                          <button
                            title="Edit Settings"
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(flow);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            title="Delete Flow"
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(flow);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 2: VISUAL FLOW TREE BUILDER (4 LEVELS) */}
      {activeTab === 'tree' && selectedFlow && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span>Visual Flow Tree:</span>
                <span className="text-blue-600">{selectedFlow.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">v{selectedFlow.version}</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                4-Level guided conversation path. Click any node to modify its message, options, or target step.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleOpenIssueCreate} className="text-xs">
                + Add Level-1 Issue
              </Button>
              <Button size="sm" variant="primary" onClick={() => handleOpenStepCreate()} className="text-xs">
                + Add Step Node
              </Button>
            </div>
          </div>

          {/* Level 0: Welcome Greeting Card */}
          <div className="relative pl-6 border-l-2 border-blue-400 space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 max-w-2xl shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Level 1 — Welcome & Initial Greeting
                </span>
                <button
                  onClick={() => handleOpenEdit(selectedFlow)}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Edit Greeting
                </button>
              </div>
              <p className="text-sm text-gray-800 font-medium bg-white p-3 rounded-lg border border-blue-100 shadow-2xs">
                "{selectedFlow.initial_greeting}"
              </p>
            </div>

            {/* Level 1: Issues / Categories */}
            <div className="space-y-4">
              <div className="flex items-center justify-between max-w-3xl">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                  <span>Level 2 — Category Options ({issues.length})</span>
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {issues.map((issue) => {
                  const rootStep = steps.find((s) => s.step_key === issue.start_step_key);
                  return (
                    <div
                      key={issue.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-400 transition-colors space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{issue.title}</div>
                          {issue.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{issue.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenIssueEdit(issue)}
                            className="p-1 text-gray-400 hover:text-blue-600 rounded"
                            title="Edit Category"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Connection to Root Step */}
                      <div className="pt-2 border-t border-gray-100">
                        {rootStep ? (
                          <div
                            onClick={() => handleOpenStepEdit(rootStep)}
                            className="p-2.5 bg-gray-50 hover:bg-blue-50/50 rounded-lg border border-gray-200 cursor-pointer transition-all space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-medium text-blue-700">↳ {rootStep.step_key}</span>
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                {rootStep.step_type}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-700 line-clamp-2">
                              {rootStep.message_text || "No message prompt"}
                            </p>

                            {/* Level 3: Child Options inside Root Step */}
                            {rootStep.options && (
                              <div className="pt-2 border-t border-gray-200/60 space-y-1">
                                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                                  Level 3 Sub-Options:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {Array.isArray(rootStep.options) ? (
                                    rootStep.options.map((opt: any, idx: number) => {
                                      const label = typeof opt === "string" ? opt : opt.label;
                                      const next = typeof opt === "string" ? null : opt.next_step_key;
                                      return (
                                        <span
                                          key={idx}
                                          className="text-[11px] bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-700 flex items-center gap-1 shadow-2xs"
                                        >
                                          <span>{label}</span>
                                          {next && <span className="text-blue-500 font-mono text-[9px]">→ {next}</span>}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="text-xs text-gray-400">Custom options config</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-2 bg-amber-50 rounded text-xs text-amber-700 border border-amber-200 flex items-center justify-between">
                            <span>Step "{issue.start_step_key}" not defined</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-6 px-1.5 text-amber-800 underline"
                              onClick={() => handleOpenStepCreate(issue.start_step_key || "")}
                            >
                              Create Step
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Level 4: Execution / Leaf Nodes (Actions, Handoff, Confirmation) */}
            <div className="pt-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                <span>Level 4 — Leaf Steps, Prompts & Human Handoff</span>
              </h3>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                {steps
                  .filter((s) => s.step_type === "handoff" || s.is_terminal || s.step_type === "action" || s.step_key.includes("confirm") || s.step_key.includes("id"))
                  .map((step) => (
                    <div
                      key={step.id}
                      onClick={() => handleOpenStepEdit(step)}
                      className="p-3 bg-white border border-gray-200 rounded-lg shadow-2xs hover:border-blue-400 cursor-pointer space-y-1 transition-all"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-medium text-gray-900">{step.step_key}</span>
                        <Badge variant={step.step_type === "handoff" ? "warning" : "default"} className="text-[10px]">
                          {step.step_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {step.message_text || "—"}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE SIMULATOR PREVIEW */}
      {activeTab === 'simulator' && selectedFlow && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left panel: Simulator Instructions & Controls */}
          <div className="lg:col-span-5 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Live Bot Flow Simulator</CardTitle>
                <p className="text-xs text-gray-500">
                  Test your bot flow exactly as your customers experience it in the live widget.
                </p>
              </CardHeader>
              <CardContent className="space-y-4 text-xs text-gray-600">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="font-semibold text-blue-900">How to test:</div>
                  <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li>Click any option button to test multi-level branching.</li>
                    <li>Type custom free text below to test Gemini AI fallback.</li>
                    <li>Watch flow transitions and escalation triggers in real time.</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-700">Active Flow:</span>
                    <span className="font-mono text-gray-900">{selectedFlow.name} (v{selectedFlow.version})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-700">Total Steps:</span>
                    <span>{steps.length} steps configured</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-700">Level 1 Categories:</span>
                    <span>{issues.length} active categories</span>
                  </div>
                </div>
                <div className="pt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetSimulator()}
                    className="w-full text-xs"
                  >
                    Reset Simulation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right panel: Chat Widget Mockup */}
          <div className="lg:col-span-7 flex justify-center">
            <div className="w-full max-w-md bg-white border border-gray-300 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[600px]">
              {/* Widget Header */}
              <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                    OC
                  </div>
                  <div>
                    <div className="font-semibold text-sm">OpenChat Support</div>
                    <div className="text-[11px] text-blue-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Automated Support Bot
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => resetSimulator()}
                  title="Restart conversation"
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Message List */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/50">
                {simMessages.map((msg) => {
                  if (msg.sender === "system") {
                    return (
                      <div key={msg.id} className="text-center my-2">
                        <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[11px] rounded-full font-medium">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }

                  const isBot = msg.sender === "bot";
                  return (
                    <div key={msg.id} className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                          isBot
                            ? 'bg-white text-gray-800 border border-gray-200 shadow-2xs rounded-bl-xs'
                            : 'bg-blue-600 text-white rounded-br-xs'
                        }`}
                      >
                        {msg.text}
                      </div>

                      {/* Render Selectable Options directly beneath bot message */}
                      {isBot && msg.options && Array.isArray(msg.options) && msg.options.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[90%]">
                          {msg.options.map((opt: any, optIdx: number) => {
                            const label = typeof opt === "string" ? opt : opt.label;
                            return (
                              <button
                                key={optIdx}
                                onClick={() => handleSimSelectOption(opt)}
                                className="text-xs bg-white text-blue-700 hover:bg-blue-50 border border-blue-200 hover:border-blue-400 font-medium px-3 py-1.5 rounded-full shadow-2xs transition-colors text-left"
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Widget Input Area */}
              <form onSubmit={handleSimSendText} className="p-3 bg-white border-t border-gray-200 flex gap-2">
                <input
                  type="text"
                  value={simInput}
                  onChange={(e) => setSimInput(e.target.value)}
                  placeholder="Type a message or order number..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button type="submit" size="sm" className="text-xs px-3 bg-blue-600 hover:bg-blue-700">
                  Send
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STEP NODES TABLE */}
      {activeTab === 'steps' && selectedFlow && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Steps for "{selectedFlow.name}"</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Configure step keys, response messages, options arrays, and next steps</p>
            </div>
            <Button onClick={() => handleOpenStepCreate()} className="flex items-center gap-2 text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Step Node
            </Button>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-base font-medium text-gray-900">No steps defined yet</h3>
                <p className="text-xs text-gray-500 mt-1">Add your first step node to start building this flow</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider text-[11px] border-b">
                    <tr>
                      <th className="py-2.5 px-3">Step Key</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Message</th>
                      <th className="py-2.5 px-3">Options</th>
                      <th className="py-2.5 px-3">Next Step</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {steps.map((step) => (
                      <tr key={step.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-3 font-mono font-medium text-gray-900">{step.step_key}</td>
                        <td className="py-3 px-3">
                          <Badge variant={step.step_type === "handoff" ? "warning" : "default"}>
                            {step.step_type}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 max-w-xs truncate text-gray-700">
                          {step.message_text || "—"}
                        </td>
                        <td className="py-3 px-3 max-w-xs font-mono text-[11px] text-gray-500 truncate">
                          {step.options ? (typeof step.options === "string" ? step.options : JSON.stringify(step.options)) : "—"}
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-600">
                          {step.next_step_key ? `→ ${step.next_step_key}` : (step.is_terminal ? "Terminal" : "—")}
                        </td>
                        <td className="py-3 px-3 text-right space-x-2">
                          <button
                            onClick={() => handleOpenStepEdit(step)}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleStepDelete(step)}
                            className="text-red-500 hover:underline font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 5: LEVEL-1 ISSUES TABLE */}
      {activeTab === 'issues' && selectedFlow && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Level-1 Category Issues for "{selectedFlow.name}"</CardTitle>
              <p className="text-xs text-gray-500 mt-1">These categories appear as the initial top-level choices for customers</p>
            </div>
            <Button onClick={handleOpenIssueCreate} className="flex items-center gap-2 text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Category Issue
            </Button>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-base font-medium text-gray-900">No issues configured</h3>
                <p className="text-xs text-gray-500 mt-1">Add categories like Orders, Billing, Returns, or Technical Support</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase tracking-wider text-[11px] border-b">
                    <tr>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Start Step Key</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {issues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-3 font-semibold text-gray-900">{issue.title}</td>
                        <td className="py-3 px-3 text-gray-600">{issue.description || "—"}</td>
                        <td className="py-3 px-3 font-mono text-blue-600">↳ {issue.start_step_key}</td>
                        <td className="py-3 px-3">
                          <Badge variant={issue.is_active ? "success" : "default"}>
                            {issue.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right space-x-2">
                          <button
                            onClick={() => handleOpenIssueEdit(issue)}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleIssueDelete(issue)}
                            className="text-red-500 hover:underline font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL: Flow Create / Edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingFlow ? "Edit Bot Flow Settings" : "Create New Bot Flow"}
              </h2>
              <button onClick={handleCloseModal} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Flow Name *</label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g. Master Production Bot Flow"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. 4-level customer support navigation flow"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Initial Greeting Message</label>
                <textarea
                  value={formData.initial_greeting}
                  onChange={(e) => setFormData((prev) => ({ ...prev, initial_greeting: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Hello! How can I help you today?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {FLOW_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={formData.is_default}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_default: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_default" className="ml-2 text-xs text-gray-700 font-medium">
                    Set as active default flow
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm">
                  {submitting ? "Saving..." : editingFlow ? "Save Changes" : "Create Flow"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Step Node Create / Edit */}
      {stepModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingStep ? `Edit Step: ${editingStep.step_key}` : "Add Step Node"}
              </h2>
              <button onClick={handleCloseStepModal} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleStepSubmit} className="p-6 space-y-4">
              {stepFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {stepFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Step Key *</label>
                <Input
                  type="text"
                  value={stepFormData.step_key}
                  onChange={(e) => setStepFormData((prev) => ({ ...prev, step_key: e.target.value }))}
                  required
                  placeholder="e.g. order_help, track_order"
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Step Type *</label>
                <select
                  value={stepFormData.step_type}
                  onChange={(e) => setStepFormData((prev) => ({ ...prev, step_type: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Message Prompt</label>
                <textarea
                  value={stepFormData.message_text}
                  onChange={(e) => setStepFormData((prev) => ({ ...prev, message_text: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="How can we assist you with your order?"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">Options (JSON Array)</label>
                  <button
                    type="button"
                    className="text-[11px] text-blue-600 hover:underline"
                    onClick={() => {
                      setRawOptionsJson(JSON.stringify([
                        { label: "Option 1", value: "opt_1", next_step_key: "step_1" },
                        { label: "Option 2", value: "opt_2", next_step_key: "step_2" }
                      ], null, 2));
                    }}
                  >
                    Insert Template
                  </button>
                </div>
                <textarea
                  value={rawOptionsJson}
                  onChange={(e) => setRawOptionsJson(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  placeholder='[{"label": "Track Order", "value": "track_order", "next_step_key": "track_order"}]'
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Array of strings or objects with label, value, next_step_key.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Next Step Key</label>
                  <Input
                    type="text"
                    value={stepFormData.next_step_key || ""}
                    onChange={(e) => setStepFormData((prev) => ({ ...prev, next_step_key: e.target.value }))}
                    placeholder="e.g. track_order"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <input
                    type="checkbox"
                    id="step_terminal"
                    checked={stepFormData.is_terminal}
                    onChange={(e) => setStepFormData((prev) => ({ ...prev, is_terminal: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="step_terminal" className="ml-2 text-xs text-gray-700 font-medium">
                    Terminal (Ends Flow)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseStepModal} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={stepSubmitting} size="sm">
                  {stepSubmitting ? "Saving..." : editingStep ? "Update Step" : "Create Step"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Level-1 Category Issue Create / Edit */}
      {issueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingIssue ? `Edit Category: ${editingIssue.title}` : "Add Level-1 Category Issue"}
              </h2>
              <button onClick={handleCloseIssueModal} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleIssueSubmit} className="p-6 space-y-4">
              {issueFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {issueFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category Title *</label>
                <Input
                  type="text"
                  value={issueFormData.title}
                  onChange={(e) => setIssueFormData((prev) => ({ ...prev, title: e.target.value }))}
                  required
                  placeholder="e.g. Order or Booking Help"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  value={issueFormData.description}
                  onChange={(e) => setIssueFormData((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief help text for customers"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Start Step Key *</label>
                <Input
                  type="text"
                  value={issueFormData.start_step_key || ""}
                  onChange={(e) => setIssueFormData((prev) => ({ ...prev, start_step_key: e.target.value }))}
                  required
                  placeholder="e.g. order_help"
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Sort Order</label>
                  <Input
                    type="number"
                    value={issueFormData.sort_order}
                    onChange={(e) => setIssueFormData((prev) => ({ ...prev, sort_order: parseInt(e.target.value, 10) || 0 }))}
                  />
                </div>

                <div className="flex items-center pt-5">
                  <input
                    type="checkbox"
                    id="issue_active"
                    checked={issueFormData.is_active}
                    onChange={(e) => setIssueFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="issue_active" className="ml-2 text-xs text-gray-700 font-medium">
                    Active (visible to customers)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseIssueModal} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={issueSubmitting} size="sm">
                  {issueSubmitting ? "Saving..." : editingIssue ? "Update Category" : "Create Category"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
