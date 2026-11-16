"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { automationRuleApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { AutomationRule, AutomationRuleCreate, AutomationRuleUpdate, AutomationRuleExecution } from "@/lib/types";

const TRIGGER_EVENTS = [
  "conversation_created",
  "conversation_assigned",
  "conversation_resolved",
  "message_received",
  "sla_warning",
  "sla_breach",
  "customer_replied",
  "agent_replied",
];

const CONDITION_HELP_TEXT = "JSON array of condition objects. Each condition: {field, operator, value}";
const ACTION_HELP_TEXT = "JSON array of action objects. Each action: {action, params}";

export default function AutomationRulesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [formData, setFormData] = useState<AutomationRuleCreate>({
    name: "",
    description: "",
    trigger_event: "conversation_created",
    conditions: [],
    actions: [],
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [filterActive, setFilterActive] = useState<string>("all");
  const [filterTrigger, setFilterTrigger] = useState<string>("all");
  const [executions, setExecutions] = useState<AutomationRuleExecution[]>([]);
  const [showExecutions, setShowExecutions] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && user.role !== "admin") {
      router.push("/agent");
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    if (!user || user.role !== "admin") return;

    setIsLoading(true);
    setError(null);
    try {
      const params: { is_active?: boolean; trigger_event?: string } = {};
      if (filterActive !== "all") params.is_active = filterActive === "true";
      if (filterTrigger !== "all") params.trigger_event = filterTrigger;

      const data = await automationRuleApi.list(params);
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automation rules");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterActive, filterTrigger, user]);

  const handleOpenCreate = () => {
    setEditingRule(null);
    setFormData({
      name: "",
      description: "",
      trigger_event: "conversation_created",
      conditions: [],
      actions: [],
      is_active: true,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      trigger_event: rule.trigger_event,
      conditions: rule.conditions,
      actions: rule.actions,
      is_active: rule.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRule(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingRule) {
        const updateData: AutomationRuleUpdate = {
          name: formData.name,
          description: formData.description || undefined,
          trigger_event: formData.trigger_event,
          conditions: formData.conditions,
          actions: formData.actions,
          is_active: formData.is_active,
        };
        await automationRuleApi.update(editingRule.id, updateData);
      } else {
        await automationRuleApi.create(formData);
      }
      setShowModal(false);
      setEditingRule(null);
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rule: AutomationRule) => {
    if (!window.confirm(`Delete "${rule.name}"? This cannot be undone.`)) return;

    try {
      await automationRuleApi.delete(rule.id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleViewExecutions = async (ruleId: number) => {
    if (showExecutions === ruleId) {
      setShowExecutions(null);
      return;
    }
    try {
      const data = await automationRuleApi.listExecutions(ruleId);
      setExecutions(data);
      setShowExecutions(ruleId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load executions");
    }
  };

  const handleInputChange = (field: keyof AutomationRuleCreate, value: string | boolean | string[] | object[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleConditionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const parsed = e.target.value ? JSON.parse(e.target.value) : [];
      handleInputChange("conditions", parsed);
    } catch {
      // Ignore invalid JSON while typing
    }
  };

  const handleActionsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const parsed = e.target.value ? JSON.parse(e.target.value) : [];
      handleInputChange("actions", parsed);
    } catch {
      // Ignore invalid JSON while typing
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Automation Rules</h1>
          <p className="text-gray-500 mt-1">Create rules to automate workflows based on events</p>
        </div>
        <Button onClick={handleOpenCreate} className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Rule
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        <select
          value={filterTrigger}
          onChange={(e) => setFilterTrigger(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Triggers</option>
          {TRIGGER_EVENTS.map((trigger) => (
            <option key={trigger} value={trigger}>
              {trigger.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trigger Event
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conditions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Executions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No automation rules found. Create your first one!
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{rule.name}</div>
                        {rule.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {rule.description.slice(0, 100)}{rule.description.length > 100 ? "..." : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="default">
                          {rule.trigger_event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 max-w-xs truncate block font-mono">
                          {rule.conditions.length > 0 ? JSON.stringify(rule.conditions).slice(0, 50) + "..." : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 max-w-xs truncate block font-mono">
                          {rule.actions.length > 0 ? JSON.stringify(rule.actions).slice(0, 50) + "..." : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={rule.is_active ? "success" : "default"}>
                          {rule.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewExecutions(rule.id)}
                          className="p-1"
                        >
                          View ({executions.filter((e) => e.rule_id === rule.id).length || 0})
                        </Button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(rule.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(rule)}
                            className="p-2"
                            aria-label="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rule)}
                            className="p-2 text-red-600 hover:bg-red-50"
                            aria-label="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showExecutions && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Execution History</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowExecutions(null)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trigger Event
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions Taken
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Success
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {executions.filter((e) => e.rule_id === showExecutions).map((execution) => (
                    <tr key={execution.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-gray-900">{execution.trigger_event}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 max-w-xs truncate block font-mono">
                          {JSON.stringify(execution.actions_taken).slice(0, 80)}{JSON.stringify(execution.actions_taken).length > 80 ? "..." : ""}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={execution.success ? "success" : "danger"}>
                          {execution.success ? "Success" : "Failed"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {execution.error_message ? (
                          <span className="text-sm text-red-600 truncate max-w-xs block">{execution.error_message}</span>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(execution.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingRule ? "Edit Automation Rule" : "New Automation Rule"}
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
                  placeholder="e.g., Auto-assign new conversations"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Optional description of what this rule does"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Event *</label>
                <select
                  value={formData.trigger_event}
                  onChange={(e) => handleInputChange("trigger_event", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {TRIGGER_EVENTS.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {trigger.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conditions (JSON Array)</label>
                <textarea
                  value={JSON.stringify(formData.conditions, null, 2)}
                  onChange={handleConditionsChange}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder='[{{"field": "status", "operator": "equals", "value": "pending"}}]'
                />
                <p className="mt-1 text-xs text-gray-500">{CONDITION_HELP_TEXT}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actions (JSON Array)</label>
                <textarea
                  value={JSON.stringify(formData.actions, null, 2)}
                  onChange={handleActionsChange}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder='[{{"action": "assign_agent", "params": {"method": "round_robin"}}}]'
                />
                <p className="mt-1 text-xs text-gray-500">{ACTION_HELP_TEXT}</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange("is_active", e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                  Active (rule will be evaluated)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingRule ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}