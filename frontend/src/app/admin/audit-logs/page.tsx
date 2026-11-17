'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import type { AuditLogItem } from '@/lib/types';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(50);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getAuditLogs({ limit });
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [limit]);

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      (log.resource_type && log.resource_type.toLowerCase().includes(term)) ||
      (log.details && log.details.toLowerCase().includes(term)) ||
      (log.ip_address && log.ip_address.includes(term))
    );
  });

  const getActionBadgeVariant = (action: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' => {
    if (action.startsWith('post:') || action.includes('create')) return 'success';
    if (action.startsWith('patch:') || action.startsWith('put:') || action.includes('update')) return 'primary';
    if (action.startsWith('delete:') || action.includes('delete')) return 'danger';
    return 'default';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Logs</h1>
          <p className="text-slate-500 dark:text-slate-400">Track system activities and administrative changes</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchLogs} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Activity Trail</CardTitle>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search action, resource, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Records per page"
              className="px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              No audit logs found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="pb-3 font-medium">Timestamp</th>
                    <th className="pb-3 font-medium">Action</th>
                    <th className="pb-3 font-medium">Resource</th>
                    <th className="pb-3 font-medium">Details</th>
                    <th className="pb-3 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-3">
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="py-3 text-slate-900 dark:text-white font-medium">
                        {log.resource_type || '—'}
                        {log.resource_id ? ` #${log.resource_id}` : ''}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 max-w-md truncate font-mono text-xs">
                        {log.details || '—'}
                      </td>
                      <td className="py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">
                        {log.ip_address || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
