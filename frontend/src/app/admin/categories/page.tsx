'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { format } from 'date-fns';
import type { Category } from '@/lib/types';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '', description: '', parent_id: undefined as number | undefined, display_order: 0, is_active: true });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await adminApi.listCategories(true);
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        parent_id: formData.parent_id ? parseInt(formData.parent_id.toString()) : undefined,
      };
      if (editingId) {
        await adminApi.updateCategory(editingId, data);
      } else {
        await adminApi.createCategory(data);
      }
      setShowCreate(false);
      setEditingId(null);
      setFormData({ name: '', slug: '', description: '', parent_id: undefined, display_order: 0, is_active: true });
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parent_id: category.parent_id ?? undefined,
      display_order: category.display_order,
      is_active: category.is_active,
    });
    setShowCreate(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await adminApi.deleteCategory(id);
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleReorder = async () => {
    const orderedIds = categories.map(c => c.id);
    try {
      await adminApi.reorderCategories(orderedIds);
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder categories');
    }
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
      const newCategories = [...categories];
      const [removed] = newCategories.splice(sourceIndex, 1);
      newCategories.splice(targetIndex, 0, removed);
      setCategories(newCategories);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleCancel = () => {
    setShowCreate(false);
    setEditingId(null);
    setFormData({ name: '', slug: '', description: '', parent_id: undefined, display_order: 0, is_active: true });
  };

  const rootCategories = categories.filter(c => !c.parent_id);
  const getChildren = (parentId: number): Category[] => categories.filter(c => c.parent_id === parentId);

  const renderCategoryTree = (cats: Category[], level = 0): React.ReactNode => (
    <>
      {cats.map((cat, index) => {
        const isDragging = draggingIndex === index && level === 0;
        const isDragOver = dragOverIndex === index && level === 0;
        return (
          <tr
            key={cat.id}
            draggable={level === 0}
            onDragStart={(e) => level === 0 && handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => level === 0 && handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => level === 0 && handleDrop(e, index)}
            className={`
              transition-colors duration-150
              ${isDragging ? 'opacity-50 bg-blue-50 dark:bg-blue-900/20' : ''}
              ${isDragOver && !isDragging ? 'bg-amber-50 dark:bg-amber-900/20' : ''}
            `}
            style={{ backgroundColor: level > 0 ? 'rgba(0,0,0,0.02)' : undefined }}
          >
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                {level === 0 && (
                  <button
                    type="button"
                    className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                    aria-label="Drag to reorder"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </button>
                )}
                <div style={{ paddingLeft: `${level * 20}px` }} className="flex items-center gap-2">
                  {level > 0 && <span className="text-slate-400">└─</span>}
                  <span className="font-medium text-slate-900 dark:text-white">{cat.name}</span>
                  <Badge variant={cat.is_active ? 'success' : 'default'} className="text-xs">{cat.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1" style={{ paddingLeft: `${level * 20}px` }}>{cat.description || 'No description'}</div>
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">{cat.slug}</td>
            <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{cat.display_order}</td>
            <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{format(new Date(cat.created_at), 'MMM d, yyyy')}</td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(cat.id)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        );
      })}
      {cats.map((cat) => renderCategoryTree(getChildren(cat.id), level + 1))}
    </>
  );

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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Categories</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage knowledge base categories</p>
          </div>
          <Button onClick={() => { setShowCreate(true); setEditingId(null); setFormData({ name: '', slug: '', description: '', parent_id: undefined, display_order: 0, is_active: true }); }}>
            New Category
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit Category' : 'New Category'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Category name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Slug *</label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    required
                    placeholder="category-slug"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Category description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Parent Category</label>
                  <select
                    value={formData.parent_id?.toString() || ''}
                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None (Root Category)</option>
                    {rootCategories.map((cat) => (
                      <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Order</label>
                    <Input
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
                    </label>
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
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400 w-12"></th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Slug</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Order</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Created</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {renderCategoryTree(rootCategories)}
              </tbody>
            </table>
            {categories.length === 0 && (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                No categories yet. Click "New Category" to create one.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}