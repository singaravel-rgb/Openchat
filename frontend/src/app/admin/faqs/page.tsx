'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { format } from 'date-fns';
import type { FAQ, Category } from '@/lib/types';

export default function AdminFAQsPage() {
  const [faqs, setFAQs] = useState<FAQ[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [publishedFilter, setPublishedFilter] = useState('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category_id: '',
    is_published: false,
    show_chat_action: true,
    chat_action_text: '',
    display_order: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [faqsData, categoriesData] = await Promise.all([
        adminApi.listFAQs({ published_only: publishedFilter === 'true', q: searchQuery || undefined }),
        adminApi.listCategories(true),
      ]);
      setFAQs(faqsData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        category_id: formData.category_id ? parseInt(formData.category_id) : undefined,
        display_order: parseInt(formData.display_order.toString()) || 0,
      };
      if (editingId) {
        await adminApi.updateFAQ(editingId, data);
      } else {
        await adminApi.createFAQ(data);
      }
      setShowCreate(false);
      setEditingId(null);
      setFormData({ question: '', answer: '', category_id: '', is_published: false, show_chat_action: true, chat_action_text: '', display_order: 0 });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save FAQ');
    }
  };

  const handleEdit = (faq: FAQ) => {
    setEditingId(faq.id);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category_id: faq.category_id?.toString() || '',
      is_published: faq.is_published,
      show_chat_action: faq.show_chat_action,
      chat_action_text: faq.chat_action_text || '',
      display_order: faq.display_order,
    });
    setShowCreate(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      await adminApi.deleteFAQ(id);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete FAQ');
    }
  };

  const handleReorder = async () => {
    const orderedIds = faqs.map(f => f.id);
    try {
      await adminApi.reorderFAQs(orderedIds);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder FAQs');
    }
  };

  const handleCancel = () => {
    setShowCreate(false);
    setEditingId(null);
    setFormData({ question: '', answer: '', category_id: '', is_published: false, show_chat_action: true, chat_action_text: '', display_order: 0 });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggingIndex(null);
    setDragOverIndex(null);
    e.currentTarget.classList.remove('dragging');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== draggingIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (sourceIndex !== targetIndex) {
      const newFAQs = [...faqs];
      const [removed] = newFAQs.splice(sourceIndex, 1);
      newFAQs.splice(targetIndex, 0, removed);
      setFAQs(newFAQs);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">FAQs</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage frequently asked questions</p>
          </div>
          <Button onClick={() => { setShowCreate(true); setEditingId(null); setFormData({ question: '', answer: '', category_id: '', is_published: false, show_chat_action: true, chat_action_text: '', display_order: 0 }); }}>
            New FAQ
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search FAQs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchData()}
              />
            </div>
            <select
              value={publishedFilter}
              onChange={(e) => { setPublishedFilter(e.target.value); fetchData(); }}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="true">Published Only</option>
              <option value="false">Unpublished Only</option>
            </select>
            <Button variant="secondary" onClick={handleReorder} disabled={faqs.length <= 1}>
              Save Order
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit FAQ' : 'New FAQ'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Question *</label>
                  <Input
                    value={formData.question}
                    onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                    required
                    placeholder="FAQ question"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Answer *</label>
                  <textarea
                    value={formData.answer}
                    onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={6}
                    placeholder="FAQ answer"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                    <select
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Order</label>
                    <Input
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_published}
                      onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label className="text-sm text-slate-700 dark:text-slate-300">Published</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.show_chat_action}
                      onChange={(e) => setFormData({ ...formData, show_chat_action: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label className="text-sm text-slate-700 dark:text-slate-300">Show "Chat with us" action</label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Chat Action Text</label>
                  <Input
                    value={formData.chat_action_text}
                    onChange={(e) => setFormData({ ...formData, chat_action_text: e.target.value })}
                    placeholder="e.g., Chat with us"
                  />
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
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400 w-12"></th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400 w-10">#</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Question</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Published</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Chat Action</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Views</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Updated</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {faqs.map((faq, index) => {
                  const isDragging = draggingIndex === index;
                  const isDragOver = dragOverIndex === index;
                  return (
                    <tr
                      key={faq.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`
                        hover:bg-slate-50 dark:hover:bg-slate-800/50
                        transition-colors duration-150
                        ${isDragging ? 'opacity-50 bg-blue-50 dark:bg-blue-900/20' : ''}
                        ${isDragOver && !isDragging ? 'bg-amber-50 dark:bg-amber-900/20' : ''}
                      `}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                          aria-label="Drag to reorder"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white truncate max-w-xs">{faq.question}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{faq.category?.name || 'Uncategorized'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={faq.is_published ? 'success' : 'default'} className="text-xs">
                          {faq.is_published ? 'Published' : 'Draft'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                        {faq.show_chat_action ? (faq.chat_action_text || 'Chat with us') : 'Hidden'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{faq.view_count}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{format(new Date(faq.updated_at), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(faq)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(faq.id)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  )})}
              </tbody>
            </table>
            {faqs.length === 0 && (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                No FAQs yet. Click "New FAQ" to create one.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}