'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { SLAStatus } from '@/lib/types';

interface SLATimerProps {
  status: SLAStatus | null;
  compact?: boolean;
}

export function SLATimer({ status, compact = false }: SLATimerProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!status || (status.response_status === 'not_applicable' && status.resolution_status === 'not_applicable')) {
    return compact ? null : (
      <div className="text-sm text-slate-500 dark:text-slate-400">No SLA configured</div>
    );
  }

  const getStatusColor = (s: SLAStatus['response_status']) => {
    switch (s) {
      case 'breached': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'warning': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20';
      case 'met': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20';
      case 'ok': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      default: return 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50';
    }
  };

  const getStatusLabel = (s: SLAStatus['response_status']) => {
    switch (s) {
      case 'breached': return 'BREACHED';
      case 'warning': return 'WARNING';
      case 'met': return 'MET';
      case 'ok': return 'OK';
      default: return 'N/A';
    }
  };

  const formatTimeRemaining = (minutes: number | null) => {
    if (minutes === null || minutes <= 0) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {status.response_status !== 'not_applicable' && (
          <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(status.response_status)}`}>
            R: {getStatusLabel(status.response_status)}
            {status.response_remaining_minutes !== null && !status.first_response_at && (
              <span className="ml-1">{formatTimeRemaining(status.response_remaining_minutes)}</span>
            )}
          </span>
        )}
        {status.resolution_status !== 'not_applicable' && (
          <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(status.resolution_status as any)}`}>
            Res: {getStatusLabel(status.resolution_status)}
            {status.resolution_remaining_minutes !== null && !status.resolved_at && (
              <span className="ml-1">{formatTimeRemaining(status.resolution_remaining_minutes)}</span>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
      <h4 className="font-medium text-slate-900 dark:text-white">SLA Status</h4>
      
      {/* Response SLA */}
      {status.response_status !== 'not_applicable' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">First Response</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(status.response_status)}`}>
              {getStatusLabel(status.response_status)}
            </span>
          </div>
          {status.first_response_at && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Responded at {format(new Date(status.first_response_at), 'MMM d, HH:mm')}
            </p>
          )}
          {!status.first_response_at && status.response_due_at && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Due: {format(new Date(status.response_due_at), 'MMM d, HH:mm')}
              {status.response_remaining_minutes !== null && (
                <span className={`ml-2 font-mono ${status.response_status === 'warning' ? 'text-amber-600' : status.response_status === 'breached' ? 'text-red-600' : 'text-blue-600'}`}>
                  ({formatTimeRemaining(status.response_remaining_minutes)} remaining)
                </span>
              )}
            </p>
          )}
          {status.response_breached && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">Response SLA BREACHED</p>
          )}
        </div>
      )}

      {/* Resolution SLA */}
      {status.resolution_status !== 'not_applicable' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Resolution</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(status.resolution_status as any)}`}>
              {getStatusLabel(status.resolution_status)}
            </span>
          </div>
          {status.resolved_at && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Resolved at {format(new Date(status.resolved_at), 'MMM d, HH:mm')}
            </p>
          )}
          {!status.resolved_at && status.resolution_due_at && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Due: {format(new Date(status.resolution_due_at), 'MMM d, HH:mm')}
              {status.resolution_remaining_minutes !== null && (
                <span className={`ml-2 font-mono ${status.resolution_status === 'warning' ? 'text-amber-600' : status.resolution_status === 'breached' ? 'text-red-600' : 'text-blue-600'}`}>
                  ({formatTimeRemaining(status.resolution_remaining_minutes)} remaining)
                </span>
              )}
            </p>
          )}
          {status.resolution_breached && (
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">Resolution SLA BREACHED</p>
          )}
        </div>
      )}

      {status.sla_config_name && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          SLA Policy: {status.sla_config_name}
        </p>
      )}
    </div>
  );
}

import { format } from 'date-fns';