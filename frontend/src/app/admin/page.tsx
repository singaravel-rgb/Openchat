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

  const humanHandled = (stats?.conversations.assigned || 0) + (stats?.conversations.open || 0);
  const resolvedTotal = (stats?.conversations.ai_resolved || 0) + (stats?.conversations.today || 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Operations Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time oversight of customer conversations, AI automation, and team workload
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>📊</span> Section 1 — Conversation Overview
            </h2>
            <Link href="/admin/conversations" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Open Workspace →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/admin/conversations" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-slate-200 dark:border-slate-800">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Total Conversations</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.conversations.total || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-purple-200 dark:border-purple-900/40">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">AI Handling</p>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats?.conversations.ai_handling || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <span className="text-base">🤖</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-blue-200 dark:border-blue-900/40">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Human Handling</p>
                      <p className="text-2xl font-bold text-blue-600">{humanHandled}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <span className="text-base">👤</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=pending" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-amber-200 dark:border-amber-900/40">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Pending</p>
                      <p className="text-2xl font-bold text-amber-600">{stats?.conversations.pending || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=resolved" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-emerald-200 dark:border-emerald-900/40">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
                      <p className="text-2xl font-bold text-emerald-600">{resolvedTotal}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* SECTION 2: Agent Overview */}
      {widgets.agent_overview && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>👥</span> Section 2 — Agent Overview
            </h2>
            <Link href="/admin/agents" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Manage Agents & Capacity →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Agents</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalAgents}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 dark:border-emerald-900/40">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Available</p>
                    <p className="text-2xl font-bold text-emerald-600">{availableAgents}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="text-base">🟢</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 dark:border-amber-900/40">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Busy / At Capacity</p>
                    <p className="text-2xl font-bold text-amber-600">{busyAgents}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="text-base">🟡</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Offline</p>
                    <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{offlineAgents}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <span className="text-base">⚪</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SECTION 3: Attention Required */}
      {widgets.attention_required && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <span>🚨</span> Section 3 — Attention Required
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/conversations?status=pending" className="block group">
              <Card className="hover:shadow-md transition-shadow border-amber-200 dark:border-amber-900/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Unassigned / Pending</p>
                      <p className="text-2xl font-bold text-amber-600">{stats?.conversations.pending || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <span className="text-base">⏳</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Awaiting agent pick or auto-assignment</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=waiting_on_customer" className="block group">
              <Card className="hover:shadow-md transition-shadow border-purple-200 dark:border-purple-900/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Waiting on Customer</p>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats?.conversations.waiting_on_customer || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <span className="text-base">💬</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Awaiting customer response</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations" className="block group">
              <Card className="hover:shadow-md transition-shadow border-rose-200 dark:border-rose-900/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Missed Deadlines</p>
                      <p className="text-2xl font-bold text-rose-600">{stats?.conversations.missed_deadlines || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                      <span className="text-base">⚠️</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">SLA breach warnings or reassignment</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=on_hold" className="block group">
              <Card className="hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">On Hold / Awaiting Reassign</p>
                      <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{stats?.conversations.on_hold || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-base">⏸️</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Paused or released back to triage</p>
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>🕒</span> Section 4 — Recent Activity & Conversations
            </h2>
            <Link href="/admin/conversations" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              View All Conversations →
            </Link>
          </div>
          <Card>
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

      {/* Quick Navigation Footer */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/conversations" className="block">
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm">💬</div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Workspace</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">All conversations triage</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/agents" className="block">
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm">👥</div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Agents</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Manage support agents</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/bot-flows" className="block">
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm">🤖</div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Bot Flows</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Interactive bot menu</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/settings" className="block">
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">⚙️</div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Settings</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">SLA & timers</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

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
