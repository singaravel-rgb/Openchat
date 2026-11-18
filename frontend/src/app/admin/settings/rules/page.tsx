'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import type { SettingResponse } from '@/lib/types';

interface AssignmentRule {
  id: number;
  name: string;
  condition: string;
  action: string;
  priority: number;
  enabled: boolean;
}

export default function AssignmentRulesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, SettingResponse>>({});
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const data = await adminApi.getSettings('assignment');
      const settingsMap: Record<string, SettingResponse> = {};
      data.forEach(s => { settingsMap[s.key] = s; });
      setSettings(settingsMap);
      
      // Load rules from settings
      const rulesData = settingsMap.rules?.value;
      if (Array.isArray(rulesData)) {
        setRules(rulesData);
      }
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
      const settingsToUpdate: Record<string, any> = {
        default_method: settings.default_method?.value || 'round_robin',
        auto_assign: settings.auto_assign?.value !== false,
        max_conversations_per_agent: settings.max_conversations_per_agent?.value || 10,
        rules: rules,
      };
      await adminApi.bulkUpdateSettings('assignment', settingsToUpdate);
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

  const toggleRule = (id: number) => {
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: number) => {
    setRules(rules.filter(r => r.id !== id));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Assignment Rules</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Configure automatic conversation assignment rules</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assignment Strategy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Default Assignment Method</label>
            <select
              value={settings.default_method?.value || 'round_robin'}
              onChange={(e) => handleChange('default_method', e.target.value)}
              className="w-full max-w-md px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="round_robin">Round Robin (Even Distribution)</option>
              <option value="least_busy">Least Busy Agent</option>
              <option value="skills_based">Skills-Based Routing</option>
              <option value="load_balanced">Load Balanced</option>
            </select>
            <p className="text-sm text-slate-500 mt-1">This method is used when no specific rule matches.</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-Assign New Conversations</p>
              <p className="text-sm text-slate-500">Automatically assign incoming conversations to available agents</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.auto_assign?.value !== false}
                onChange={(e) => handleChange('auto_assign', e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Max Conversations Per Agent</p>
              <p className="text-sm text-slate-500">Limit concurrent conversations per agent</p>
            </div>
            <Input
              value={settings.max_conversations_per_agent?.value || 10}
              onChange={(e) => handleChange('max_conversations_per_agent', parseInt(e.target.value, 10))}
              type="number"
              className="w-24"
              min="1"
              max="50"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Rules (Evaluated in Order)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rules.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No rules configured. Rules are evaluated top to bottom. First match wins.</p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-4 flex-1">
                    <span className="w-8 h-8 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg font-medium">
                      {rule.priority}
                    </span>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{rule.name}</p>
                      <p className="text-sm text-slate-500">{rule.condition}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={rule.enabled ? 'success' : 'default'}>{rule.enabled ? 'Enabled' : 'Disabled'}</Badge>
                    <p className="text-sm text-slate-600 dark:text-slate-400">→ {rule.action}</p>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={rule.enabled}
                        onChange={() => toggleRule(rule.id)}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                    </label>
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-400" onClick={() => deleteRule(rule.id)}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="text-sm text-slate-500 mt-4">Rules are evaluated top to bottom. First match wins. Drag to reorder.</p>
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