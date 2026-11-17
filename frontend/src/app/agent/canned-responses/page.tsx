'use client';


import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { cannedResponseApi } from '@/lib/api';
import type { CannedResponse } from '@/lib/types';


const emptyForm = {
  title: '',
  content: '',
  category: 'general',
  shortcut: '',
};

export default function AgentCannedResponsesPage() {
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await cannedResponseApi.list({ is_active: true });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load canned responses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (canned: CannedResponse) => {
    setEditingId(canned.id);
    setForm({
      title: canned.title,
      content: canned.content,
      category: canned.category || 'general',
      shortcut: canned.shortcut || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category.trim() || 'general',
        shortcut: form.shortcut.trim() || null,
        is_active: true,
      };
      if (editingId) {
        await cannedResponseApi.update(editingId, payload);
      } else {
        await cannedResponseApi.create(payload);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save canned response');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await cannedResponseApi.delete(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete canned response');
    }
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      setError('Clipboard is unavailable in this browser');
    }
  };

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Canned Responses</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Reusable replies available to every agent in the workspace.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="flex-1 sm:w-64">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search responses..."
                aria-label="Search canned responses"
              />
            </div>
            <Button onClick={openCreate}>New response</Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {showForm && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit response' : 'New response'}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="canned-title">
                  Title
                </label>
                <Input
                  id="canned-title"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Greeting"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="canned-category">
                  Category
                </label>
                <Input
                  id="canned-category"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="general"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="canned-shortcut">
                  Shortcut (optional)
                </label>
                <Input
                  id="canned-shortcut"
                  value={form.shortcut || ''}
                  onChange={(e) => setForm((p) => ({ ...p, shortcut: e.target.value }))}
                  placeholder="/greeting"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="canned-content">
                  Content
                </label>
                <textarea
                  id="canned-content"
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Hi {{customer_name}}, thanks for reaching out..."
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No canned responses yet. Create your first one.
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((canned) => (
            <div
              key={canned.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{canned.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-[10px]">
                      {canned.category}
                    </Badge>
                    {canned.shortcut && (
                      <Badge variant="info" className="text-[10px]">
                        {canned.shortcut}
                      </Badge>
                    )}
                    <Badge variant="success" className="text-[10px]">
                      used {canned.usage_count ?? 0}×
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
                {canned.content}
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(canned.content)}>
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(canned)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(canned.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    
  );
}