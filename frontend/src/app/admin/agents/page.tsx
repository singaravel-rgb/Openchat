'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Avatar } from '@/components/Avatar';
import type { AdminAgent } from '@/lib/types';

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<AdminAgent | null>(null);
  const [maxConversations, setMaxConversations] = useState(5);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPassword, setNewAgentPassword] = useState('');
  const [newAgentMax, setNewAgentMax] = useState(5);
  const [isCreating, setIsCreating] = useState(false);
  const [resetModalData, setResetModalData] = useState<{ agentName: string; resetUrl: string; copied: boolean } | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await adminApi.listAgents();
        setAgents(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgents();
  }, []);

  const handleSetAvailability = async (agent: AdminAgent, nextStatus: 'available' | 'busy' | 'offline') => {
    try {
      const res = await adminApi.setAgentAvailability(agent.id, nextStatus === 'available', nextStatus);
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id
            ? {
                ...a,
                is_available: res.is_available ?? (nextStatus === 'available'),
                availability_status: nextStatus,
                effective_status: nextStatus,
                admin_forced_offline: res.admin_forced_offline ?? (nextStatus === 'offline'),
              }
            : a
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update availability');
    }
  };

  const handleEditMaxConversations = (agent: AdminAgent) => {
    setEditingAgent(agent);
    setMaxConversations(agent.max_conversations);
  };

  const handleSaveMaxConversations = async () => {
    if (!editingAgent) return;
    try {
      await adminApi.setAgentMaxConversations(editingAgent.id, maxConversations);
      setAgents((prev) =>
        prev.map((a) => (a.id === editingAgent.id ? { ...a, max_conversations: maxConversations } : a))
      );
      setEditingAgent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update max conversations');
    }
  };

  const handleResetPassword = async (agent: AdminAgent) => {
    setResettingId(agent.id);
    setError(null);
    try {
      const res = await adminApi.resetUserPassword(agent.id);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const fullUrl = res.reset_url || `${origin}/reset-password?token=${res.reset_token}`;
      setResetModalData({ agentName: agent.full_name, resetUrl: fullUrl, copied: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reset link');
    } finally {
      setResettingId(null);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentEmail || !newAgentName || !newAgentPassword) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await adminApi.createAgent({
        email: newAgentEmail,
        full_name: newAgentName,
        password: newAgentPassword,
        max_conversations: newAgentMax,
        is_available: true,
      });
      setAgents((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewAgentEmail('');
      setNewAgentName('');
      setNewAgentPassword('');
      setNewAgentMax(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Agents</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage support agents and their availability</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/admin/users'}>
            Manage All Staff & Roles →
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>+ Add Agent</Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Agent List</h2>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-slate-500 dark:text-slate-400">No agents found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="pb-3 font-medium">Agent</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Workload</th>
                    <th className="pb-3 font-medium">Capacity</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={agent.full_name} size="md" />
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{agent.full_name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{agent.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const eff = agent.effective_status || (agent.is_available ? 'available' : 'offline');
                            return (
                              <Badge variant={eff === 'available' ? 'success' : eff === 'busy' ? 'warning' : 'default'}>
                                {eff === 'available'
                                  ? 'Available'
                                  : eff === 'busy'
                                  ? 'Busy'
                                  : agent.admin_forced_offline
                                  ? 'Offline (Admin Locked)'
                                  : 'Offline'}
                              </Badge>
                            );
                          })()}
                          <Badge variant={agent.is_active ? 'primary' : 'default'}>
                            {agent.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-900 dark:text-white">{agent.active_conversations}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-500 dark:text-slate-400">{agent.max_conversations}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              agent.capacity_remaining > 0 ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.max(0, (agent.max_conversations - agent.active_conversations) / agent.max_conversations) * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {agent.capacity_remaining} slots remaining
                        </p>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Set availability for ${agent.full_name}`}
                            value={agent.availability_status || (agent.is_available ? 'available' : 'offline')}
                            onChange={(e) => handleSetAvailability(agent, e.target.value as 'available' | 'busy' | 'offline')}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                          >
                            <option value="available">Available</option>
                            <option value="busy">Busy</option>
                            <option value="offline">Force Offline</option>
                          </select>
                          <Button variant="outline" size="sm" onClick={() => handleEditMaxConversations(agent)}>
                            Max: {agent.max_conversations}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                            onClick={() => handleResetPassword(agent)}
                            disabled={resettingId === agent.id}
                          >
                            {resettingId === agent.id ? 'Generating...' : 'Reset Password'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Max Conversations Modal */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <h3 className="text-lg font-semibold">Edit Max Conversations</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600 dark:text-slate-400">
                Set maximum concurrent conversations for <strong>{editingAgent.full_name}</strong>
              </p>
              <Input
                label="Max Conversations"
                type="number"
                value={maxConversations}
                onChange={(e) => setMaxConversations(parseInt(e.target.value) || 1)}
                min={1}
                max={50}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingAgent(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveMaxConversations}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Agent Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <h3 className="text-lg font-semibold">Add New Agent</h3>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAgent} className="space-y-4">
                <Input
                  label="Full Name"
                  required
                  placeholder="e.g. Jane Doe"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                />
                <Input
                  label="Email Address"
                  type="email"
                  required
                  placeholder="jane@example.com"
                  value={newAgentEmail}
                  onChange={(e) => setNewAgentEmail(e.target.value)}
                />
                <Input
                  label="Password"
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={newAgentPassword}
                  onChange={(e) => setNewAgentPassword(e.target.value)}
                />
                <Input
                  label="Max Concurrent Conversations"
                  type="number"
                  min={1}
                  max={50}
                  value={newAgentMax}
                  onChange={(e) => setNewAgentMax(parseInt(e.target.value) || 5)}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    disabled={isCreating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create Agent'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Password Reset Link Modal */}
      {resetModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg shadow-xl">
            <CardHeader>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Password Reset Link Generated
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                A secure single-use password reset link for <strong>{resetModalData.agentName}</strong> has been generated (valid for 30 minutes).
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Reset URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={resetModalData.resetUrl}
                    className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(resetModalData.resetUrl);
                      setResetModalData((prev) => (prev ? { ...prev, copied: true } : null));
                    }}
                  >
                    {resetModalData.copied ? 'Copied!' : 'Copy Link'}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="primary" onClick={() => setResetModalData(null)}>
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}