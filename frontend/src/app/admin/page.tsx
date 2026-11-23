'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import type { AdminStats, ConversationListItem } from '@/lib/types';

interface WidgetVisibility {
  conv_overview: boolean;
  agent_overview: boolean;
  attention_required: boolean;
  recent_activity: boolean;
}

const DEFAULT_WIDGET_VISIBILITY: WidgetVisibility = {
  conv_overview: true,
  agent_overview: true,
  attention_required: true,
  recent_activity: true,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentConversations, setRecentConversations] = useState<ConversationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [widgets, setWidgets] = useState<WidgetVisibility>(DEFAULT_WIDGET_VISIBILITY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('openchat_dashboard_widgets_v2');
      if (saved) {
        setWidgets(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleWidget = (key: keyof WidgetVisibility) => {
    setWidgets((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('openchat_dashboard_widgets_v2', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const fetchStats = async () => {
    try {
      const [statsData, convsData] = await Promise.all([
        adminApi.getStats(),
        adminApi.listConversations({ limit: 6 }).catch(() => [] as ConversationListItem[]),
      ]);
      setStats(statsData);
      setRecentConversations(convsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleEvaluateEscalations = async () => {
    setIsEvaluating(true);
    setEvalResult(null);
    try {
      const token = localStorage.getItem('access_token') || '';
      const res = await fetch('/api/v1/admin/escalation/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setEvalResult(
          `Evaluated response timers: ${json.warnings_issued || 0} warning(s), ${json.reassignments || 0} reassignment(s), ${json.pending_moved || 0} moved to pending.`
        );
        await fetchStats();
      } else {
        setEvalResult('Failed to evaluate escalations.');
      }
    } catch (err) {
      setEvalResult('Error evaluating escalations.');
    } finally {
      setIsEvaluating(false);
      setTimeout(() => setEvalResult(null), 7000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const totalAgents = stats?.agents.total || 0;
  const availableAgents = stats?.agents.available || 0;
  const busyAgents = stats?.agents.busy || 0;
  const offlineAgents = Math.max(0, totalAgents - availableAgents - busyAgents);

  const humanHandled = stats?.conversations.human_handling ?? stats?.conversations.human_handled ?? (stats?.conversations.assigned || 0);
  const allUnresolved = stats?.conversations.all_unresolved ?? stats?.conversations.total_unresolved ?? stats?.conversations.unresolved ?? 0;
  const aiHandling = stats?.conversations.ai_handling || 0;
  const pendingCount = stats?.conversations.pending || 0;
  const openCount = stats?.conversations.open || 0;
  const unassignedTotal = stats?.conversations.unassigned ?? stats?.conversations.pending ?? 0;
  const unansweredTotal = stats?.conversations.unanswered ?? stats?.conversations.waiting_on_customer ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Operations Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time oversight of customer conversations, AI routing, and support team capacity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEvaluateEscalations}
            disabled={isEvaluating}
            className="text-xs h-8 px-3 inline-flex items-center gap-1.5"
            title="Trigger response deadline & escalation check now"
          >
            <span className={isEvaluating ? 'animate-spin' : ''}>⚡</span>
            {isEvaluating ? 'Evaluating...' : 'Check Escalations'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomizeModal(true)}
            className="text-xs h-8 px-3 inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Customize
          </Button>
        </div>
      </div>

      {evalResult && (
        <div className="p-3 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg flex items-center justify-between animate-fadeIn">
          <span>{evalResult}</span>
          <button onClick={() => setEvalResult(null)} className="text-blue-500 hover:text-blue-700 font-bold ml-2">×</button>
        </div>
      )}

      {error && (
        <div className="p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* SECTION 1: Conversation Overview */}
      {widgets.conv_overview && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Conversation Overview
            </h2>
            <Link href="/admin/conversations" className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Open Workspace →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/admin/conversations" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-slate-200 dark:border-slate-800">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">All Unresolved</p>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{allUnresolved}</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?handling=ai" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-slate-200 dark:border-slate-800">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Handling</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{aiHandling}</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?handling=human" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-slate-200 dark:border-slate-800">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Human Handling</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{humanHandled}</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=pending" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-slate-200 dark:border-slate-800">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingCount}</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=open" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-slate-200 dark:border-slate-800">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open</p>
                  <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">{openCount}</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* SECTION 2: Team Status */}
      {widgets.agent_overview && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Team Status
            </h2>
            <Link href="/admin/agents" className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Manage Team →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Available Agents</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{availableAgents}</p>
                  </div>
                  <span className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950"></span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Busy Agents</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{busyAgents}</p>
                  </div>
                  <span className="w-3 h-3 rounded-full bg-amber-500 ring-4 ring-amber-100 dark:ring-amber-950"></span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Offline Agents</p>
                    <p className="text-2xl font-bold text-slate-500 dark:text-slate-400 mt-1">{offlineAgents}</p>
                  </div>
                  <span className="w-3 h-3 rounded-full bg-slate-400 ring-4 ring-slate-100 dark:ring-slate-800"></span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SECTION 3: Needs Attention */}
      {widgets.attention_required && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Needs Attention
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/admin/conversations?status=pending" className="block group">
              <Card className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 h-full">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unassigned Conversations</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{unassignedTotal}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Awaiting triage or agent assignment</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?filter=unanswered" className="block group">
              <Card className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 h-full">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unanswered Conversations</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{unansweredTotal}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Conversations requiring agent response</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?filter=sla_breached" className="block group">
              <Card className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 h-full">
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Missed Response Deadlines</p>
                  <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats?.conversations.missed_deadlines || 0}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">SLA target breached</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* SECTION 4: Recent Activity */}
      {widgets.recent_activity && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Recent Activity
            </h2>
            <Link href="/admin/conversations" className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
              View All Conversations →
            </Link>
          </div>
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-0">
              {recentConversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No recent conversations to display.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentConversations.map((c) => (
                    <Link
                      key={c.id}
                      href={`/admin/conversations?cid=${c.id}`}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                            {c.chat_id || `#${c.id}`}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {c.customer_name || 'Customer'}
                          </span>
                          <Badge variant={c.status === 'resolved' ? 'success' : c.status === 'ai_handling' ? 'ai' : 'primary'} className="text-[10px]">
                            {c.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {c.last_message || c.subject || 'No message content'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {c.assigned_agent_name || (c.status === 'ai_handling' ? '🤖 AI Bot' : 'Unassigned')}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {new Date(c.last_message_at || c.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customize Widgets Modal */}
      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Customize Dashboard Sections</h3>
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Toggle which operational sections appear on your dashboard. Choices are saved to your browser session.
            </p>
            <div className="space-y-3">
              {[
                { key: 'conv_overview' as const, label: 'Section 1: Conversation Overview', desc: 'Total, AI handling, human handling, pending, resolved' },
                { key: 'agent_overview' as const, label: 'Section 2: Agent Overview', desc: 'Total agents, available, busy, offline capacity' },
                { key: 'attention_required' as const, label: 'Section 3: Attention Required', desc: 'Pending, waiting on customer, missed deadlines, on hold' },
                { key: 'recent_activity' as const, label: 'Section 4: Recent Activity', desc: 'Live feed of latest conversations, status, and agents' },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={widgets[item.key]}
                    onChange={() => toggleWidget(item.key)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white">{item.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={() => setShowCustomizeModal(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
