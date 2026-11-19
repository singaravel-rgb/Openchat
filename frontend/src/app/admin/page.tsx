'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import type { AdminStats } from '@/lib/types';

interface WidgetVisibility {
  ai_metrics: boolean;
  core_stats: boolean;
  agent_status: boolean;
  quick_links: boolean;
}

const DEFAULT_WIDGET_VISIBILITY: WidgetVisibility = {
  ai_metrics: true,
  core_stats: true,
  agent_status: true,
  quick_links: true,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [widgets, setWidgets] = useState<WidgetVisibility>(DEFAULT_WIDGET_VISIBILITY);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('openchat_dashboard_widgets');
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
        localStorage.setItem('openchat_dashboard_widgets', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const fetchStats = async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time overview of AI routing, agent capacity, and SLA compliance
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

      {/* Widget 1: AI Performance & Automation Metrics */}
      {widgets.ai_metrics && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
              <span>🤖</span> AI Support & Automation
            </h2>
            <Link href="/admin/conversations?status=ai_handling" className="text-xs text-purple-600 dark:text-purple-400 hover:underline">
              View AI Queue →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/admin/conversations?status=ai_handling" className="block group">
              <Card className="hover:shadow-md transition-shadow border-purple-200 dark:border-purple-900/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Currently With AI</p>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats?.conversations.ai_handling || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <span className="text-base">🤖</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-emerald-200 dark:border-emerald-900/40 h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">AI Resolved</p>
                    <p className="text-2xl font-bold text-emerald-600">{stats?.conversations.ai_resolved || 0}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Link href="/admin/conversations?status=open" className="block group">
              <Card className="hover:shadow-md transition-shadow border-blue-200 dark:border-blue-900/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Human Handled</p>
                      <p className="text-2xl font-bold text-blue-600">{stats?.conversations.human_handled || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <span className="text-base">👤</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Card className="h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Escalation Rate</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                      {stats?.conversations.escalation_rate !== undefined ? `${stats.conversations.escalation_rate}%` : '0%'}
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <span className="text-base">📈</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-rose-200 dark:border-rose-900/40 h-full">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Missed Deadlines</p>
                    <p className="text-2xl font-bold text-rose-600">{stats?.conversations.missed_deadlines || 0}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                    <span className="text-base">🚨</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Widget 2: Core Conversation Volumes */}
      {widgets.core_stats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Conversation Queues
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/admin/conversations" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
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

            <Link href="/admin/conversations?status=pending" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
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

            <Link href="/admin/conversations?status=on_hold" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-amber-200 dark:border-amber-900/40 h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">On Hold</p>
                        <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Paused</span>
                      </div>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats?.conversations.on_hold || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-amber-700 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=open" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Assigned</p>
                      <p className="text-2xl font-bold text-blue-600">{stats?.conversations.assigned || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations?status=resolved" className="block group">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Resolved Today</p>
                      <p className="text-2xl font-bold text-emerald-600">{stats?.conversations.today || 0}</p>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* Widget 3: Agent Capacity & Availability */}
      {widgets.agent_status && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Team Workload & Capacity
            </h2>
            <Link href="/admin/agents" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Manage Agents & Status →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Agents</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.agents.total || 0}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Online & Available</p>
                    <p className="text-2xl font-bold text-emerald-600">{stats?.agents.available || 0}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="text-emerald-500 text-lg">🟢</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Busy / At Capacity</p>
                    <p className="text-2xl font-bold text-amber-600">{stats?.agents.busy || 0}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="text-amber-500 text-lg">🟡</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Avg Resolution</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {stats?.avg_resolution_hours ? `${stats.avg_resolution_hours}h` : 'N/A'}
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <svg className="w-4.5 h-4.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Widget 4: Quick Links */}
      {widgets.quick_links && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Operations & Settings
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/agents" className="block">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Manage Agents</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Status, capacity & roles</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/conversations" className="block">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Workspace</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Live ticket triage</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/integrations" className="block">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <span className="text-base">🔌</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Integrations</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Webhooks, CRM & plugins</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/settings" className="block">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Admin Settings</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Timers, rules & SLA</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* Customize Widgets Modal */}
      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Customize Dashboard Layout</h3>
              <button
                type="button"
                onClick={() => setShowCustomizeModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Toggle which operational metric sections are displayed on your dashboard. Changes persist automatically.
            </p>
            <div className="space-y-3">
              {[
                { key: 'ai_metrics' as const, label: '🤖 AI & Automation Metrics', desc: 'AI volume, AI resolved, escalation rate' },
                { key: 'core_stats' as const, label: '📊 Conversation Queues', desc: 'Total, pending, on hold, assigned, resolved today' },
                { key: 'agent_status' as const, label: '👥 Team & Capacity Tracking', desc: 'Total agents, online, busy, resolution time' },
                { key: 'quick_links' as const, label: '⚡ Operations & Settings', desc: 'Direct links to agents, workspace, integrations, settings' },
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
