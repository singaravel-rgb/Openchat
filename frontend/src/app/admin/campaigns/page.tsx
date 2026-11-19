"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { campaignApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { Campaign, CampaignCreate, CampaignUpdate, CampaignMessageResponse, CampaignLaunch } from "@/lib/types";

const CAMPAIGN_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sending", label: "Sending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const PLACEHOLDER_HELP_TEXT = "Use {customer_name} and {customer_email} as placeholders.";

export default function CampaignsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState<CampaignCreate>({
    name: "",
    description: "",
    message_template: "",
    target_criteria: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [messages, setMessages] = useState<CampaignMessageResponse[]>([]);
  const [showMessages, setShowMessages] = useState<number | null>(null);
  const [launching, setLaunching] = useState<number | null>(null);
  const [launchDryRun, setLaunchDryRun] = useState(true);
  const [launchCustomerIds, setLaunchCustomerIds] = useState<string>("");

  const [filterStatus, setFilterStatus] = useState<string>("all");

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
      const params: { status?: string } = {};
      if (filterStatus !== "all") params.status = filterStatus;

      const data = await campaignApi.list(params);
      setCampaigns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus, user]);

  const handleOpenCreate = () => {
    setEditingCampaign(null);
    setFormData({
      name: "",
      description: "",
      message_template: "",
      target_criteria: "",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description || "",
      message_template: campaign.message_template,
      target_criteria: campaign.target_criteria || "",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCampaign(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingCampaign) {
        const updateData: CampaignUpdate = {
          name: formData.name,
          description: formData.description || undefined,
          message_template: formData.message_template,
          target_criteria: formData.target_criteria,
        };
        await campaignApi.update(editingCampaign.id, updateData);
      } else {
        await campaignApi.create(formData);
      }
      setShowModal(false);
      setEditingCampaign(null);
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (campaign: Campaign) => {
    if (!window.confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;

    try {
      await campaignApi.delete(campaign.id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleViewMessages = async (campaignId: number) => {
    if (showMessages === campaignId) {
      setShowMessages(null);
      return;
    }
    try {
      const data = await campaignApi.listMessages(campaignId);
      setMessages(data);
      setShowMessages(campaignId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load messages");
    }
  };

  const handleLaunch = async (campaign: Campaign) => {
    setLaunching(campaign.id);
    try {
      const customerIds = launchCustomerIds.trim()
        ? launchCustomerIds.split(",").map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
        : undefined;

      const result = await campaignApi.launch(campaign.id, {
        customer_ids: customerIds,
        dry_run: launchDryRun,
      });

      alert(
        `Campaign ${launchDryRun ? "dry run" : "launch"} complete:\n` +
        `Total: ${result.total}\n` +
        `Sent: ${result.sent}\n` +
        `Failed: ${result.failed}`
      );
      loadData();
      setLaunchCustomerIds("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to launch campaign");
    } finally {
      setLaunching(null);
    }
  };

  const handleInputChange = (field: keyof CampaignCreate, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTargetCriteriaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Store as JSON string, not parsed object
    handleInputChange("target_criteria", e.target.value);
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
          <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">Create and manage outbound messaging campaigns</p>
        </div>
        <Button onClick={handleOpenCreate} className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </Button>
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
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
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
                    Template Preview
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sent / Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Messages
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
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No campaigns yet. Create your first one!
                    </td>
                  </tr>
                ) : (
                  campaigns
                    .filter((c) => filterStatus === 'all' || c.status === filterStatus)
                    .map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{campaign.name}</div>
                          {campaign.description && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {campaign.description.slice(0, 100)}{campaign.description.length > 100 ? "..." : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-500 max-w-xs truncate block font-mono">
                            {campaign.message_template.slice(0, 80)}{campaign.message_template.length > 80 ? "..." : ""}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={
                            campaign.status === "completed" ? "success" :
                            campaign.status === "failed" ? "danger" :
                            campaign.status === "sending" ? "warning" : "default"
                          }>
                            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {campaign.sent_count !== undefined && campaign.sent_count > 0 ? (
                            <span className="text-sm text-gray-900">
                              {campaign.sent_count} / {campaign.sent_count + (campaign.failed_count || 0)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewMessages(campaign.id)}
                            className="p-1"
                          >
                            View
                          </Button>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(campaign.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(campaign)}
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
                            {campaign.status === "draft" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setLaunchDryRun(true);
                                  setLaunchCustomerIds("");
                                  setLaunching(campaign.id);
                                }}
                                className="flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Dry Run
                              </Button>
                            )}
                            {campaign.status === "draft" && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  setLaunchDryRun(false);
                                  setLaunchCustomerIds("");
                                  setLaunching(campaign.id);
                                }}
                                className="flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Launch
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(campaign)}
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

      {showMessages && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Campaign Messages</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowMessages(null)} className="p-2">
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
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Content Preview
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {messages.filter((m) => m.campaign_id === showMessages).map((msg) => (
                    <tr key={msg.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{msg.customer_id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={
                          msg.status === "sent" ? "success" :
                          msg.status === "failed" ? "danger" : "warning"
                        }>
                          {msg.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500 max-w-xs truncate block font-mono">
                          {msg.message_content.slice(0, 80)}{msg.message_content.length > 80 ? "..." : ""}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : "—"}
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
                {editingCampaign ? "Edit Campaign" : "New Campaign"}
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
                  placeholder="e.g., Holiday Promotion"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Message Template *</label>
                <textarea
                  value={formData.message_template}
                  onChange={(e) => handleInputChange("message_template", e.target.value)}
                  required
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder="Hello {{customer_name}},\n\nWe have a special offer for you..."
                />
                <p className="mt-1 text-xs text-gray-500">{PLACEHOLDER_HELP_TEXT}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Criteria (JSON)</label>
                <textarea
                  value={formData.target_criteria || ""}
                  onChange={handleTargetCriteriaChange}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder='{"tags": ["vip", "active"], "last_contact_days": 30}'
                />
                <p className="mt-1 text-xs text-gray-500">Optional JSON object for targeting. Leave empty to target all active customers.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingCampaign ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {launching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {launchDryRun ? "Dry Run Campaign" : "Launch Campaign"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setLaunching(null)} className="p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer IDs (comma-separated, optional)
                </label>
                <Input
                  type="text"
                  value={launchCustomerIds}
                  onChange={(e) => setLaunchCustomerIds(e.target.value)}
                  placeholder="e.g., 1, 5, 12, 23"
                />
                <p className="mt-1 text-xs text-gray-500">Leave empty to target all active customers matching criteria.</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dry_run"
                  checked={launchDryRun}
                  onChange={(e) => setLaunchDryRun(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="dry_run" className="ml-2 text-sm text-gray-700">
                  Dry run (don't actually send messages)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={() => setLaunching(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const campaign = campaigns.find((c) => c.id === launching);
                    if (campaign) handleLaunch(campaign);
                  }}
                  disabled={launching === null}
                >
                  {launchDryRun ? "Run Dry Run" : "Launch Campaign"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}