'use client';


import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { notificationApi } from '@/lib/api';
import type { Notification, NotificationPreferences } from '@/lib/types';


const priorityVariant: Record<string, 'danger' | 'warning' | 'success' | 'default' | 'info'> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'info',
  low: 'default',
};

function formatDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function AgentNotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, prefData] = await Promise.all([
        notificationApi.list({ limit: 50 }),
        notificationApi.getPreferences().catch(() => null),
      ]);
      setItems(data.notifications);
      setUnreadCount(data.unread_count);
      if (prefData) setPrefs(prefData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleTogglePref = async (key: keyof NotificationPreferences) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await notificationApi.updatePreferences(next);
    } catch {
      setPrefs(prefs);
    } finally {
      setSavingPrefs(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const handleRead = async (notification: Notification) => {
    setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await notificationApi.markAsRead(notification.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as read');
    }
    if (notification.reference_type === 'conversation' && notification.reference_id) {
      router.push(`/agent/conversations/${notification.reference_id}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all as read');
    }
  };

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Notifications</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowPrefs((v) => !v)}>
              {showPrefs ? 'Hide Preferences' : 'Preferences'}
            </Button>
            <Button variant="outline" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
              Mark all as read
            </Button>
          </div>
        </div>

        {showPrefs && prefs && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notification Preferences</h2>
              {savingPrefs && <span className="text-xs text-slate-400">Saving...</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              {(
                [
                  ['in_app_assigned', 'In-App: Assigned'],
                  ['in_app_new_message', 'In-App: Customer Reply'],
                  ['in_app_reassigned', 'In-App: Reassigned'],
                  ['in_app_pending', 'In-App: Pending'],
                  ['in_app_sla_warning', 'In-App: SLA Warning'],
                  ['in_app_sla_breach', 'In-App: SLA Breach'],
                  ['email_assigned', 'Email: Assigned'],
                  ['email_new_message', 'Email: Customer Reply'],
                  ['email_reassigned', 'Email: Reassigned'],
                  ['email_pending', 'Email: Pending'],
                  ['email_sla_warning', 'Email: SLA Warning'],
                  ['email_sla_breach', 'Email: SLA Breach'],
                ] as Array<[keyof NotificationPreferences, string]>
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded border border-slate-100 dark:border-slate-800 px-3 py-2 cursor-pointer">
                  <span className="text-slate-700 dark:text-slate-300">{label}</span>
                  <input
                    type="checkbox"
                    checked={prefs[key]}
                    onChange={() => handleTogglePref(key)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No notifications yet.
          </div>
        )}

        <div className="space-y-2">
          {items.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleRead(notification)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                notification.is_read
                  ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
              }`}
            >
              <div
                className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  notification.is_read ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-600'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{notification.title}</p>
                  <Badge variant={priorityVariant[notification.priority] || 'default'} className="text-[10px]">
                    {notification.priority}
                  </Badge>
                  {notification.reference_type && (
                    <Badge variant="default" className="text-[10px] capitalize">
                      {notification.reference_type.replace('_', ' ')}
                    </Badge>
                  )}
                  {notification.email_status && notification.email_status !== 'not_applicable' && (
                    <Badge variant={notification.email_sent ? 'success' : 'default'} className="text-[10px]">
                      Email: {notification.email_status.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
                {notification.message && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{notification.message}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {formatDate(notification.created_at)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    
  );
}