'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { format } from 'date-fns';
import type { SLAConfig, SLAConfigCreate, SLAConfigUpdate } from '@/lib/types';

export default function AdminSLAPage() {
  const [slaConfigs, setSLAConfigs] = useState<SLAConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<SLAConfigCreate>({
    name: '',
    description: '',
    response_time_minutes: 60,
    resolution_time_minutes: 240,
    is_default: false,
    is_active: true,
  });

  const fetchData = async () => {
    try {
      const data = await adminApi.listSLAConfigs();
      setSLAConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SLA configs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await adminApi.updateSLAConfig(editingId, formData);
      } else {
        await adminApi.createSLAConfig(formData);
      }
      setShowCreate(false);
      setEditingId(null);
      setFormData({ name: '', description: '', response_time_minutes: 60, resolution_time_minutes: 240, is_default: false, is_active: true });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SLA config');
    }
  };

  const handleEdit = (config: SLAConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      description: config.description || '',
      response_time_minutes: config.response_time_minutes,
      resolution_time_minutes: config.resolution_time_minutes,
      is_default: config.is_default,
      is_active: config.is_active,
    });
    setShowCreate(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this SLA configuration?')) return;
    try {
      await adminApi.deleteSLAConfig(id);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete SLA config');
    }
  };

  const handleCancel = () => {
    setShowCreate(false);
    setEditingId(null);
    setFormData({ name: '', description: '', response_time_minutes: 60, resolution_time_minutes: 240, is_default: false, is_active: true });
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
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SLA Configurations</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage Service Level Agreement settings</p>
          </div>
          <Button onClick={() => { setShowCreate(true); setEditingId(null); setFormData({ name: '', description: '', response_time_minutes: 60, resolution_time_minutes: 240, is_default: false, is_active: true }); }}>
            New SLA Config
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit SLA Config' : 'New SLA Config'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Standard Support"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Optional description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Response Time (minutes) *</label>
                    <Input
                      type="number"
                      value={formData.response_time_minutes}
                      onChange={(e) => setFormData({ ...formData, response_time_minutes: parseInt(e.target.value) })}
                      required
                      min="1"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Resolution Time (minutes) *</label>
                    <Input
                      type="number"
                      value={formData.resolution_time_minutes}
                      onChange={(e) => setFormData({ ...formData, resolution_time_minutes: parseInt(e.target.value) })}
                      required
                      min="1"
                      placeholder="240"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_default"
                      checked={formData.is_default}
                      onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="is_default" className="text-sm text-slate-700 dark:text-slate-300">Default Configuration</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="is_active" className="text-sm text-slate-700 dark:text-slate-300">Active</label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="secondary" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Description</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Response Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Resolution Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Default</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Active</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {slaConfigs.map((config) => (
                  <tr key={config.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{config.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">{config.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDuration(config.response_time_minutes)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDuration(config.resolution_time_minutes)}</td>
                    <td className="px-4 py-3">
                      {config.is_default ? (
                        <Badge variant="success">Default</Badge>
                      ) : (
                        <Badge variant="default">No</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {config.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(config)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(config.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {slaConfigs.length === 0 && (
                <tbody>
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                      No SLA configurations yet. Click "New SLA Config" to create one.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* SLA Check Button */}
      <div className="mt-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Manual SLA Check</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Check all active conversations for SLA breaches and warnings</p>
              </div>
              <Button onClick={async () => {
                try {
                  const result = await adminApi.checkAllSLA();
                  alert(result.message);
                  fetchData();
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'SLA check failed');
                }
              }}>
                Run SLA Check
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}