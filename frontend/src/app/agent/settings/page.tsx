'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { useAuth } from '@/context/AuthContext';
import { agentApi, authApi } from '@/lib/api';
import type { AgentWorkload } from '@/lib/types';


export default function AgentSettingsPage() {
  const { user, logout } = useAuth();
  const [workload, setWorkload] = useState<AgentWorkload | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean>(user?.agent_profile?.is_available ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await agentApi.getWorkload();
      setWorkload(data);
      setIsAvailable(data.available);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile data');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAvailability = async (next: boolean) => {
    setSaving(true);
    setError(null);
    setIsAvailable(next);
    try {
      await agentApi.setAvailability(next);
      setSavedAt(new Date().toLocaleTimeString());
      await load();
    } catch (err) {
      setIsAvailable(!next);
      setError(err instanceof Error ? err.message : 'Failed to update availability');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setPwdSuccess(res.message || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your agent profile, availability, security, and workload.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Profile Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Avatar name={user?.full_name || 'Agent'} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.full_name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
            <Badge variant="info" className="mt-1 text-[10px] capitalize">
              {user?.role}
            </Badge>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-3 text-sm dark:border-slate-800 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Approval status</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {user?.agent_profile?.is_approved ? 'Approved' : 'Pending approval'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Active conversations</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {workload ? `${workload.active} / ${workload.max}` : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Availability Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Availability</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Offline agents do not receive new automatic assignments. Existing assignments stay with you.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isAvailable}
            onClick={() => toggleAvailability(!isAvailable)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
              isAvailable ? 'bg-emerald-600' : 'bg-slate-400'
            } ${saving ? 'cursor-wait opacity-60' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                isAvailable ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Badge variant={isAvailable ? 'success' : 'default'}>{isAvailable ? 'Online' : 'Offline'}</Badge>
          {workload && (
            <span>
              Capacity remaining: {workload.capacity_remaining} of {workload.max}
            </span>
          )}
          {savedAt && <span>Last saved at {savedAt}</span>}
        </div>
      </div>

      {/* Password Change Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Security & Password</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Update your account password. Must contain at least 8 characters with a mix of letters, numbers, and symbols.
        </p>

        {pwdError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {pwdError}
          </div>
        )}

        {pwdSuccess && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
            {pwdSuccess}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Enter current password"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Re-enter new password"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" variant="primary" disabled={pwdLoading}>
              {pwdLoading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>

      {/* Session Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Session</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Sign out of this workspace on this device.
        </p>
        <Button variant="secondary" className="mt-3" onClick={logout}>
          Logout
        </Button>
      </div>
    </div>
  );
}
