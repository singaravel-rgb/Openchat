'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type { ConversationListItem, Message, CannedResponse, Attachment, ConversationCustomFieldValue } from '@/lib/types';
import { conversationApi, agentApi, adminApi, cannedResponseApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const QUEUE_OPTIONS = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned to Me' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'resolved', label: 'Resolved' },
] as const;

type QueueValue = 'inbox' | 'pending' | 'assigned' | 'unassigned' | 'resolved';

interface ThreePanelWorkspaceProps {
  userRole: 'customer' | 'agent' | 'admin';
  userId: number;
}

// Admin filter types
interface AdminFilters {
  status: string;
  agent_id: string;
  customer_id: string;
  q: string;
}

const cleanDemoPrefix = (content: string): string => {
  if (content.startsWith('[DEMO AI]')) {
    return content.replace('[DEMO AI]', '').trim();
  }
  return content;
};

const senderInfo = (message: Message) => {
  switch (message.sender_type) {
    case 'customer': return { name: 'Customer', color: 'bg-slate-500', align: 'right' as const };
    case 'agent': return { name: 'Agent', color: 'bg-indigo-500', align: 'left' as const };
    case 'ai': return { name: 'AI Assistant', color: 'bg-purple-500', align: 'left' as const };
    case 'system': return { name: 'System', color: 'bg-orange-500', align: 'left' as const };
    default: return { name: 'Unknown', color: 'bg-slate-500', align: 'left' as const };
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'resolved': case 'closed': return 'success';
    case 'pending': return 'warning';
    case 'assigned': return 'primary';
    case 'ai_handling': return 'info';
    default: return 'default';
  }
};

const getPriorityBadgeVariant = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'danger';
    case 'high': return 'warning';
    case 'normal': return 'primary';
    case 'low': return 'info';
    default: return 'default';
  }
};

const formatTimestamp = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return format(date, 'MMM d, yyyy');
  } catch {
    return '';
  }
};

const formatFullTimestamp = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return format(date, 'HH:mm:ss');
    if (diffDays < 7) return format(date, 'EEE HH:mm');
    return format(date, 'MMM d, yyyy HH:mm');
  } catch {
    return '';
  }
};

export default function ThreePanelWorkspace({ userRole, userId }: ThreePanelWorkspaceProps) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  // Layout state
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);

  // Data state
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [customFields, setCustomFields] = useState<ConversationCustomFieldValue[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationListItem | null>(null);
  const [queue, setQueue] = useState<QueueValue>('inbox');
  const [searchTerm, setSearchTerm] = useState('');
  // Admin advanced filters
  const [adminFilters, setAdminFilters] = useState<AdminFilters>({
    status: '',
    agent_id: '',
    customer_id: '',
    q: '',
  });
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignAgentId, setAssignAgentId] = useState<string>('');
  const [assignNote, setAssignNote] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveDetails, setResolveDetails] = useState('');
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [newPriority, setNewPriority] = useState<string>('normal');
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [agents, setAgents] = useState<Array<{ id: number; full_name: string; email: string }>>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'subject'>('newest');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Determine current queue from URL
  const currentQueueFromUrl = useMemo(() => {
    if (pathname === '/agent' || pathname === '/agent/inbox') return 'inbox';
    if (pathname === '/agent/pending') return 'pending';
    if (pathname === '/agent/assigned') return 'assigned';
    if (pathname === '/agent/unassigned') return 'unassigned';
    if (pathname === '/agent/resolved') return 'resolved';
    return 'inbox';
  }, [pathname]);

  // Sync queue with URL
  useEffect(() => {
    if (queue !== currentQueueFromUrl) {
      setQueue(currentQueueFromUrl);
    }
  }, [currentQueueFromUrl, queue]);

  // Load agents
  const loadAgents = useCallback(async () => {
    try {
      const data = await agentApi.listAgents();
      setAgents(data);
    } catch {
      // Silent fail
    }
  }, []);

  // Load conversations for current queue
  const loadConversations = useCallback(async (isRetry = false) => {
    if (isRetry) {
      setRetryCount(c => c + 1);
    } else {
      setIsLoading(true);
      setError(null);
      setRetryCount(0);
    }
    try {
      let data: ConversationListItem[];
      if (userRole === 'admin') {
        const filters = {
          status: adminFilters.status || undefined,
          agent_id: adminFilters.agent_id ? parseInt(adminFilters.agent_id, 10) : undefined,
          customer_id: adminFilters.customer_id ? parseInt(adminFilters.customer_id, 10) : undefined,
          q: adminFilters.q || undefined,
        };
        data = await adminApi.listConversations(filters);
      } else if (userRole === 'agent') {
        data = await agentApi.listConversations(queue, undefined, searchTerm);
      } else {
        data = await conversationApi.list();
      }
      setConversations(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(errorMessage);
      console.error('[ThreePanelWorkspace] Failed to load conversations:', err);
    } finally {
      if (!isRetry) {
        setIsLoading(false);
      }
    }
  }, [userRole, queue, searchTerm, adminFilters]);

  // Load single conversation detail
  const loadConversation = useCallback(async (id: number) => {
    setIsLoadingConversation(true);
    setError(null);
    try {
      let detail;
      if (userRole === 'admin') {
        detail = await adminApi.getConversation(id);
      } else if (userRole === 'agent') {
        detail = await agentApi.getConversation(id);
      } else {
        detail = await conversationApi.get(id);
      }
      const conv = conversations.find(c => c.id === id) || null;
      setSelectedConversation(conv);
      setMessages(detail.messages || []);
      setAttachments(detail.attachments || []);
      setCustomFields(detail.custom_fields || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
      setError(errorMessage);
      console.error('[ThreePanelWorkspace] Failed to load conversation:', err);
    } finally {
      setIsLoadingConversation(false);
    }
  }, [userRole, conversations]);

  // Load canned responses
  const loadCannedResponses = useCallback(async () => {
    try {
      const data = await cannedResponseApi.list({ is_active: true });
      setCannedResponses(data);
    } catch {
      // Silent fail
    }
  }, []);

  // Initial loads
  useEffect(() => {
    loadConversations();
    loadCannedResponses();
    loadAgents();
  }, [loadConversations, loadCannedResponses, loadAgents]);

  // Load conversation when selected
  useEffect(() => {
    if (selectedConversation) {
      loadConversation(selectedConversation.id);
    }
  }, [selectedConversation, loadConversation]);

  // Handle initial conversation from URL
  useEffect(() => {
    const convId = params.id ? parseInt(Array.isArray(params.id) ? params.id[0] : params.id, 10) : null;
    if (convId && !selectedConversation) {
      loadConversation(convId);
    }
  }, [params.id, selectedConversation, loadConversation]);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSelectConversation = useCallback((conv: ConversationListItem) => {
    setSelectedConversation(conv);
    // Update URL
    const basePath = userRole === 'admin' ? '/admin' : '/agent';
    router.push(`${basePath}/conversations/${conv.id}`);
  }, [router, userRole]);

  const handleQueueChange = useCallback((newQueue: QueueValue) => {
    setQueue(newQueue);
    setSelectedConversation(null);
    setMessages([]);
    setAttachments([]);
    setCustomFields([]);
    // Update URL
    const queuePaths: Record<QueueValue, string> = {
      inbox: '/agent',
      pending: '/agent/pending',
      assigned: '/agent/assigned',
      unassigned: '/agent/unassigned',
      resolved: '/agent/resolved',
    };
    router.push(queuePaths[newQueue]);
  }, [router]);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !selectedConversation) return;
    setIsSending(true);
    try {
      const clientId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const api = userRole === 'admin' ? adminApi : agentApi;
      const newMsg = await api.sendMessage(selectedConversation.id, {
        content: messageInput,
        is_internal: isInternal,
        client_message_id: clientId,
      });
      setMessages(prev => [...prev, newMsg]);
      setMessageInput('');
      setIsInternal(false);
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [messageInput, selectedConversation, isInternal, userRole, loadConversation, loadConversations]);

  const handleAssign = useCallback(async () => {
    if (!selectedConversation) return;
    try {
      const aid = assignAgentId === '' ? null : parseInt(assignAgentId, 10);
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.assignConversation(selectedConversation.id, aid, assignNote || undefined);
      setShowAssignModal(false);
      setAssignAgentId('');
      setAssignNote('');
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign conversation');
    }
  }, [selectedConversation, assignAgentId, assignNote, userRole, loadConversation, loadConversations]);

  const handleResolve = useCallback(async () => {
    if (!selectedConversation) return;
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.resolveConversation(selectedConversation.id, resolveDetails || undefined);
      setShowResolveModal(false);
      setResolveDetails('');
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conversation');
    }
  }, [selectedConversation, resolveDetails, userRole, loadConversation, loadConversations]);

  const handleReopen = useCallback(async () => {
    if (!selectedConversation) return;
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.reopenConversation(selectedConversation.id);
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen conversation');
    }
  }, [selectedConversation, userRole, loadConversation, loadConversations]);

  const handlePriorityChange = useCallback(async () => {
    if (!selectedConversation) return;
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.updateConversation(selectedConversation.id, { priority: newPriority });
      setShowPriorityModal(false);
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change priority');
    }
  }, [selectedConversation, newPriority, userRole, loadConversation, loadConversations]);

  const handleTagModalClose = useCallback(() => {
    setShowTagModal(false);
    setNewTag('');
  }, []);

  const handleTagAdd = useCallback(async () => {
    if (!newTag.trim() || !selectedConversation) return;
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.updateConversation(selectedConversation.id, {
        tags: [...(selectedConversation.tags || []), newTag.trim()],
      });
      await loadConversation(selectedConversation.id);
      await loadConversations();
      handleTagModalClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tag');
    }
  }, [selectedConversation, newTag, userRole, loadConversation, loadConversations]);

  const handleTagRemove = useCallback(async (tag: string) => {
    if (!selectedConversation) return;
    const currentTags = selectedConversation.tags || [];
    const newTags = currentTags.filter((t) => t !== tag);
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.updateConversation(selectedConversation.id, { tags: newTags });
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
    }
  }, [selectedConversation, userRole, loadConversation, loadConversations]);

  const handleTake = useCallback(async () => {
    if (!selectedConversation) return;
    try {
      await agentApi.takeConversation(selectedConversation.id);
      await loadConversation(selectedConversation.id);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to take conversation');
    }
  }, [selectedConversation, loadConversation, loadConversations]);

  const handleRetry = useCallback(() => {
    loadConversations(true);
  }, [loadConversations]);

  const filteredConversations = useMemo(() => {
    const searchQuery = userRole === 'admin' ? adminFilters.q : searchTerm;
    const filtered = conversations.filter((c) =>
      (c.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.customer_email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    const sorted = [...filtered];
    const timeOf = (c: ConversationListItem) => new Date(c.last_message_at || c.updated_at).getTime();
    sorted.sort((a, b) => {
      if (sortBy === 'subject') {
        return (a.subject || '').localeCompare(b.subject || '');
      }
      if (sortBy === 'oldest') {
        return timeOf(a) - timeOf(b);
      }
      return timeOf(b) - timeOf(a);
    });
    return sorted;
  }, [conversations, searchTerm, adminFilters.q, userRole, sortBy]);

  // Layout dimensions
  const leftWidth = leftPanelCollapsed ? 64 : 360;
  const rightWidth = rightPanelOpen ? 380 : 0;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Global error banner */}
      {error && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2 flex items-center justify-between animate-slide-down">
          <span className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRetry} disabled={retryCount > 3}>
              {retryCount > 0 ? `Retry (${retryCount}/3)` : 'Retry'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>✕</Button>
          </div>
        </div>
      )}

      {/* Left Panel: Conversation List */}
      <aside
        className={`flex flex-col transition-all duration-300 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-hidden ${
          leftPanelCollapsed ? 'w-16' : 'w-[360px]'
        }`}
        style={{ minWidth: leftPanelCollapsed ? 64 : 360, maxWidth: leftPanelCollapsed ? 64 : 360 }}
        aria-label="Conversation list"
      >
        {/* Panel Header */}
        <div className="flex flex-shrink-0 p-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between w-full min-w-0">
            {!leftPanelCollapsed && (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{filteredConversations.length} Conversations</h2>
                <Badge variant={queue === 'inbox' ? 'primary' : queue === 'pending' ? 'warning' : queue === 'assigned' ? 'info' : queue === 'unassigned' ? 'danger' : 'success'} className="text-xs flex-shrink-0">
                  {QUEUE_OPTIONS.find(q => q.value === queue)?.label}
                </Badge>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
              aria-label={leftPanelCollapsed ? 'Expand conversation list' : 'Collapse conversation list'}
              className="flex-shrink-0 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={leftPanelCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
              </svg>
            </Button>
          </div>

          {!leftPanelCollapsed && (
            <div className="mt-3 space-y-2">
              {userRole === 'admin' ? (
                // Admin advanced filters
                <div className="space-y-2">
                  <div className="grid gap-2 grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select
                        value={adminFilters.status}
                        onChange={(e) => setAdminFilters(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full text-sm px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All Statuses</option>
                        <option value="ai_handling">AI Handling</option>
                        <option value="pending">Pending</option>
                        <option value="assigned">Assigned</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Agent ID</label>
                      <Input
                        value={adminFilters.agent_id}
                        onChange={(e) => setAdminFilters(prev => ({ ...prev, agent_id: e.target.value }))}
                        placeholder="Agent ID"
                        className="text-sm px-2 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Customer ID</label>
                      <Input
                        value={adminFilters.customer_id}
                        onChange={(e) => setAdminFilters(prev => ({ ...prev, customer_id: e.target.value }))}
                        placeholder="Customer ID"
                        className="text-sm px-2 py-1.5"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" size="sm" onClick={() => setAdminFilters({ status: '', agent_id: '', customer_id: '', q: '' })} className="w-full">
                        Clear
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Search conversations..."
                    value={adminFilters.q}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, q: e.target.value }))}
                    className="text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Search conversations"
                  />
                </div>
              ) : (
                // Agent queue selector and search
                <>
                  <select
                    value={queue}
                    onChange={(e) => handleQueueChange(e.target.value as QueueValue)}
                    className="w-full text-sm px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Select queue"
                  >
                    {QUEUE_OPTIONS.map((q) => (
                      <option key={q.value} value={q.value}>{q.label}</option>
                    ))}
                  </select>
                  <Input
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Search conversations"
                  />
                </>
              )}
              <div className="flex flex-wrap gap-1 pt-1">
                {(['newest', 'oldest', 'subject'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSortBy(opt)}
                    className={`rounded border px-2 py-1 text-xs font-medium capitalize transition-colors ${
                      sortBy === opt
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                    aria-pressed={sortBy === opt}
                    aria-label={`Sort by ${opt}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1" ref={conversationListRef}>
          {isLoading && conversations.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500 dark:text-slate-400 text-sm px-4 text-center">
              <svg className="w-10 h-10 mb-2 text-slate-300 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>{(userRole === 'admin' ? adminFilters.q : searchTerm) ? 'No conversations match your search' : 'No conversations found'}</p>
              {(userRole === 'admin' ? adminFilters.q : searchTerm) && (
                <Button variant="ghost" size="sm" onClick={() => userRole === 'admin' ? setAdminFilters({ status: '', agent_id: '', customer_id: '', q: '' }) : setSearchTerm('')} className="mt-2">
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              const hasUnread = conv.unread_count > 0;
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full px-3 py-3 text-left rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 shadow-sm'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                  }`}
                  aria-selected={isSelected}
                  aria-label={conv.subject || 'No Subject'}
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={conv.customer_name || 'Unknown'}
                      size="md"
                      className="flex-shrink-0 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                    />
{!leftPanelCollapsed && (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className={`text-sm font-medium truncate ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                {conv.subject || 'No Subject'}
                              </span>
                              {hasUnread && (
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium flex items-center justify-center">
                                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                              <span className="truncate flex-1">{conv.customer_name || 'Unknown Customer'}</span>
                              {conv.assigned_agent_name && (
                                <Badge variant="info" className="flex-shrink-0">
                                  → {conv.assigned_agent_name}
                                </Badge>
                              )}
                              {conv.tags && conv.tags.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {conv.tags.map((tag, i) => (
                                    <Badge key={tag} variant="default" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                              <span className="truncate flex-1">{conv.customer_email || ''}</span>
                              {formatTimestamp(conv.last_message_at || conv.updated_at)}
                            </div>
                            {conv.last_message && (
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                                {conv.last_message}
                              </div>
                            )}
                          </div>
                        )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Center Panel: Conversation Detail */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {!selectedConversation ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 px-6">
            <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-3xl mb-6">
              💬
            </div>
            <p className="text-xl font-medium text-slate-900 dark:text-white">Select a conversation</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center max-w-md">
              Choose a conversation from the list to view messages and reply.
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Conversation Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 sticky top-0 z-10">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar
                    name={selectedConversation.customer_name || 'Unknown'}
                    size="lg"
                    className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                      {selectedConversation.subject || 'No Subject'}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="truncate">{selectedConversation.customer_name || 'Unknown Customer'}</span>
                      <span>•</span>
                      <span className="truncate">{selectedConversation.customer_email || ''}</span>
                      {selectedConversation.channel && (
                        <>
                          <span>•</span>
                          <Badge variant="info" className="text-xs capitalize">{selectedConversation.channel}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(selectedConversation.status)}>
                      {selectedConversation.status.replace('_', ' ')}
                    </Badge>
                    <Badge variant={getPriorityBadgeVariant(selectedConversation.priority || 'normal')}>
                      {selectedConversation.priority || 'normal'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedConversation.status === 'pending' && userRole === 'agent' && (
                      <Button variant="outline" size="sm" onClick={handleTake}>
                        Take
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setShowAssignModal(true); setAssignAgentId(''); setAssignNote(''); }}>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Assign
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setShowPriorityModal(true); setNewPriority(selectedConversation.priority || 'normal'); }}>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      Priority
                    </Button>
                    {selectedConversation.status !== 'resolved' && selectedConversation.status !== 'closed' ? (
                      <Button variant="outline" size="sm" onClick={() => { setShowResolveModal(true); setResolveDetails(''); }}>
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Resolve
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={handleReopen}>
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={messagesContainerRef} role="log" aria-live="polite">
              {isLoadingConversation && messages.length === 0 && (
                <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
                </div>
              )}
              {!isLoadingConversation && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-slate-500 dark:text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-2xl mb-4">
                    💬
                  </div>
                  <p className="text-lg font-medium text-slate-900 dark:text-white">No messages yet</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Start the conversation by sending a message below</p>
                </div>
              )}
              {!isLoadingConversation &&
                messages.map((message) => {
                  const info = senderInfo(message);
                  const isInternalNote = message.message_type === 'internal_note' || message.is_internal;
                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${info.align === 'right' ? 'flex-row-reverse' : ''} ${isInternalNote ? 'opacity-80' : ''}`}
                    >
                      {info.align === 'left' && !isInternalNote && (
                        <Avatar name={info.name} size="sm" className={info.color} />
                      )}
                      {info.align === 'left' && isInternalNote && (
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-amber-700 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 max-w-[85%]">
                        {info.align !== 'right' && (
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-sm font-medium ${isInternalNote ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                              {info.name}{isInternalNote ? ' (Internal)' : ''}
                            </span>
                            <time className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                              {formatFullTimestamp(message.created_at)}
                            </time>
                          </div>
                        )}
                        <div
                          className={`p-3 rounded-lg ${
                            info.align === 'right'
                              ? 'rounded-tr-none bg-blue-600 text-white shadow-sm'
                              : isInternalNote
                              ? 'rounded-tl-none bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800'
                              : info.name === 'AI Assistant'
                              ? 'rounded-tl-none bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100 border border-purple-200 dark:border-purple-800'
                              : 'rounded-tl-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm'
                          }`}
                        >
                          {info.name === 'AI Assistant' && message.content.startsWith('[DEMO AI]') && (
                            <Badge variant="info" className="text-[10px] ml-1">
                              Demo
                            </Badge>
                          )}
                          {cleanDemoPrefix(message.content)}
                        </div>
                        {info.align === 'right' && (
                          <div className="flex items-center gap-2 mt-1">
                            <time className="text-xs text-blue-200 dark:text-blue-300">
                              {formatFullTimestamp(message.created_at)}
                            </time>
                            {message.is_internal && (
                              <Badge variant="warning" className="text-xs">Internal</Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {info.align === 'right' && (
                        <Avatar name={String(userId)} size="sm" className="bg-blue-600" />
                      )}
                      {info.align === 'left' && isInternalNote && (
                        <div className="w-8" />
                      )}
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
              <div className="flex items-end gap-3">
                <div className="relative flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Private Note
                      </span>
                    </label>
                  </div>
                  <textarea
                    value={messageInput}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      setCannedSearch(e.target.value);
                    }}
                    placeholder={isInternal ? "Type an internal note (only visible to agents)..." : "Type a message..."}
                    rows={2}
                    className="w-full px-4 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={isSending}
                  />
                  {(cannedSearch || isInternal) && cannedResponses.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
                      {cannedResponses
                        .filter((c) => c.title.toLowerCase().includes(cannedSearch.toLowerCase()))
                        .slice(0, 5)
                        .map((c) => (
                          <div
                            key={c.id}
                            onClick={() => setMessageInput((prev) => prev + c.content)}
                            className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer border-t border-slate-100 dark:border-slate-800/50 first:border-t-0"
                          >
                            <span className="font-medium">{c.title}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{c.category}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={isSending || !messageInput.trim()}
                  className="px-6 py-2.5 h-10 flex-shrink-0"
                >
                  {isSending ? 'Sending...' : isInternal ? 'Add Note' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Right Panel Toggle (mobile) */}
        <div className="xl:hidden fixed bottom-4 right-4 z-40">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            aria-label={rightPanelOpen ? 'Close details panel' : 'Open details panel'}
            className="shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rightPanelOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
            </svg>
          </Button>
        </div>
      </main>

      {/* Right Panel: Conversation Details */}
      <aside
        className={`flex flex-col transition-all duration-300 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden xl:flex ${rightPanelOpen ? '' : 'hidden xl:flex'}`}
        style={{ width: rightPanelOpen ? 380 : 0, minWidth: rightPanelOpen ? 380 : 0, maxWidth: rightPanelOpen ? 380 : 0 }}
        aria-label="Conversation details"
      >
        <div className="flex flex-col h-full">
          {/* Panel Header */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Details</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRightPanelOpen(false)}
              aria-label="Close details panel"
              className="xl:hidden text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 0 }}>
            {selectedConversation && (
              <>
                {/* Customer Info */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Customer</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={selectedConversation.customer_name || 'Unknown'} size="md" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {selectedConversation.customer_name || 'Unknown Customer'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {selectedConversation.customer_email || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conversation Properties */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Conversation</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Status</span>
                      <Badge variant={getStatusBadgeVariant(selectedConversation.status)}>
                        {selectedConversation.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Priority</span>
                      <Badge variant={getPriorityBadgeVariant(selectedConversation.priority || 'normal')}>
                        {selectedConversation.priority || 'normal'}
                      </Badge>
                    </div>
                    {selectedConversation.assigned_agent_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Assigned Agent</span>
                        <span className="text-slate-900 dark:text-slate-100 font-medium">{selectedConversation.assigned_agent_name}</span>
                      </div>
                    )}
                    {selectedConversation.channel && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Channel</span>
                        <Badge variant="info" className="capitalize">{selectedConversation.channel}</Badge>
                      </div>
                    )}
                    {selectedConversation.tags && selectedConversation.tags.length > 0 ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Tags</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedConversation.tags.map((tag) => (
                            <Badge key={tag} variant="default" className="text-xs flex items-center gap-1">
                              {tag}
                              <button
                                type="button"
                                onClick={() => handleTagRemove(tag)}
                                className="hover:text-red-500"
                                aria-label={`Remove tag ${tag}`}
                              >
                                ✕
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Tags</span>
                        <Button variant="ghost" size="sm" onClick={() => setShowTagModal(true)} className="text-xs text-blue-600 dark:text-blue-400">
                          + Add
                        </Button>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Created</span>
                      <span className="text-slate-900 dark:text-slate-100 font-medium">
                        {formatFullTimestamp(selectedConversation.created_at)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Updated</span>
                      <span className="text-slate-900 dark:text-slate-100 font-medium">
                        {formatFullTimestamp(selectedConversation.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Custom Fields */}
                {customFields.length > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Custom Fields</p>
                    <div className="space-y-2">
                      {customFields.map((cf) => (
                        <div key={cf.custom_field_id} className="flex justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">{cf.field_name}</span>
                          <span className="text-slate-900 dark:text-slate-100 font-medium">{cf.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Attachments</p>
                    <div className="space-y-2">
                      {attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{att.filename}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {(att.file_size / 1024).toFixed(1)} KB • {att.mime_type}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assignment History - would need backend support */}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Modals */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Assign Conversation</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowAssignModal(false); setAssignAgentId(''); setAssignNote(''); }}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assign to Agent</label>
                <select
                  value={assignAgentId}
                  onChange={(e) => setAssignAgentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassign</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={String(agent.id)}>
                      {agent.full_name} ({agent.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Note (optional)</label>
                <textarea
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add a note for the assigned agent..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={() => { setShowAssignModal(false); setAssignAgentId(''); setAssignNote(''); }}>
                  Cancel
                </Button>
                <Button onClick={handleAssign} disabled={!assignAgentId && assignAgentId !== ''}>
                  Assign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Resolve Conversation</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowResolveModal(false); setResolveDetails(''); }}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Resolution Details (optional)</label>
                <textarea
                  value={resolveDetails}
                  onChange={(e) => setResolveDetails(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe how this was resolved..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={() => { setShowResolveModal(false); setResolveDetails(''); }}>
                  Cancel
                </Button>
                <Button onClick={handleResolve}>
                  Resolve
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPriorityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Change Priority</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowPriorityModal(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={() => setShowPriorityModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handlePriorityChange}>
                  Update
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Tag</h2>
              <Button variant="ghost" size="sm" onClick={handleTagModalClose}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tag Name</label>
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="e.g. billing, vip, urgent"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTagAdd();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={handleTagModalClose}>
                  Cancel
                </Button>
                <Button onClick={handleTagAdd} disabled={!newTag.trim()}>
                  Add Tag
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}