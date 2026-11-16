"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { botFlowApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { BotFlow, BotFlowCreate, BotFlowUpdate, BotFlowStep, BotFlowStepCreate, BotFlowStepUpdate, BotFlowIssue, BotFlowIssueCreate, BotFlowIssueUpdate, BotFlowPublish } from "@/lib/types";

const STEP_TYPES = [
  { value: "message", label: "Message" },
  { value: "question", label: "Question" },
  { value: "action", label: "Action" },
  { value: "condition", label: "Condition" },
  { value: "handoff", label: "Handoff to Agent" },
];

const FLOW_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export default function BotFlowsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [flows, setFlows] = useState<BotFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'flows' | 'steps' | 'issues'>('flows');
  const [error, setError] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<BotFlow | null>(null);
  const [steps, setSteps] = useState<BotFlowStep[]>([]);
  const [issues, setIssues] = useState<BotFlowIssue[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<BotFlow | null>(null);
  const [formData, setFormData] = useState<BotFlowCreate>({
    name: "",
    description: "",
    initial_greeting: "Hello! How can I help you today?",
    status: "draft",
    is_default: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [stepModal, setStepModal] = useState(false);
  const [editingStep, setEditingStep] = useState<BotFlowStep | null>(null);
  const [stepFormData, setStepFormData] = useState<BotFlowStepCreate>({
    step_key: "",
    step_type: "message",
    message_text: "",
    options: null,
    next_step_key: "",
    is_terminal: false,
    sort_order: 0,
  } as BotFlowStepCreate);
  const [stepSubmitting, setStepSubmitting] = useState(false);
  const [stepFormError, setStepFormError] = useState<string | null>(null);

  const [issueModal, setIssueModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState<BotFlowIssue | null>(null);
  const [issueFormData, setIssueFormData] = useState<BotFlowIssueCreate>({
    title: "",
    description: "",
    start_step_key: "",
    sort_order: 0,
    is_active: true,
  } as BotFlowIssueCreate);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueFormError, setIssueFormError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && user.role !== "admin") {
      router.push("/agent");
    }
  }, [user, authLoading, router]);

  const loadFlows = async () => {
    if (!user || user.role !== "admin") return;

    setIsLoading(true);
    setError(null);
    try {
      const params: { status?: string } = {};
      if (filterStatus !== "all") params.status = filterStatus;

      const data = await botFlowApi.list(params);
      setFlows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bot flows");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFlows();
  }, [filterStatus, user]);

  const loadFlowDetails = async (flow: BotFlow) => {
    setSelectedFlow(flow);
    try {
      const [stepsData, issuesData] = await Promise.all([
        botFlowApi.listSteps(flow.id),
        botFlowApi.listIssues(flow.id),
      ]);
      setSteps(stepsData);
      setIssues(issuesData);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load flow details");
    }
  };

  const handleOpenCreate = () => {
    setEditingFlow(null);
    setFormData({
      name: "",
      description: "",
      initial_greeting: "Hello! How can I help you today?",
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
        await botFlowApi.update(editingFlow.id, updateData);
      } else {
        await botFlowApi.create(formData);
      }
      setShowModal(false);
      setEditingFlow(null);
      loadFlows();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (flow: BotFlow) => {
    if (!window.confirm(`Delete "${flow.name}"? This cannot be undone.`)) return;

    try {
      await botFlowApi.delete(flow.id);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handlePublish = async (flow: BotFlow) => {
    if (!window.confirm(`Publish "${flow.name}"? This will make it available for use.`)) return;

    try {
      await botFlowApi.publish(flow.id);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to publish");
    }
  };

  const handleArchive = async (flow: BotFlow) => {
    if (!window.confirm(`Archive "${flow.name}"? This will remove it from active use.`)) return;

    try {
      await botFlowApi.archive(flow.id);
      loadFlows();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive");
    }
  };

  // Step handlers
  const handleOpenStepCreate = () => {
    if (!selectedFlow) return;
    setEditingStep(null);
    setStepFormData({
      step_key: "",
      step_type: "message",
      message_text: "",
      options: null,
      next_step_key: "",
      is_terminal: false,
      sort_order: steps.length,
    });
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
    setStepSubmitting(true);
    setStepFormError(null);

    try {
      if (editingStep) {
        const updateData: BotFlowStepUpdate = {
          step_type: stepFormData.step_type,
          message_text: stepFormData.message_text || undefined,
          options: stepFormData.options || undefined,
          next_step_key: stepFormData.next_step_key || undefined,
          is_terminal: stepFormData.is_terminal,
          sort_order: stepFormData.sort_order,
        };
        await botFlowApi.updateStep(editingStep.id, updateData);
      } else {
        await botFlowApi.createStep(selectedFlow!.id, stepFormData);
      }
      setStepModal(false);
      setEditingStep(null);
      if (selectedFlow) {
        const data = await botFlowApi.listSteps(selectedFlow.id);
        setSteps(data);
      }
    } catch (err) {
      setStepFormError(err instanceof Error ? err.message : "Failed to save step");
    } finally {
      setStepSubmitting(false);
    }
  };

  const handleStepDelete = async (step: BotFlowStep) => {
    if (!window.confirm(`Delete step "${step.step_key}"? This cannot be undone.`)) return;

    try {
      await botFlowApi.deleteStep(step.id);
      if (selectedFlow) {
        const data = await botFlowApi.listSteps(selectedFlow.id);
        setSteps(data);
      }
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
        await botFlowApi.createIssue(selectedFlow!.id, issueFormData);
      }
      setIssueModal(false);
      setEditingIssue(null);
      if (selectedFlow) {
        const data = await botFlowApi.listIssues(selectedFlow.id);
        setIssues(data);
      }
    } catch (err) {
      setIssueFormError(err instanceof Error ? err.message : "Failed to save issue");
    } finally {
      setIssueSubmitting(false);
    }
  };

  const handleIssueDelete = async (issue: BotFlowIssue) => {
    if (!window.confirm(`Delete issue "${issue.title}"? This cannot be undone.`)) return;

    try {
      await botFlowApi.deleteIssue(issue.id);
      if (selectedFlow) {
        const data = await botFlowApi.listIssues(selectedFlow.id);
        setIssues(data);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete issue");
    }
  };

  const handleInputChange = (field: keyof BotFlowCreate, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleStepInputChange = (field: keyof BotFlowStepCreate, value: string | number | boolean | null) => {
    setStepFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleIssueInputChange = (field: keyof BotFlowIssueCreate, value: string | number | boolean) => {
    setIssueFormData((prev) => ({ ...prev, [field]: value }));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bot Flows</h1>
          <p className="text-gray-500 mt-1">Create and manage automated conversation flows</p>
        </div>
        {activeTab === 'flows' && (
          <Button onClick={handleOpenCreate} className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Flow
          </Button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Status</option>
          {FLOW_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4 -mb-px" aria-label="Bot Flows tabs">
          <button
            onClick={() => setActiveTab('flows')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'flows' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Flows ({flows.filter((f) => filterStatus === 'all' || f.status === filterStatus).length})
          </button>
          {selectedFlow && (
            <>
              <button
                onClick={() => setActiveTab('steps')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'steps' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Steps ({steps.length})
              </button>
              <button
                onClick={() => setActiveTab('issues')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'issues' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Issues ({issues.length})
              </button>
            </>
          )}
        </nav>
      </div>

      {activeTab === 'flows' && (
        <Card>
          <CardContent className="p-0">
            {flows.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">No bot flows yet</h3>
                <p className="text-gray-500 mt-1">Create your first bot flow to automate conversations</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 p-6">
                {flows
                  .filter((f) => filterStatus === 'all' || f.status === filterStatus)
                  .map((flow) => (
                    <Card key={flow.id} className="overflow-hidden" onClick={() => loadFlowDetails(flow)}>
                      <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                        <div>
                          <CardTitle className="text-lg">{flow.name}</CardTitle>
                          <p className="text-sm text-gray-500">v{flow.version}</p>
                        </div>
                        <Badge variant={
                          flow.status === "published" ? "success" :
                          flow.status === "archived" ? "default" : "warning"
                        }>
                          {flow.status.charAt(0).toUpperCase() + flow.status.slice(1)}
                          {flow.is_default && " (Default)"}
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {flow.description && <p className="text-sm text-gray-600">{flow.description}</p>}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">{steps.filter(s => s.flow_id === flow.id).length} steps</span>
                        </div>
                        <div className="pt-2 border-t border-gray-200 flex gap-2">
                          {flow.status === "draft" && (
                            <>
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handlePublish(flow); }}>
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Publish
                              </Button>
                            </>
                          )}
                          {flow.status === "published" && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleArchive(flow); }}>
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                              Archive
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEdit(flow); }}>
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleDelete(flow); }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'steps' && selectedFlow && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Steps for "{selectedFlow.name}"</CardTitle>
            <Button onClick={handleOpenStepCreate} className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Step
            </Button>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">No steps yet</h3>
                <p className="text-gray-500 mt-1">Add steps to define the conversation flow</p>
              </div>
            ) : (
              <div className="space-y-2">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <Badge variant="default">{step.step_type}</Badge>
                      <div>
                        <div className="font-medium text-gray-900">{step.step_key}</div>
                        <div className="text-sm text-gray-500">
                          {step.message_text?.slice(0, 80) || "—"}
                        </div>
                        {step.options && (
                          <div className="text-xs text-gray-400 font-mono">
                            Options: {Array.isArray(step.options) ? step.options.join(", ") : JSON.stringify(step.options).slice(0, 50)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={step.is_terminal ? "success" : "default"}>
                        {step.is_terminal ? "Terminal" : "Continues"}
                      </Badge>
                      {step.next_step_key && (
                        <span className="text-xs text-gray-500">→ {step.next_step_key}</span>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleOpenStepEdit(step)}>
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleStepDelete(step)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'issues' && selectedFlow && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Issues for "{selectedFlow.name}"</CardTitle>
            <Button onClick={handleOpenIssueCreate} className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Issue
            </Button>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">No issues yet</h3>
                <p className="text-gray-500 mt-1">Add issues to provide menu options for users</p>
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="font-medium text-gray-900">{issue.title}</div>
                        <div className="text-sm text-gray-500">{issue.description || "—"}</div>
                        <div className="text-xs text-gray-400">Starts at: {issue.start_step_key}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={issue.is_active ? "success" : "default"}>
                        {issue.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => handleOpenIssueEdit(issue)}>
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleIssueDelete(issue)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingFlow ? "Edit Bot Flow" : "New Bot Flow"}
              </h2>
              <Button variant="ghost" size="sm" onClick={handleCloseModal} className="p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  required
                  placeholder="e.g., Support Bot Flow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Greeting</label>
                <textarea
                  value={formData.initial_greeting}
                  onChange={(e) => handleInputChange("initial_greeting", e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Hello! How can I help you today?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange("status", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {FLOW_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => handleInputChange("is_default", e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_default" className="ml-2 text-sm text-gray-700">
                  Set as default flow
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingFlow ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stepModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingStep ? "Edit Step" : "New Step"}
              </h2>
              <Button variant="ghost" size="sm" onClick={handleCloseStepModal} className="p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <form onSubmit={handleStepSubmit} className="p-6 space-y-6">
              {stepFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {stepFormError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step Key *</label>
                <Input
                  type="text"
                  value={stepFormData.step_key}
                  onChange={(e) => handleStepInputChange("step_key", e.target.value)}
                  required
                  placeholder="e.g., greeting, ask_issue, handoff"
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step Type *</label>
                <select
                  value={stepFormData.step_type}
                  onChange={(e) => handleStepInputChange("step_type", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message Text</label>
                <textarea
                  value={stepFormData.message_text}
                  onChange={(e) => handleStepInputChange("message_text", e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Message to send to user"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Options (JSON Array)</label>
                <textarea
                  value={stepFormData.options ? JSON.stringify(stepFormData.options, null, 2) : ""}
                  onChange={(e) => {
                    try {
                      handleStepInputChange("options", e.target.value ? JSON.parse(e.target.value) : null);
                    } catch {}
                  }}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder='["Option 1", "Option 2", "Option 3"]'
                />
                <p className="mt-1 text-xs text-gray-500">For question type: array of string options</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Next Step Key</label>
                <Input
                  type="text"
                  value={stepFormData.next_step_key || ""}
                  onChange={(e) => handleStepInputChange("next_step_key", e.target.value)}
                  placeholder="e.g., ask_issue"
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_terminal"
                    checked={stepFormData.is_terminal}
                    onChange={(e) => handleStepInputChange("is_terminal", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_terminal" className="ml-2 text-sm text-gray-700">
                    Terminal (ends flow)
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <Input
                    type="number"
                    value={stepFormData.sort_order}
                    onChange={(e) => handleStepInputChange("sort_order", parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseStepModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={stepSubmitting}>
                  {stepSubmitting ? "Saving..." : editingStep ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {issueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingIssue ? "Edit Issue" : "New Issue"}
              </h2>
              <Button variant="ghost" size="sm" onClick={handleCloseIssueModal} className="p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <form onSubmit={handleIssueSubmit} className="p-6 space-y-6">
              {issueFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {issueFormError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <Input
                  type="text"
                  value={issueFormData.title}
                  onChange={(e) => handleIssueInputChange("title", e.target.value)}
                  required
                  placeholder="e.g., Billing Issue"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={issueFormData.description}
                  onChange={(e) => handleIssueInputChange("description", e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Step Key *</label>
                <Input
                  type="text"
                  value={issueFormData.start_step_key || ""}
                  onChange={(e) => handleIssueInputChange("start_step_key", e.target.value)}
                  required
                  placeholder="e.g., ask_issue"
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <Input
                    type="number"
                    value={issueFormData.sort_order}
                    onChange={(e) => handleIssueInputChange("sort_order", parseInt(e.target.value, 10))}
                  />
                </div>

                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={issueFormData.is_active}
                    onChange={(e) => handleIssueInputChange("is_active", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseIssueModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={issueSubmitting}>
                  {issueSubmitting ? "Saving..." : editingIssue ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}