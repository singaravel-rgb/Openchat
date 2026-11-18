'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import type { SettingResponse } from '@/lib/types';

interface NotificationItem {
  key: string;
  label: string;
  desc: string;
  type?: 'checkbox' | 'select' | 'range';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export default function NotificationSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, SettingResponse>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'in-app' | 'email' | 'push' | 'sound'>('in-app');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      router.push('/agent');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await adminApi.getSettings('notifications');
      const settingsMap: Record<string, SettingResponse> = {};
      data.forEach(s => { settingsMap[s.key] = s; });
      setSettings(settingsMap);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load settings' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const settingsToUpdate: Record<string, any> = {};
      Object.entries(settings).forEach(([key, setting]) => {
        settingsToUpdate[key] = setting.value;
      });
      await adminApi.bulkUpdateSettings('notifications', settingsToUpdate);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      loadSettings();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: { ...prev[key], value } }));
  };

  const inAppNotifications: NotificationItem[] = [
    { key: 'in_app_new_conversation', label: 'New Conversation', desc: 'When a new conversation is created' },
    { key: 'in_app_conversation_assigned', label: 'Conversation Assigned', desc: 'When a conversation is assigned to you' },
    { key: 'in_app_new_message', label: 'New Message', desc: 'When a new message arrives in your conversations' },
    { key: 'in_app_conversation_resolved', label: 'Conversation Resolved', desc: 'When a conversation you follow is resolved' },
    { key: 'in_app_mentions', label: 'Mentions', desc: 'When you are mentioned in an internal note' },
    { key: 'in_app_sla_warning', label: 'SLA Warning', desc: 'When a conversation approaches SLA breach' },
    { key: 'in_app_sla_breach', label: 'SLA Breach', desc: 'When a conversation breaches SLA' },
  ];

  const emailNotifications: NotificationItem[] = [
    { key: 'email_new_conversation', label: 'New Conversation', desc: 'Email when a new conversation is created' },
    { key: 'email_conversation_assigned', label: 'Conversation Assigned', desc: 'Email when a conversation is assigned to you' },
    { key: 'email_daily_summary', label: 'Daily Summary', desc: 'Daily digest of conversations and metrics' },
    { key: 'email_weekly_report', label: 'Weekly Report', desc: 'Weekly performance report' },
    { key: 'email_sla_breach', label: 'SLA Breach Alerts', desc: 'Immediate email when SLA is breached' },
  ];

  const pushNotifications: NotificationItem[] = [
    { key: 'push_enabled', label: 'Enable Push Notifications', desc: 'Allow browser push notifications' },
    { key: 'push_new_messages', label: 'New Messages', desc: 'Push for new messages in active conversations' },
    { key: 'push_assignment_changes', label: 'Assignment Changes', desc: 'Push when conversations are assigned/reassigned' },
    { key: 'push_sla_alerts', label: 'SLA Alerts', desc: 'Push for SLA warnings and breaches' },
  ];

  const soundNotifications: NotificationItem[] = [
    { key: 'sound_enabled', label: 'Enable Sound Notifications', desc: 'Play sound for new messages and events' },
    { key: 'sound_type', label: 'Notification Sound', type: 'select', options: [
      { value: 'default', label: 'Default (OpenChat)' },
      { value: 'gentle', label: 'Gentle' },
      { value: 'alert', label: 'Alert' },
      { value: 'none', label: 'None' },
    ], desc: 'Choose notification sound' },
    { key: 'sound_volume', label: 'Volume', type: 'range', min: 0, max: 100, desc: 'Notification volume' },
  ];

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Notification Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure notification preferences for the workspace</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-4 -mb-px" aria-label="Notification settings tabs">
          <button onClick={() => setActiveTab('in-app')} className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'in-app' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>In-App</button>
          <button onClick={() => setActiveTab('email')} className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'email' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Email</button>
          <button onClick={() => setActiveTab('push')} className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'push' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Push</button>
          <button onClick={() => setActiveTab('sound')} className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'sound' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Sound</button>
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{activeTab === 'in-app' ? 'In-App Notifications' : activeTab === 'email' ? 'Email Notifications' : activeTab === 'push' ? 'Push Notifications (Browser)' : 'Sound Notifications'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {(activeTab === 'in-app' ? inAppNotifications : activeTab === 'email' ? emailNotifications : activeTab === 'push' ? pushNotifications : soundNotifications).map((item) => {
              const setting = settings[item.key];
              if (item.type === 'select') {
                return (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                    <select
                      value={setting?.value || item.options?.[0]?.value || ''}
                      onChange={(e) => handleChange(item.key, e.target.value)}
                      className="w-full max-w-md px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {item.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                );
              }
              if (item.type === 'range') {
                return (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.desc}</p>
                      </div>
                      <span className="text-sm text-slate-600 dark:text-slate-400 w-10 text-right">{setting?.value || 50}</span>
                    </div>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      value={setting?.value || 50}
                      onChange={(e) => handleChange(item.key, parseInt(e.target.value, 10))}
                      className="w-full max-w-md h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                );
              }
              if (item.key === 'notification_email') {
                return (
                  <div key={item.key} className="border-t border-slate-200 dark:border-slate-800 pt-4">
                    <Input
                      label={item.label}
                      value={setting?.value || 'notifications@openchat.io'}
                      onChange={(e) => handleChange(item.key, e.target.value)}
                      placeholder="Email address for notifications"
                      type="email"
                    />
                  </div>
                );
              }
              return (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                    <p className="text-sm text-slate-500">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={setting?.value !== false}
                      onChange={(e) => handleChange(item.key, e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              );
            })}
          </div>
          {activeTab !== 'sound' && <Button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : `Save ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Notifications`}</Button>}
          {activeTab === 'sound' && (
            <>
              <Button variant="outline" className="mt-2" onClick={() => { if ('Notification' in window) Notification.requestPermission(); }}>Request Push Permission</Button>
              <Button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Sound Settings'}</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}