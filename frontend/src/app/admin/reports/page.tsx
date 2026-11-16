'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { format, subDays } from 'date-fns';
import type { ConversationMetrics, AgentPerformance, TimeSeriesPoint, KnowledgeBaseMetrics, ReportFilters } from '@/lib/types';

export default function AdminReportsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'conversations' | 'agents' | 'timeseries' | 'knowledge'>('conversations');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datesInitialized, setDatesInitialized] = useState(false);
  const [agentFilter, setAgentFilter] = useState<number | null>(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [agents, setAgents] = useState<Array<{ id: number; full_name: string }>>([]);

  const [conversationMetrics, setConversationMetrics] = useState<ConversationMetrics | null>(null);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [knowledgeMetrics, setKnowledgeMetrics] = useState<KnowledgeBaseMetrics | null>(null);

  const fetchAgents = async () => {
    try {
      const data = await adminApi.listAgents();
      setAgents(data.map(a => ({ id: a.id, full_name: a.full_name })));
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const buildFilters = (): ReportFilters => ({
    date_from: dateFrom,
    date_to: dateTo,
    agent_id: agentFilter || undefined,
    channel: channelFilter || undefined,
  });

  const fetchConversationMetrics = async () => {
    try {
      const data = await adminApi.getConversationMetrics(buildFilters());
      setConversationMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation metrics');
    }
  };

  const fetchAgentPerformance = async () => {
    try {
      const data = await adminApi.getAgentPerformance(buildFilters());
      setAgentPerformance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent performance');
    }
  };

  const fetchTimeSeries = async () => {
    try {
      const data = await adminApi.getTimeSeries(buildFilters());
      setTimeSeries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load time series data');
    }
  };

  const fetchKnowledgeMetrics = async () => {
    try {
      const data = await adminApi.getKnowledgeMetrics(buildFilters());
      setKnowledgeMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge metrics');
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchConversationMetrics(),
        fetchAgentPerformance(),
        fetchTimeSeries(),
        fetchKnowledgeMetrics(),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    setDateFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    setDateTo(format(new Date(), 'yyyy-MM-dd'));
    setDatesInitialized(true);
  }, []);

  useEffect(() => {
    if (datesInitialized) {
      fetchData();
    }
  }, [dateFrom, dateTo, agentFilter, channelFilter, datesInitialized]);

  const handleExport = async (reportType: 'conversations' | 'agents' | 'timeseries' | 'knowledge', exportFormat: 'csv' | 'json') => {
    try {
      const blob = await adminApi.exportReport({
        report_type: reportType,
        format: exportFormat,
        filters: buildFilters(),
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report-${format(new Date(), 'yyyy-MM-dd')}.${exportFormat}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'conversations', label: 'Conversations', icon: '💬' },
    { id: 'agents', label: 'Agent Performance', icon: '👥' },
    { id: 'timeseries', label: 'Trends', icon: '📈' },
    { id: 'knowledge', label: 'Knowledge Base', icon: '📚' },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports & Analytics</h1>
            <p className="text-slate-500 dark:text-slate-400">Track performance and gain insights</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => handleExport(activeTab, 'csv')}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => handleExport(activeTab, 'json')}>
              Export JSON
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Agent</label>
              <select
                value={agentFilter?.toString() || ''}
                onChange={(e) => setAgentFilter(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Agents</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id.toString()}>{agent.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Channel</label>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Channels</option>
                <option value="web">Web</option>
                <option value="email">Email</option>
                <option value="api">API</option>
              </select>
            </div>
            <Button onClick={fetchData} disabled={isLoading}>
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-6 p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-1" aria-label="Report tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'conversations' && conversationMetrics && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Total Conversations</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{conversationMetrics.total}</div>
                <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                  +{conversationMetrics.today.created} today
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Resolved Today</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{conversationMetrics.today.resolved}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Resolved this period</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Avg First Response</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                  {conversationMetrics.avg_first_response_minutes
                    ? `${conversationMetrics.avg_first_response_minutes}m`
                    : 'N/A'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Minutes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Avg Resolution Time</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                  {conversationMetrics.avg_resolution_hours
                    ? `${conversationMetrics.avg_resolution_hours.toFixed(1)}h`
                    : 'N/A'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Hours</div>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Conversations by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(conversationMetrics.by_status).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={
                          status === 'resolved' || status === 'closed' ? 'success' :
                          status === 'assigned' ? 'info' :
                          status === 'pending' ? 'warning' : 'default'
                        }>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="font-medium text-slate-900 dark:text-white">{count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversations by Channel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(conversationMetrics.by_channel).map(([channel, count]) => (
                    <div key={channel} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="default">{channel}</Badge>
                      </div>
                      <div className="font-medium text-slate-900 dark:text-white">{count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {conversationMetrics.csat_score && (
            <Card>
              <CardHeader>
                <CardTitle>Customer Satisfaction (CSAT)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-slate-900 dark:text-white">
                    {conversationMetrics.csat_score.toFixed(1)}%
                  </div>
                  <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${conversationMetrics.csat_score}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Agent</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Assigned</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Resolved</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Resolution Rate</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Avg Resolution</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">First Response</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">CSAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {agentPerformance.map((agent) => (
                      <tr key={agent.agent_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{agent.agent_name}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{agent.assigned_count}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{agent.resolved_count}</td>
                        <td className="px-4 py-3">
                          {agent.assigned_count > 0
                            ? `${((agent.resolved_count / agent.assigned_count) * 100).toFixed(1)}%`
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {agent.avg_resolution_hours ? `${agent.avg_resolution_hours.toFixed(1)}h` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {agent.first_response_avg_minutes ? `${agent.first_response_avg_minutes}m` : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {agent.csat_avg ? `${agent.csat_avg.toFixed(1)}%` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                    {agentPerformance.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                          No agent performance data for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'timeseries' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conversation Trends (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 relative">
                <svg viewBox="0 0 800 300" className="w-full h-full" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <g stroke="currentColor" strokeOpacity="0.1" strokeWidth="1">
                    {[0, 75, 150, 225, 300].map(y => (
                      <line key={y} x1="50" y1={y} x2="750" y2={y} />
                    ))}
                    {[0, 175, 350, 525, 700].map(x => (
                      <line key={x} x1={50 + x} y1="0" x2={50 + x} y2="300" />
                    ))}
                  </g>

                  {/* Y-axis labels */}
                  <g fontSize="11" fill="currentColor" fillOpacity="0.6" textAnchor="end">
                    {[300, 225, 150, 75, 0].map((y, i) => (
                      <text key={y} x="45" y={y + 4} dominantBaseline="middle">
                        {Math.round((i / 4) * 100)}
                      </text>
                    ))}
                  </g>

                  {/* X-axis labels */}
                  {timeSeries.length > 0 && (
                    <g fontSize="11" fill="currentColor" fillOpacity="0.6" textAnchor="middle">
                      {timeSeries.map((point, i) => (
                        <text
                          key={i}
                          x={50 + (i / Math.max(timeSeries.length - 1, 1)) * 700}
                          y={315}
                          dominantBaseline="middle"
                        >
                          {format(new Date(point.date), 'MMM d')}
                        </text>
                      ))}
                    </g>
                  )}

                  {/* Created line */}
                  {timeSeries.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      points={timeSeries.map((point, i) =>
                        `${50 + (i / Math.max(timeSeries.length - 1, 1)) * 700},${300 - (point.created / Math.max(...timeSeries.map(p => p.created), 1)) * 300}`
                      ).join(' ')}
                    />
                  )}

                  {/* Resolved line */}
                  {timeSeries.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="2"
                      points={timeSeries.map((point, i) =>
                        `${50 + (i / Math.max(timeSeries.length - 1, 1)) * 700},${300 - (point.resolved / Math.max(...timeSeries.map(p => p.resolved), 1)) * 300}`
                      ).join(' ')}
                    />
                  )}

                  {/* Legend */}
                  <g fontSize="12" fill="currentColor">
                    <rect x="60" y="10" width="12" height="12" fill="#3b82f6" rx="2" />
                    <text x="80" y="20" fillOpacity="0.8">Created</text>
                    <rect x="160" y="10" width="12" height="12" fill="#22c55e" rx="2" />
                    <text x="180" y="20" fillOpacity="0.8">Resolved</text>
                  </g>
                </svg>
              </div>

              {/* Data Table */}
              <div className="mt-6 overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Created</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Resolved</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Avg Resolution (hrs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {timeSeries.map((point) => (
                      <tr key={point.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">
                          {format(new Date(point.date), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{point.created}</td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{point.resolved}</td>
                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                          {point.avg_resolution_hours ? point.avg_resolution_hours.toFixed(1) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                    {timeSeries.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                          No data for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'knowledge' && knowledgeMetrics && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Total Articles</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{knowledgeMetrics.articles.total}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {knowledgeMetrics.articles.published} published
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Total FAQs</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{knowledgeMetrics.faqs.total}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {knowledgeMetrics.faqs.published} published
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">Article Views</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{knowledgeMetrics.articles.total_views}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-slate-500 dark:text-slate-400">FAQ Views</div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">{knowledgeMetrics.faqs.total_views}</div>
              </CardContent>
            </Card>
          </div>

          {/* Top Articles & FAQs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Articles by Views</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {knowledgeMetrics.top_articles.map((article, index) => (
                    <div key={article.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-6">
                          {index + 1}.
                        </span>
                        <div className="font-medium text-slate-900 dark:text-white truncate max-w-[250px]">
                          {article.title}
                        </div>
                      </div>
                      <Badge variant="default">{article.views} views</Badge>
                    </div>
                  ))}
                  {knowledgeMetrics.top_articles.length === 0 && (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No article views yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top FAQs by Views</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {knowledgeMetrics.top_faqs.map((faq, index) => (
                    <div key={faq.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-6">
                          {index + 1}.
                        </span>
                        <div className="font-medium text-slate-900 dark:text-white truncate max-w-[250px]">
                          {faq.question}
                        </div>
                      </div>
                      <Badge variant="default">{faq.views} views</Badge>
                    </div>
                  ))}
                  {knowledgeMetrics.top_faqs.length === 0 && (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No FAQ views yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Article Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Article Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {knowledgeMetrics.articles.published}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Published</div>
                </div>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {knowledgeMetrics.articles.draft}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Draft</div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                    {knowledgeMetrics.articles.archived}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Archived</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}