'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { adminApi, authApi, tagApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import type { SettingResponse, TagItem } from '@/lib/types';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  requestNotificationPermission,
  dispatchDesktopNotification,
  type DesktopNotificationPreferences,
} from '@/lib/desktopNotifications';

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, SettingResponse>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  // Desktop Notifications
  const [notifPrefs, setNotifPrefs] = useState<DesktopNotificationPreferences>(getNotificationPreferences);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [notifTestSent, setNotifTestSent] = useState(false);

  // Configurable Conversation Tags
  const [tagsList, setTagsList] = useState<TagItem[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [tagSaving, setTagSaving] = useState(false);

  useEffect(() => {
    tagApi.list().then(setTagsList).catch(() => {});
  }, []);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setTagSaving(true);
    try {
      const created = await tagApi.create({ name: newTagName.trim(), color: newTagColor, is_active: true });
      setTagsList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create tag' });
    } finally {
      setTagSaving(false);
    }
  };

  const handleDeleteTag = async (id: number) => {
    try {
      await tagApi.delete(id);
      setTagsList((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete tag' });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const handleTogglePref = (key: keyof DesktopNotificationPreferences) => {
    const updated = saveNotificationPreferences({ [key]: !notifPrefs[key] });
    setNotifPrefs(updated);
  };

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      dispatchDesktopNotification({
        id: Date.now(),
        type: 'new_message',
        title: 'OpenChat Admin Notifications Enabled',
        message: 'You will receive Slack-style desktop notifications for incoming messages and system events.',
        userRole: 'admin',
      });
      setNotifTestSent(true);
      setTimeout(() => setNotifTestSent(false), 5000);
    }
  };

  const handleSendTestNotification = async () => {
    if (notifPermission !== 'granted') {
      await handleRequestPermission();
      return;
    }
    dispatchDesktopNotification({
      id: Date.now(),
      type: 'new_message',
      title: 'New message from John Smith',
      message: '"Hi, I need help tracking my latest order #OC-8492. Could someone assist?"',
      referenceType: 'conversation',
      referenceId: 1,
      userRole: 'admin',
    });
    setNotifTestSent(true);
    setTimeout(() => setNotifTestSent(false), 5000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPwdError('Password must be at least 8 characters long');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      if (res.access_token && typeof window !== 'undefined') {
        localStorage.setItem('access_token', res.access_token);
      }
      setPwdSuccess('Password changed successfully. Other sessions have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwdLoading(false);
    }
  };

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
      const data = await adminApi.getSettings('general');
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
      await adminApi.bulkUpdateSettings('general', settingsToUpdate);
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

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">General Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure general application settings</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Application Name</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Name"
              value={settings.app_name?.value || 'OpenChat'}
              onChange={(e) => handleChange('app_name', e.target.value)}
              placeholder="Enter application name"
            />
            <Input
              label="Support Email"
              value={settings.support_email?.value || 'support@openchat.io'}
              onChange={(e) => handleChange('support_email', e.target.value)}
              placeholder="Enter support email"
              type="email"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Localization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Default Language"
              value={settings.default_language?.value || 'en'}
              onChange={(e) => handleChange('default_language', e.target.value)}
              placeholder="Select default language"
            />
            <Input
              label="Timezone"
              value={settings.timezone?.value || 'UTC'}
              onChange={(e) => handleChange('timezone', e.target.value)}
              placeholder="Select timezone"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-slate-500">Require 2FA for all admin users</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.require_2fa?.value || false}
                  onChange={(e) => handleChange('require_2fa', e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Session Timeout</p>
                <p className="text-sm text-slate-500">Auto-logout after inactivity (minutes)</p>
              </div>
              <Input
                value={settings.session_timeout_minutes?.value || 60}
                onChange={(e) => handleChange('session_timeout_minutes', parseInt(e.target.value, 10))}
                type="number"
                className="w-24"
                min="1"
                max="1440"
              />
            </div>
          </CardContent>
        </Card>

        {/* Security & Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Security & Password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Update your account password. Must contain at least 8 characters with a mix of letters, numbers, and symbols.
            </p>
            {pwdError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
                {pwdSuccess}
              </div>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                  <Input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
                  <Input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" disabled={pwdLoading}>
                {pwdLoading ? 'Updating Password...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Desktop Notifications Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔔</span>
                  <CardTitle>Desktop Notifications</CardTitle>
                  <Badge variant={notifPermission === 'granted' ? 'success' : notifPermission === 'denied' ? 'danger' : 'default'} className="text-[10px] capitalize">
                    {notifPermission === 'granted' ? 'Enabled' : notifPermission === 'denied' ? 'Blocked' : 'Default'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Native browser desktop notifications (Windows Slack style) for real-time customer and workspace activity.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notifPermission !== 'granted' ? (
                  <Button size="sm" variant="primary" onClick={handleRequestPermission} className="text-xs">
                    Enable Notifications
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleSendTestNotification} className="text-xs">
                    {notifTestSent ? '✓ Sent Test' : 'Test Notification'}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Enable Desktop Alerts</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Show native banners on incoming events</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.enabled}
                  onChange={() => handleTogglePref('enabled')}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Alert Sound</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Play notification sound when alerts trigger</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.sound}
                  onChange={() => handleTogglePref('sound')}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">New Customer Messages</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Alert on replies from customers</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.newMessages}
                  onChange={() => handleTogglePref('newMessages')}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Assignments & Transfers</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Alert when chats are routed or assigned</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.assignments}
                  onChange={() => handleTogglePref('assignments')}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Private Notes & Mentions</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Alert on internal notes & staff @mentions</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.privateNotes}
                  onChange={() => handleTogglePref('privateNotes')}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">SLA Warnings & Deadlines</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Urgent alerts before deadline breach</p>
                </div>
                <input
                  type="checkbox"
                  checked={notifPrefs.slaBreaches}
                  onChange={() => handleTogglePref('slaBreaches')}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configurable Conversation Tags */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure the tags available to agents in the conversation workspace.
          </p>
          <form onSubmit={handleCreateTag} className="flex flex-wrap items-center gap-2">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag name (e.g. Payment, VIP)"
              className="max-w-xs"
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              aria-label="Tag color"
              className="h-9 w-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
            />
            <Button type="submit" variant="primary" size="sm" disabled={tagSaving || !newTagName.trim()}>
              {tagSaving ? 'Adding...' : 'Add Tag'}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {tagsList.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
                <button
                  type="button"
                  onClick={() => handleDeleteTag(tag.id)}
                  aria-label={`Remove ${tag.name}`}
                  className="ml-1 text-slate-400 hover:text-red-500 font-bold"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save All Changes'}
        </Button>
      </div>
    </div>
  );
}