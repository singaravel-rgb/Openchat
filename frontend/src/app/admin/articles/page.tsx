'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { format } from 'date-fns';
import type { Article, Category } from '@/lib/types';

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    category_id: '',
    status: 'draft',
    visibility: 'public',
  });
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [articlesData, categoriesData] = await Promise.all([
        adminApi.listArticles({ status: statusFilter || undefined, q: searchQuery || undefined }),
        adminApi.listCategories(true),
      ]);
      setArticles(articlesData);
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
      };
      if (editingId) {
        await adminApi.updateArticle(editingId, data);
      } else {
        await adminApi.createArticle(data);
      }
      setShowCreate(false);
      setEditingId(null);
      setFormData({ title: '', slug: '', content: '', excerpt: '', category_id: '', status: 'draft', visibility: 'public' });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save article');
    }
  };

  const handleEdit = (article: Article) => {
    setEditingId(article.id);
    setActiveTab('edit');
    setFormData({
      title: article.title,
      slug: article.slug,
      content: article.content,
      excerpt: article.excerpt || '',
      category_id: article.category_id?.toString() || '',
      status: article.status,
      visibility: article.visibility,
    });
    setShowCreate(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this article?')) return;
    try {
      await adminApi.deleteArticle(id);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete article');
    }
  };

  const handleCancel = () => {
    setShowCreate(false);
    setEditingId(null);
    setActiveTab('edit');
    setFormData({ title: '', slug: '', content: '', excerpt: '', category_id: '', status: 'draft', visibility: 'public' });
  };

  const handleReorder = async () => {
    const orderedIds = articles.map(a => a.id);
    try {
      await adminApi.reorderArticles(orderedIds);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder articles');
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
      const newArticles = [...articles];
      const [removed] = newArticles.splice(sourceIndex, 1);
      newArticles.splice(targetIndex, 0, removed);
      setArticles(newArticles);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published': return 'success';
      case 'archived': return 'default';
      default: return 'warning';
    }
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Articles</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage knowledge base articles</p>
          </div>
          <Button onClick={() => { setShowCreate(true); setEditingId(null); setActiveTab('edit'); setFormData({ title: '', slug: '', content: '', excerpt: '', category_id: '', status: 'draft', visibility: 'public' }); }}>
            New Article
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
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchData()}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); fetchData(); }}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit Article' : 'New Article'}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Tab Navigation */}
              <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'edit'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'preview'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Preview
                </button>
              </div>

              {activeTab === 'edit' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title *</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                      placeholder="Article title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Slug *</label>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      required
                      placeholder="article-slug"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Excerpt</label>
                    <textarea
                      value={formData.excerpt}
                      onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Brief summary for listings"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Content *</label>
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      rows={15}
                      placeholder="Article content (Markdown supported)"
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
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Visibility</label>
                      <select
                        value={formData.visibility}
                        onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="public">Public</option>
                        <option value="agents_only">Agents Only</option>
                        <option value="internal">Internal</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={handleCancel}>
                      Cancel
                    </Button>
                    <Button type="submit">{editingId ? 'Update' : 'Create'}</Button>
                  </div>
                </form>
              )}

              {activeTab === 'preview' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Preview</label>
                    <div className="prose prose-slate dark:prose-invert max-w-none p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 min-h-[400px]">
                      {formData.content ? (
                        <ReactMarkdown>{formData.content}</ReactMarkdown>
                      ) : (
                        <p className="text-slate-500 dark:text-slate-400 italic">No content to preview</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Title</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Slug</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Visibility</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Views</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Updated</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {articles.map((article, index) => {
                  const isDragging = draggingIndex === index;
                  const isDragOver = dragOverIndex === index;
                  return (
                    <tr
                      key={article.id}
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
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white truncate max-w-xs">{article.title}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">{article.slug}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{article.category?.name || 'Uncategorized'}</td>
                      <td className="px-4 py-3"><Badge variant={getStatusBadge(article.status)}>{article.status}</Badge></td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{article.visibility}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{article.view_count}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{format(new Date(article.updated_at), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(article)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(article.id)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )})}
              </tbody>
            </table>
            {articles.length === 0 && (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                No articles yet. Click "New Article" to create one.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}