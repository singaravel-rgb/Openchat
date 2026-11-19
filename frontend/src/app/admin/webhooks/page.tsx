"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { webhookApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { Webhook, WebhookCreate, WebhookUpdate, WebhookDeliveryResponse, WebhookTest } from "@/lib/types";

const WEBHOOK_EVENTS = [
  "conversation_created",
  "conversation_updated",
  "conversation_assigned",
  "conversation_resolved",
  "message_created",
  "message_updated",
  "customer_created",
  "customer_updated",
  "sla_warning",
  "sla_breach",
];

export default function WebhooksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [formData, setFormData] = useState<WebhookCreate>({
    name: "",
    url: "",
    secret: "",
    events: [],
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<WebhookDeliveryResponse[]>([]);
  const [showDeliveries, setShowDeliveries] = useState<number | null>(null);
  const [testEvent, setTestEvent] = useState("conversation_created");
  const [testing, setTesting] = useState(false);

  const [filterActive, setFilterActive] = useState<string>("all");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && user.role !== "admin" && user.role !== "super_admin") {
      router.push("/agent");
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return;

    setIsLoading(true);
    setError(null);
    try {
      const params: { is_active?: boolean } = {};
      if (filterActive !== "all") params.is_active = filterActive === "true";

      const data = await webhookApi.list(params);
      setWebhooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load webhooks");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterActive, user]);

  const handleOpenCreate = () => {
    setEditingWebhook(null);
    setFormData({
      name: "",
      url: "",
      secret: "",
      events: [],
      is_active: true,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormData({
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret || "",
      events: webhook.events,
      is_active: webhook.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWebhook(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingWebhook) {
        const updateData: WebhookUpdate = {
          name: formData.name,
          url: formData.url,
          secret: formData.secret || undefined,
          events: formData.events,
          is_active: formData.is_active,
        };
        await webhookApi.update(editingWebhook.id, updateData);
      } else {
        await webhookApi.create(formData);
      }
      setShowModal(false);
      setEditingWebhook(null);
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (webhook: Webhook) => {
    if (!window.confirm(`Delete "${webhook.name}"? This cannot be undone.`)) return;

    try {
      await webhookApi.delete(webhook.id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleViewDeliveries = async (webhookId: number) => {
    if (showDeliveries === webhookId) {
      setShowDeliveries(null);
      return;
    }
    try {
      const data = await webhookApi.listDeliveries(webhookId);
      setDeliveries(data);
      setShowDeliveries(webhookId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load deliveries");
    }
  };

  const handleTest = async (webhookId: number) => {
    setTesting(true);
    try {
      const result = await webhookApi.test(webhookId, {
        event: testEvent,
        payload: { test: true, timestamp: new Date().toISOString() },
      });
      const success = result.response_status !== null && result.response_status >= 200 && result.response_status < 300;
      alert(`Test ${success ? "succeeded" : "failed"}: ${result.response_body || "No response"}`);
      // Refresh deliveries to show the test
      const data = await webhookApi.listDeliveries(webhookId);
      setDeliveries(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleRetry = async (webhookId: number, deliveryId: number) => {
    try {
      await webhookApi.retryDelivery(webhookId, deliveryId);
      // Refresh deliveries
      const data = await webhookApi.listDeliveries(webhookId);
      setDeliveries(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Retry failed");
    }
  };

  const handleInputChange = (field: keyof WebhookCreate, value: string | boolean | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEventsChange = (event: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      events: checked
        ? [...prev.events, event]
        : prev.events.filter((e) => e !== event),
    }));
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
          <h1 className="text-2xl font-semibold text-gray-900">Webhooks</h1>
          <p className="text-gray-500 mt-1">Configure webhook endpoints for real-time event notifications</p>
        </div>
        <Button onClick={handleOpenCreate} className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Webhook
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
                    URL
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Events
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deliveries
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
                {webhooks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No webhooks configured. Create your first one!
                    </td>
                  </tr>
                ) : (
                  webhooks.map((webhook) => (
                    <tr key={webhook.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{webhook.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 truncate max-w-xs block font-mono">
                          {webhook.url}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.map((event) => (
                            <Badge key={event} variant="default" className="text-xs">
                              {event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={webhook.is_active ? "success" : "default"}>
                          {webhook.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDeliveries(webhook.id)}
                          className="p-1"
                        >
                          View
                        </Button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(webhook.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(webhook)}
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
                            onClick={() => handleDelete(webhook)}
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

      {showDeliveries && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Delivery History</CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={testEvent}
                onChange={(e) => setTestEvent(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {WEBHOOK_EVENTS.map((event) => (
                  <option key={event} value={event}>
                    {event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest(showDeliveries)}
                disabled={testing}
              >
                {testing ? "Testing..." : "Test"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDeliveries(null)} className="p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Event
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Response
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deliveries.filter((d) => d.webhook_id === showDeliveries).map((delivery) => (
                    <tr key={delivery.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono text-gray-900">{delivery.event}</span>
                      </td>
                      <td className="px-6 py-4">
                        {delivery.response_status ? (
                          <Badge variant={delivery.response_status >= 200 && delivery.response_status < 300 ? "success" : "danger"}>
                            {delivery.response_status}
                          </Badge>
                        ) : (
                          <Badge variant="danger">Failed</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 max-w-xs truncate block font-mono">
                          {delivery.response_body || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={delivery.duration_ms !== null && delivery.duration_ms < 1000 ? "success" : "warning"}>
                          {delivery.duration_ms !== null ? `${delivery.duration_ms}ms` : "—"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(delivery.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetry(showDeliveries!, delivery.id)}
                          className="p-1"
                        >
                          Retry
                        </Button>
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
                {editingWebhook ? "Edit Webhook" : "New Webhook"}
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
                  placeholder="e.g., Slack Notifications"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                <Input
                  type="url"
                  value={formData.url}
                  onChange={(e) => handleInputChange("url", e.target.value)}
                  required
                  placeholder="https://your-server.com/webhook"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secret (Optional)</label>
                <Input
                  type="text"
                  value={formData.secret}
                  onChange={(e) => handleInputChange("secret", e.target.value)}
                  placeholder="Leave empty to disable signature verification"
                  className="font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Used to sign payloads with HMAC-SHA256. Sent as X-Webhook-Signature header.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Events *</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto border border-gray-300 rounded-lg p-3">
                  {WEBHOOK_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(event)}
                        onChange={(e) => handleEventsChange(event, e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {event.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </label>
                  ))}
                </div>
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
                  Active (webhook will receive events)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingWebhook ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}