'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type { ConversationListItem, Message, CannedResponse, Attachment, ConversationCustomFieldValue, GlobalNoteResponse } from '@/lib/types';
import { conversationApi,   agentApi,
  attachmentApi, adminApi, cannedResponseApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const QUEUE_OPTIONS = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned to Me' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'waiting', label: 'Waiting on Customer' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'resolved', label: 'Resolved' },
] as const;

type QueueValue = 'inbox' | 'pending' | 'assigned' | 'unassigned' | 'waiting' | 'on_hold' | 'resolved';

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
    case 'open': case 'assigned': return 'primary';
    case 'pending': return 'warning';
    case 'waiting_on_customer': return 'ai';
    case 'on_hold': return 'system';
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
  const searchParams = useSearchParams();

  // Layout state
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightDetailsSection, setRightDetailsSection] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<'all' | 'unassigned' | 'pending' | 'waiting' | 'on_hold' | 'ai'>('all');
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [showCannedMenu, setShowCannedMenu] = useState(false);
  const [showKnowledgeMenu, setShowKnowledgeMenu] = useState(false);

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
    status: searchParams?.get('status') || '',
    agent_id: '',
    customer_id: '',
    q: '',
  });

  useEffect(() => {
    const statusParam = searchParams?.get('status');
    if (statusParam) {
      setAdminFilters(prev => ({ ...prev, status: statusParam }));
    }
  }, [searchParams]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [cannedSearch, setCannedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [preselectedId, setPreselectedId] = useState<number | null>(() => {
    const raw = (params as Record<string, string | string[]> | null)?.id;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
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
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [showPropertiesDetails, setShowPropertiesDetails] = useState(false);
  const [showTimeLogs, setShowTimeLogs] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [assignmentHistory, setAssignmentHistory] = useState<Array<Record<string, unknown>>>([]);
  const [showGlobalNote, setShowGlobalNote] = useState(true);
  const [globalNote, setGlobalNote] = useState('');
  const [globalNoteDraft, setGlobalNoteDraft] = useState('');
  const [globalNoteUpdatedAt, setGlobalNoteUpdatedAt] = useState<string | null>(null);
  const [globalNoteUpdatedByName, setGlobalNoteUpdatedByName] = useState<string | null>(null);
  const [isEditingGlobalNote, setIsEditingGlobalNote] = useState(false);
  const [savingGlobalNote, setSavingGlobalNote] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTarget, setMentionTarget] = useState<'global_note' | 'message' | null>(null);
  const [mentionCursorIndex, setMentionCursorIndex] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showContactEdit, setShowContactEdit] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      const existing = conversations.find(c => c.id === id) || null;
      // A conversation opened from a notification/URL may not be part of the
      // active queue; build the card from the detail payload (which now carries
      // the same fields as the inbox list) so it can still be selected.
      const fromDetail: ConversationListItem = {
        id: detail.id,
        customer_id: detail.customer_id,
        assigned_agent_id: detail.assigned_agent_id ?? null,
        assigned_agent_name: detail.assigned_agent_name ?? null,
        subject: detail.subject ?? null,
        status: detail.status,
        channel: detail.channel ?? null,
        priority: detail.priority ?? 'normal',
        tags: detail.tags ?? [],
        resolution_details: detail.resolution_details ?? null,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        resolved_at: detail.resolved_at ?? null,
        closed_at: detail.closed_at ?? null,
        customer_last_read_at: detail.customer_last_read_at ?? null,
        agent_last_read_at: detail.agent_last_read_at ?? null,
        customer_name: detail.customer_name || existing?.customer_name || 'Unknown Customer',
        customer_email: detail.customer_email || existing?.customer_email || '',
        last_message: detail.last_message ?? existing?.last_message ?? null,
        last_message_at: detail.last_message_at ?? existing?.last_message_at ?? null,
        unread_count: detail.unread_count ?? existing?.unread_count ?? 0,
      };
      if (!existing) {
        setConversations(prev => [fromDetail, ...prev.filter(c => c.id !== id)]);
      }
      setSelectedConversation(existing || fromDetail);
      setMessages(detail.messages || []);
      setAttachments(detail.attachments || []);
      setCustomFields(detail.custom_fields || []);
      setAssignmentHistory(detail.assignment_history || []);
      setGlobalNote(detail.global_note || '');
      setGlobalNoteDraft(detail.global_note || '');
      setGlobalNoteUpdatedAt(detail.global_note_updated_at || null);
      setGlobalNoteUpdatedByName(detail.global_note_updated_by_name || null);
      setIsEditingGlobalNote(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
      setError(errorMessage);
      console.error('[ThreePanelWorkspace] Failed to load conversation:', err);
    } finally {
      setIsLoadingConversation(false);
    }
  }, [userRole, conversations]);

  useEffect(() => {
    if (!rightDetailsSection) return;
    if (rightDetailsSection === 'contact') {
      setShowContactDetails(true);
      setShowPropertiesDetails(false);
      setShowTimeLogs(false);
      setShowGlobalNote(false);
      setShowTimeline(false);
    } else if (rightDetailsSection === 'properties') {
      setShowPropertiesDetails(true);
      setShowContactDetails(false);
      setShowTimeLogs(false);
      setShowGlobalNote(false);
      setShowTimeline(false);
    } else if (rightDetailsSection === 'time') {
      setShowTimeLogs(true);
      setShowContactDetails(false);
      setShowPropertiesDetails(false);
      setShowGlobalNote(false);
      setShowTimeline(false);
    } else if (rightDetailsSection === 'note' || rightDetailsSection === 'todo') {
      setShowGlobalNote(true);
      setShowContactDetails(false);
      setShowPropertiesDetails(false);
      setShowTimeLogs(false);
      setShowTimeline(false);
    } else if (rightDetailsSection === 'timeline') {
      setShowTimeline(true);
      setShowContactDetails(false);
      setShowPropertiesDetails(false);
      setShowTimeLogs(false);
      setShowGlobalNote(false);
    }
  }, [rightDetailsSection]);

  // Open the conversation referenced by the URL (/agent/conversations/{id}) once.
  const preselectDone = useRef(false);
  useEffect(() => {
    if (preselectDone.current || !preselectedId) return;
    if (isLoading) return;
    preselectDone.current = true;
    loadConversation(preselectedId);
  }, [preselectedId, isLoading, loadConversation]);

  // Global Note handlers
  const handleSaveGlobalNote = useCallback(async () => {
    if (!selectedConversation) return;
    setSavingGlobalNote(true);
    try {
      let res: GlobalNoteResponse;
      if (userRole === 'admin') {
        res = await adminApi.updateGlobalNote(selectedConversation.id, globalNoteDraft);
      } else {
        res = await agentApi.updateGlobalNote(selectedConversation.id, globalNoteDraft);
      }
      setGlobalNote(res.global_note);
      setGlobalNoteDraft(res.global_note);
      setGlobalNoteUpdatedAt(res.global_note_updated_at);
      setGlobalNoteUpdatedByName(res.global_note_updated_by_name);
      setIsEditingGlobalNote(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update global note');
    } finally {
      setSavingGlobalNote(false);
    }
  }, [selectedConversation, userRole, globalNoteDraft]);

  const handleTextareaChange = useCallback((
    value: string,
    target: 'global_note' | 'message',
    cursorPos: number
  ) => {
    if (target === 'global_note') {
      setGlobalNoteDraft(value);
    } else {
      setMessageInput(value);
      setCannedSearch(value);
    }

    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      if (/[\s\n]/.test(charBeforeAt) || lastAtIndex === 0) {
        const queryText = textBeforeCursor.slice(lastAtIndex + 1);
        if (!/[\n\r]/.test(queryText) && queryText.length <= 25) {
          setMentionQuery(queryText);
          setMentionTarget(target);
          setMentionCursorIndex(lastAtIndex);
          return;
        }
      }
    }
    setMentionQuery(null);
    setMentionTarget(null);
  }, []);

  const insertMention = useCallback((agent: { id: number; full_name: string; email: string }) => {
    const mentionTag = `@${agent.full_name} `;
    if (mentionTarget === 'global_note') {
      const before = globalNoteDraft.slice(0, mentionCursorIndex);
      const after = globalNoteDraft.slice(mentionCursorIndex + (mentionQuery ? mentionQuery.length + 1 : 1));
      setGlobalNoteDraft(before + mentionTag + after);
    } else if (mentionTarget === 'message') {
      const before = messageInput.slice(0, mentionCursorIndex);
      const after = messageInput.slice(mentionCursorIndex + (mentionQuery ? mentionQuery.length + 1 : 1));
      setMessageInput(before + mentionTag + after);
    }
    setMentionQuery(null);
    setMentionTarget(null);
  }, [mentionTarget, globalNoteDraft, messageInput, mentionCursorIndex, mentionQuery]);

  const matchingAgents = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return agents.filter(a =>
      a.full_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [mentionQuery, agents]);

  const handleStatusChange = useCallback(async (targetStatus: string, details?: string) => {
    if (!selectedConversation) return;
    try {
      if (userRole === 'admin') {
        await adminApi.updateConversationStatus(selectedConversation.id, targetStatus, details);
      } else {
        await agentApi.updateStatus(selectedConversation.id, targetStatus, details);
      }
      setSelectedConversation(prev => prev ? {
        ...prev,
        status: targetStatus as any,
        assigned_agent_id: targetStatus === 'on_hold' || targetStatus === 'pending' ? null : prev.assigned_agent_id,
        assigned_agent_name: targetStatus === 'on_hold' || targetStatus === 'pending' ? null : prev.assigned_agent_name,
      } : null);
      setConversations(prev => prev.map(c => c.id === selectedConversation.id ? {
        ...c,
        status: targetStatus as any,
        assigned_agent_id: targetStatus === 'on_hold' || targetStatus === 'pending' ? null : c.assigned_agent_id,
        assigned_agent_name: targetStatus === 'on_hold' || targetStatus === 'pending' ? null : c.assigned_agent_name,
      } : c));
      await loadConversation(selectedConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }, [selectedConversation, userRole, loadConversation]);

  const handleSaveContact = useCallback(async () => {
    if (!selectedConversation || !contactName.trim()) {
      setError('Customer name is required');
      return;
    }
    setSavingContact(true);
    setError(null);
    try {
      await agentApi.updateCustomer(selectedConversation.id, {
        full_name: contactName.trim(),
        email: contactEmail.trim() || undefined,
      });
      setShowContactEdit(false);
      await loadConversations();
      if (selectedConversation) {
        await loadConversation(selectedConversation.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update contact');
    } finally {
      setSavingContact(false);
    }
  }, [selectedConversation, contactName, contactEmail, loadConversations, loadConversation]);

  const handleAttachmentSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !selectedConversation) return;

      setIsUploading(true);
      try {
        await attachmentApi.upload(selectedConversation.id, file);
        const detail = await agentApi.getConversation(selectedConversation.id);
        setAttachments(detail.attachments || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload attachment');
      } finally {
        setIsUploading(false);
      }
    },
    [selectedConversation],
  );

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
    } else {
      setMessages([]);
      setAttachments([]);
      setCustomFields([]);
      setAssignmentHistory([]);
    }
  }, [selectedConversation, loadConversation]);

  // Light polling keeps new customer/agent messages visible without touching composer state
  useEffect(() => {
    if (!selectedConversation || isLoadingConversation) return;
    const conversationId = selectedConversation.id;
    const interval = setInterval(async () => {
      try {
        const detail =
          userRole === 'admin'
            ? await adminApi.getConversation(conversationId)
            : await agentApi.getConversation(conversationId);
        setMessages((prev) => {
          if (
            prev.length === detail.messages.length &&
            prev.every((m, i) => m.id === detail.messages[i].id)
          ) {
            return prev;
          }
          return detail.messages;
        });
        setAttachments((prev) =>
          prev.length === (detail.attachments || []).length ? prev : detail.attachments || [],
        );
      } catch {
        // ignore transient polling failures
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedConversation, isLoadingConversation, userRole]);

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
    loadConversation(conv.id);
    // Update URL
    const basePath = userRole === 'admin' ? '/admin' : '/agent';
    router.push(`${basePath}/conversations/${conv.id}`);
  }, [router, userRole, loadConversation]);

  const handleQueueChange = useCallback((newQueue: QueueValue) => {
    setQueue(newQueue);
    setSelectedConversation(null);
    setMessages([]);
    setAttachments([]);
    setCustomFields([]);
    setAssignmentHistory([]);
    // Update URL
    const queuePaths: Record<QueueValue, string> = {
      inbox: '/agent',
      pending: '/agent/pending',
      assigned: '/agent/assigned',
      unassigned: '/agent/unassigned',
      waiting: '/agent/pending?status=waiting_on_customer',
      on_hold: '/agent/pending?status=on_hold',
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

  const handleGenerateAiSuggestion = useCallback(async () => {
    if (!selectedConversation) {
      setAiSuggestion(null);
      return;
    }
    setIsGeneratingSuggestion(true);
    setAiSuggestion(null);
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      const result = await api.suggestAgentReply(selectedConversation.id);
      setAiSuggestion(result.draft ?? null);
      if (result.draft) {
        setMessageInput(result.draft);
        setIsInternal(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI suggestion');
      setAiSuggestion(null);
    } finally {
      setIsGeneratingSuggestion(false);
    }
  }, [selectedConversation, userRole]);

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
    const filtered = conversations.filter((c) => {
      const matchesSearch =
        (c.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customer_email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.last_message || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (userRole !== 'agent' || queueFilter === 'all') return true;
      if (queueFilter === 'unassigned') return !c.assigned_agent_id;
      if (queueFilter === 'pending') return c.status === 'pending';
      if (queueFilter === 'waiting') return c.status === 'waiting_on_customer';
      if (queueFilter === 'on_hold') return c.status === 'on_hold';
      if (queueFilter === 'ai') return c.status === 'ai_handling';
      return true;
    });
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
  }, [conversations, searchTerm, adminFilters.q, userRole, sortBy, queueFilter]);

  // Layout dimensions
  const rightWidth = rightPanelOpen ? 330 : 56;

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
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

      {/* Left Panel: Conversation List (always expanded; no collapse control) */}
      <aside
        className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-[380px] lg:min-w-[380px] lg:max-w-[380px]"
        aria-label="Conversation list"
        data-testid="conversation-list"
      >
        {/* Panel Header */}
        <div className="flex flex-col flex-shrink-0 p-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{filteredConversations.length} Conversations</h2>
              {userRole === 'admin' ? (
                <Badge variant="primary" className="text-xs flex-shrink-0">All</Badge>
              ) : (
                <Badge variant={queue === 'inbox' ? 'primary' : queue === 'pending' ? 'warning' : queue === 'assigned' ? 'info' : queue === 'unassigned' ? 'danger' : 'success'} className="text-xs flex-shrink-0">
                  {QUEUE_OPTIONS.find(q => q.value === queue)?.label}
                </Badge>
              )}
            </div>
          </div>

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
                        <option value="open">Open</option>
                        <option value="pending">Pending</option>
                        <option value="waiting_on_customer">Waiting on Customer</option>
                        <option value="on_hold">On Hold</option>
                        <option value="resolved">Resolved</option>
                        <option value="ai_handling">AI Handling</option>
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Assigned to me</div>
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
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Sort</div>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="text-sm px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="Sort conversations"
                      >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="subject">Subject</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(['all', 'pending', 'waiting', 'on_hold', 'unassigned'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQueueFilter(opt as any)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          queueFilter === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                        aria-pressed={queueFilter === opt}
                      >
                        {opt === 'waiting' ? 'Waiting' : opt === 'on_hold' ? 'On Hold' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Filter</span>
                      <Badge variant="default" className="text-[10px]">
                        {queueFilter === 'all' ? 'All' : queueFilter === 'waiting' ? 'Waiting' : queueFilter === 'on_hold' ? 'On Hold' : queueFilter}
                      </Badge>
                    </div>
                  </div>
                  <Input
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Search conversations"
                  />
                </>
              )}
            </div>
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
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`group relative w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition-all ${
                    isSelected
                      ? 'border-blue-200 bg-blue-50 shadow-sm dark:border-blue-800 dark:bg-blue-900/30'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/50'
                  }`}
                  aria-selected={isSelected}
                  aria-label={conv.subject || 'No Subject'}
                >
                  {isSelected && (
                    <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-blue-600" aria-hidden="true" />
                  )}
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={conv.customer_name || 'Unknown'}
                      size="md"
                      className="flex-shrink-0 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                    />
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`truncate text-sm font-semibold ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                                {conv.customer_name || 'Unknown Customer'}
                              </span>
                              {conv.unread_count > 0 && (
                                <span className="flex-shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {conv.subject || 'No Subject'}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                            {formatTimestamp(conv.last_message_at || conv.updated_at)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                          {conv.last_message || 'No messages yet'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant={getStatusBadgeVariant(conv.status)} className="text-[10px]">
                            {conv.status.replace('_', ' ')}
                          </Badge>
                          {(conv.priority || 'normal') !== 'normal' && (
                            <Badge variant={getPriorityBadgeVariant(conv.priority || 'normal')} className="text-[10px]">
                              {conv.priority}
                            </Badge>
                          )}
                          {conv.channel && (
                            <Badge variant="default" className="text-[10px] capitalize">
                              {conv.channel}
                            </Badge>
                          )}
                          {conv.assigned_agent_name && (
                            <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                              {conv.assigned_agent_name}
                            </span>
                          )}
                        </div>
                      </div>
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
                      <Badge variant="success" className="text-[10px]">
                        <svg className="mr-0.5 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Verified
                      </Badge>
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
                    {/* Interactive Status Selector */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowStatusMenu((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-full focus:outline-none"
                        title="Change conversation status"
                      >
                        <Badge
                          variant={getStatusBadgeVariant(selectedConversation.status)}
                          className="cursor-pointer hover:opacity-90 capitalize"
                        >
                          {selectedConversation.status.replace('_', ' ')}
                          <svg className="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </Badge>
                      </button>

                      {showStatusMenu && (
                        <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Set Status
                          </div>
                          {[
                            { key: 'open', label: 'Open', desc: 'Actively being handled', variant: 'primary' },
                            { key: 'pending', label: 'Pending', desc: 'Waiting for assignment', variant: 'warning' },
                            { key: 'waiting_on_customer', label: 'Waiting on Customer', desc: 'Waiting for customer reply', variant: 'ai' },
                            { key: 'on_hold', label: 'On Hold', desc: 'Paused & unassigned', variant: 'system' },
                            { key: 'resolved', label: 'Resolved', desc: 'Issue marked resolved', variant: 'success' },
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setShowStatusMenu(false);
                                if (item.key === 'resolved') {
                                  setShowResolveModal(true);
                                } else {
                                  handleStatusChange(item.key);
                                }
                              }}
                              className={`flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                selectedConversation.status === item.key ? 'bg-slate-100 font-semibold dark:bg-slate-800' : ''
                              }`}
                            >
                              <span className="mt-0.5">
                                <Badge variant={item.variant as any} className="px-1.5 py-0 text-[10px]">
                                  {item.label}
                                </Badge>
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() => {
                        setRightPanelOpen((v) => !v);
                      }}
                      aria-label={rightPanelOpen ? 'Hide customer details' : 'Show customer details'}
                      title="Toggle customer details"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a4 4 0 01-4-4V9a4 4 0 014-4h5l3 3v5a4 4 0 01-4 4H9z" />
                      </svg>
                    </Button>
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
                  const isSystemEvent =
                    message.message_type === 'system_event' || String(message.sender_type) === 'system';
                  if (isSystemEvent) {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="max-w-[80%] rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-center text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {cleanDemoPrefix(message.content)}{' '}
                          <span className="text-slate-400 dark:text-slate-500">
                            {formatFullTimestamp(message.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  const isInternalNote = message.message_type === 'internal_note' || message.is_internal;
                  const isAiMessage = info.name === 'AI Assistant' || String(message.sender_type) === 'ai';
                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${info.align === 'right' ? 'flex-row-reverse' : ''} ${isInternalNote ? 'opacity-90' : ''}`}
                    >
                      {info.align === 'left' && !isInternalNote && !isAiMessage && (
                        <Avatar name={info.name} size="sm" className={info.color} />
                      )}
                      {info.align === 'left' && isAiMessage && !isInternalNote && (
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40">
                          <svg className="h-4 w-4 text-purple-700 dark:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {info.align === 'left' && isInternalNote && (
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <svg className="h-4 w-4 text-amber-700 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </div>
                      )}
                      <div className="max-w-[85%] flex-1">
                        {info.align !== 'right' && (
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                isInternalNote
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : isAiMessage
                                    ? 'text-purple-700 dark:text-purple-300'
                                    : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {isInternalNote ? 'Private Note' : isAiMessage ? 'AI Assistant' : info.name}
                            </span>
                            {isInternalNote && (
                              <Badge variant="warning" className="text-[10px]">
                                Only visible to agents
                              </Badge>
                            )}
                            {isAiMessage && (
                              <Badge variant="info" className="text-[10px]">
                                AI
                              </Badge>
                            )}
                            <time className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                              {formatFullTimestamp(message.created_at)}
                            </time>
                          </div>
                        )}
                        <div
                          className={`rounded-lg p-3 ${
                            info.align === 'right'
                              ? 'rounded-tr-none bg-blue-600 text-white shadow-sm'
                              : isInternalNote
                                ? 'rounded-tl-none border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/25 dark:text-amber-100'
                                : isAiMessage
                                  ? 'rounded-tl-none border border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-100'
                                  : 'rounded-tl-none border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {isAiMessage && String(message.content).startsWith('[DEMO AI]') && (
                            <Badge variant="info" className="mr-1 text-[10px]">
                              Demo
                            </Badge>
                          )}
                          {cleanDemoPrefix(message.content)}
                        </div>
                        {info.align === 'right' && (
                          <div className="mt-1 flex items-center gap-2">
                            <time className="text-xs text-blue-200 dark:text-blue-300">
                              {formatFullTimestamp(message.created_at)}
                            </time>
                            {message.is_internal && (
                              <Badge variant="warning" className="text-[10px]">
                                Internal
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {info.align === 'right' && (
                        <Avatar name={String(userId)} size="sm" className="bg-blue-600" />
                      )}
                      {info.align === 'left' && (isInternalNote || isAiMessage) && <div className="w-8" />}
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>
            {/* Composer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsInternal(false)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${!isInternal ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInternal(true)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${isInternal ? 'bg-amber-100 text-amber-800 shadow-sm dark:bg-amber-900/40 dark:text-amber-200' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    Private Note
                  </button>
                </div>
                {isInternal && (
                  <Badge variant="warning" className="text-[10px]">Only visible to agents</Badge>
                )}
                <div className="flex items-center gap-1">
                  <button type="button" onClick={handleGenerateAiSuggestion} className="rounded p-2 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20" disabled={isGeneratingSuggestion || !selectedConversation}>
                    {isGeneratingSuggestion ? 'Generating...' : 'AI'}
                  </button>
                  <div className="relative">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleAttachmentSelect}
                      aria-label="Upload attachment"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                      aria-label={isUploading ? 'Uploading attachment' : 'Attach file'}
                      title="Attach file"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => setShowCannedMenu((v) => !v)} className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Insert canned response" title="Canned responses">
                      <span className="text-xs font-medium">CR</span>
                    </button>
                    {showCannedMenu && (
                      <div className="absolute bottom-full right-0 z-20 mb-1 w-64 rounded border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {cannedResponses.slice(0, 6).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setMessageInput((prev) => prev + c.content);
                              setShowCannedMenu(false);
                            }}
                            className="w-full truncate rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {c.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => setShowKnowledgeMenu((v) => !v)} className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Knowledge base">
                      <span className="text-xs font-medium">KB</span>
                    </button>
                    {showKnowledgeMenu && (
                      <div className="absolute bottom-full right-0 z-20 mb-1 w-56 rounded border border-slate-200 bg-white p-2 text-xs text-slate-500 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        Use KB through AI suggestion or open `/help` to search published articles.
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => setShowEmojiMenu((v) => !v)} className="rounded p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Insert emoji">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    {showEmojiMenu && (
                      <div className="absolute bottom-full right-0 z-20 mb-1 grid w-28 grid-cols-4 gap-1 rounded border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {['😊', '👍', '🙏', '🎉', '👀', '✅', '⚠️', '📎'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setMessageInput((prev) => prev + emoji);
                              setShowEmojiMenu(false);
                            }}
                            className="rounded p-1 text-base hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <div className="relative">
                    {/* Mention Autocomplete Dropdown for Composer */}
                    {mentionTarget === 'message' && matchingAgents.length > 0 && (
                      <div className="absolute bottom-full left-0 z-30 mb-2 max-h-48 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Mention Agent
                        </div>
                        {matchingAgents.map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => insertMention(agent)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Avatar name={agent.full_name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-900 dark:text-white">
                                {agent.full_name}
                              </p>
                              <p className="truncate text-[10px] text-slate-400">{agent.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={messageInput}
                      onChange={(e) => {
                        handleTextareaChange(e.target.value, 'message', e.target.selectionStart || 0);
                      }}
                      onKeyUp={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        handleTextareaChange(target.value, 'message', target.selectionStart || 0);
                      }}
                      placeholder={isInternal ? 'Write a private note (only agents can see this, type @ to mention)...' : 'Type a message...'}
                      rows={2}
                      className={`w-full px-4 py-2.5 text-sm border rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                        isInternal
                          ? 'border-amber-300 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100'
                          : 'border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      }`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      disabled={isSending}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={isSending || !messageInput.trim()}
                  className={`px-6 py-2.5 h-10 flex-shrink-0 ${isInternal ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
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
        className="flex flex-col transition-all duration-300 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden"
        style={{ width: rightPanelOpen ? 330 : 56, minWidth: rightPanelOpen ? 330 : 56, maxWidth: rightPanelOpen ? 330 : 56 }}
        aria-label="Conversation details"
      >
        {!rightPanelOpen ? (
          <div className="flex h-full flex-col items-center gap-2 py-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setRightPanelOpen(true);
                setRightDetailsSection(null);
              }}
              aria-label="Expand customer details"
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rightPanelOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
              </svg>
            </Button>
            <div className="mt-2 flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
              <button
                type="button"
                title="Contact information"
                onClick={() => {
                  setRightPanelOpen(true);
                  setRightDetailsSection('contact');
                }}
                className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              <button
                type="button"
                title="Conversation properties"
                onClick={() => {
                  setRightPanelOpen(true);
                  setRightDetailsSection('properties');
                }}
                className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                type="button"
                title="Time logs"
                onClick={() => {
                  setRightPanelOpen(true);
                  setRightDetailsSection('time');
                }}
                className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                title="To-do"
                onClick={() => {
                  setRightPanelOpen(true);
                  setRightDetailsSection('todo');
                }}
                className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </button>
              <button
                type="button"
                title="Recent timeline"
                onClick={() => {
                  setRightPanelOpen(true);
                  setRightDetailsSection('timeline');
                }}
                className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Panel Header */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Customer Details</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightPanelOpen(false)}
                aria-label="Collapse details panel"
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={rightPanelOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
                </svg>
              </Button>
            </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ minHeight: 0 }}>
            {!selectedConversation && (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Select a conversation to see customer details, tasks and timeline.
              </div>
            )}
            {selectedConversation && (
              <>
                 <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                   <button
                     type="button"
                     className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                     onClick={() => setShowContactDetails((v) => !v)}
                   >
                     <span>Contact Information</span>
                     <svg className={`h-4 w-4 transition-transform ${showContactDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                     </svg>
                   </button>
                   <div className="mt-3 space-y-2">
                     <div className="flex items-center gap-3">
                       <Avatar name={selectedConversation.customer_name || 'Unknown'} size="md" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" />
                       <div className="min-w-0 flex-1">
                         <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                           {selectedConversation.customer_name || 'Unknown Customer'}
                         </p>
                         <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                           {selectedConversation.customer_email || ''}
                         </p>
                       </div>
                     </div>
                     {showContactDetails && (
                       <div className="space-y-1.5 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                         <div className="flex items-center justify-between gap-2">
                           <span className="text-slate-500 dark:text-slate-400">Customer ID</span>
                           <span className="font-medium text-slate-900 dark:text-slate-100">{selectedConversation.customer_id}</span>
                         </div>
                         <div className="flex items-center justify-between gap-2">
                           <span className="text-slate-500 dark:text-slate-400">Channel</span>
                           <Badge variant="info" className="capitalize">{selectedConversation.channel || 'website'}</Badge>
                         </div>
                         <div className="flex items-center justify-between gap-2">
                           <span className="text-slate-500 dark:text-slate-400">Conversations</span>
                           <span className="font-medium text-slate-900 dark:text-slate-100">{conversations.filter((c) => c.customer_id === selectedConversation.customer_id).length}</span>
                         </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 dark:text-slate-400">Current status</span>
                            <Badge variant={getStatusBadgeVariant(selectedConversation.status)}>{selectedConversation.status.replace('_', ' ')}</Badge>
                          </div>
                          {userRole !== 'admin' && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  setContactName(selectedConversation.customer_name || '');
                                  setContactEmail(selectedConversation.customer_email || '');
                                  setShowContactEdit(true);
                                }}
                              >
                                Edit contact
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  router.push('/agent/contacts');
                                }}
                              >
                                All contacts
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                   </div>
                 </div>

                 {/* Time Logs */}
                 <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                   <button
                     type="button"
                     className="w-full text-left flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                     onClick={() => setShowTimeLogs((v) => !v)}
                   >
                     <span>Time Logs</span>
                     <svg className={`w-4 h-4 transition-transform ${showTimeLogs ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                     </svg>
                   </button>
                   {showTimeLogs && (
                     <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                       <div className="flex items-center justify-between gap-2">
                         <span>Created</span>
                         <span>{formatFullTimestamp(selectedConversation.created_at)}</span>
                       </div>
                       <div className="flex items-center justify-between gap-2">
                         <span>Messages</span>
                         <span>{messages.length}</span>
                       </div>
                       <div className="flex items-center justify-between gap-2">
                         <span>Last updated</span>
                         <span>{formatFullTimestamp(selectedConversation.updated_at)}</span>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Global Note (One persistent note per conversation, strictly internal) */}
                 {userRole !== 'customer' && (
                   <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                     <div className="flex w-full items-center justify-between gap-2">
                       <button
                         type="button"
                         className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                         onClick={() => setShowGlobalNote((v) => !v)}
                       >
                         <span className="flex items-center gap-1.5">
                           <svg className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                           </svg>
                           Global Note
                         </span>
                         <Badge variant="warning" className="text-[9px] px-1 py-0">Internal</Badge>
                         <svg className={`w-3.5 h-3.5 transition-transform text-slate-400 ${showGlobalNote ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                         </svg>
                       </button>

                       {!isEditingGlobalNote && (
                         <button
                           type="button"
                           onClick={() => {
                             setGlobalNoteDraft(globalNote);
                             setIsEditingGlobalNote(true);
                           }}
                           className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                         >
                           {globalNote ? 'Edit' : '+ Add Note'}
                         </button>
                       )}
                     </div>

                     {showGlobalNote && (
                       <div className="mt-2.5">
                         {isEditingGlobalNote ? (
                           <div className="space-y-2">
                             <div className="relative">
                               <textarea
                                 value={globalNoteDraft}
                                 onChange={(e) => handleTextareaChange(e.target.value, 'global_note', e.target.selectionStart || 0)}
                                 onKeyUp={(e) => {
                                   const target = e.target as HTMLTextAreaElement;
                                   handleTextareaChange(target.value, 'global_note', target.selectionStart || 0);
                                 }}
                                 rows={4}
                                 placeholder="Write shared conversation notes, handoff context, or action items... (Type @ to mention team members)"
                                 className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                 autoFocus
                               />

                               {/* Mention autocomplete dropdown */}
                               {mentionTarget === 'global_note' && matchingAgents.length > 0 && (
                                 <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                   <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                     Mention Agent
                                   </div>
                                   {matchingAgents.map((agent) => (
                                     <button
                                       key={agent.id}
                                       type="button"
                                       onClick={() => insertMention(agent)}
                                       className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                                     >
                                       <Avatar name={agent.full_name} size="sm" />
                                       <div className="min-w-0 flex-1">
                                         <p className="truncate font-medium text-slate-900 dark:text-white">
                                           {agent.full_name}
                                         </p>
                                         <p className="truncate text-[10px] text-slate-400">{agent.email}</p>
                                       </div>
                                     </button>
                                   ))}
                                 </div>
                               )}
                             </div>

                             <div className="flex items-center justify-between text-[11px] text-slate-400">
                               <span>Type <span className="font-semibold text-slate-600 dark:text-slate-300">@</span> to tag agents</span>
                               <div className="flex items-center gap-1.5">
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={() => {
                                     setIsEditingGlobalNote(false);
                                     setGlobalNoteDraft(globalNote);
                                     setMentionTarget(null);
                                   }}
                                   disabled={savingGlobalNote}
                                   className="h-6 px-2 text-xs"
                                 >
                                   Cancel
                                 </Button>
                                 <Button
                                   size="sm"
                                   onClick={handleSaveGlobalNote}
                                   disabled={savingGlobalNote}
                                   className="h-6 px-3 text-xs"
                                 >
                                   {savingGlobalNote ? 'Saving...' : 'Save Note'}
                                 </Button>
                               </div>
                             </div>
                           </div>
                         ) : (
                           <div>
                             {globalNote ? (
                               <div className="rounded border border-amber-200/70 bg-amber-50/50 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                                 <div className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                                   {globalNote.split(/(@[a-zA-Z0-9_\s.-]+?)(?=[,\.!?\s]|$)/g).map((part, i) =>
                                     part.startsWith('@') ? (
                                       <span key={i} className="inline-flex items-center rounded bg-indigo-100 px-1 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                                         {part}
                                       </span>
                                     ) : (
                                       <span key={i}>{part}</span>
                                     )
                                   )}
                                 </div>
                                 {globalNoteUpdatedAt && (
                                   <div className="mt-2 flex items-center justify-between border-t border-amber-200/50 pt-1.5 text-[10px] text-slate-500 dark:border-amber-900/30 dark:text-slate-400">
                                     <span>
                                       Updated by <span className="font-medium text-slate-700 dark:text-slate-300">{globalNoteUpdatedByName || 'Agent'}</span>
                                     </span>
                                     <span>{formatFullTimestamp(globalNoteUpdatedAt)}</span>
                                   </div>
                                 )}
                               </div>
                             ) : (
                               <div className="rounded border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400 dark:border-slate-700">
                                 <p>No internal global note for this conversation.</p>
                                 <button
                                   type="button"
                                   onClick={() => {
                                     setGlobalNoteDraft('');
                                     setIsEditingGlobalNote(true);
                                   }}
                                   className="mt-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                 >
                                   Click to add note
                                 </button>
                               </div>
                             )}
                           </div>
                         )}
                       </div>
                     )}
                   </div>
                 )}


                 {/* Conversation Properties */}
                 <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                   <button
                     type="button"
                     className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                     onClick={() => setShowPropertiesDetails((v) => !v)}
                   >
                     <span>Customer Properties</span>
                     <svg className={`h-4 w-4 transition-transform ${showPropertiesDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                     </svg>
                   </button>
                   {showPropertiesDetails && (
                     <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-slate-500 dark:text-slate-400">Status</span>
                         <Badge variant={getStatusBadgeVariant(selectedConversation.status)}>
                           {selectedConversation.status.replace('_', ' ')}
                         </Badge>
                       </div>
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-slate-500 dark:text-slate-400">Priority</span>
                         <Badge variant={getPriorityBadgeVariant(selectedConversation.priority || 'normal')}>
                           {selectedConversation.priority || 'normal'}
                         </Badge>
                       </div>
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-slate-500 dark:text-slate-400">Assigned agent</span>
                         <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                           {selectedConversation.assigned_agent_name || 'Unassigned'}
                         </span>
                       </div>
                       <div className="flex items-center justify-between gap-2">
                         <span className="text-slate-500 dark:text-slate-400">Channel</span>
                         <span className="font-medium capitalize text-slate-900 dark:text-slate-100">
                           {selectedConversation.channel || 'website'}
                         </span>
                       </div>
                       {selectedConversation.tags && selectedConversation.tags.length > 0 && (
                         <div className="flex items-start justify-between gap-2">
                           <span className="text-slate-500 dark:text-slate-400">Tags</span>
                           <div className="flex flex-wrap justify-end gap-1">
                             {selectedConversation.tags.map((tag) => (
                               <button
                                 key={tag}
                                 type="button"
                                 onClick={() => handleTagRemove(tag)}
                                 title={`Remove tag ${tag}`}
                                 className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-red-100 hover:text-red-700 dark:bg-blue-900/40 dark:text-blue-300"
                               >
                                 {tag}
                               </button>
                             ))}
                           </div>
                         </div>
                       )}
                     </div>
                   )}
                 </div>

                 {/* Recent Timeline */}
                 <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                   <button
                     type="button"
                     className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                     onClick={() => setShowTimeline((v) => !v)}
                   >
                     <span>Recent Timeline</span>
                     <svg className={`h-4 w-4 transition-transform ${showTimeline ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                     </svg>
                   </button>
                   {showTimeline && (
                     <div className="mt-2 space-y-1.5 text-xs">
                       <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                         <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                         <div className="min-w-0">
                           <p>Conversation created</p>
                           <p className="text-[10px] text-slate-400 dark:text-slate-500">
                             {formatFullTimestamp(selectedConversation.created_at)}
                           </p>
                         </div>
                       </div>
                       {(assignmentHistory || []).slice(-5).map((entry, index) => (
                         <div key={`assignment-${index}`} className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                           <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />
                           <div className="min-w-0">
                             <p>Assigned to {String((entry as Record<string, unknown>).agent_name ?? (entry as Record<string, unknown>).agent_id ?? 'agent')}</p>
                             <p className="text-[10px] text-slate-400 dark:text-slate-500">
                               {formatFullTimestamp(
                                 (entry as Record<string, unknown>).assigned_at as string | undefined,
                               )}
                             </p>
                           </div>
                         </div>
                       ))}
                       {messages
                         .filter((m) => m.message_type === 'system_event' || m.sender_type === 'system')
                         .slice(-5)
                         .map((event) => (
                           <div key={`event-${event.id}`} className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                             <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-orange-500" />
                             <div className="min-w-0">
                               <p className="break-words">{cleanDemoPrefix(event.content)}</p>
                               <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                 {formatFullTimestamp(event.created_at)}
                               </p>
                             </div>
                           </div>
                         ))}
                       {conversations.filter(
                         (c) => c.customer_id === selectedConversation.customer_id && c.id !== selectedConversation.id,
                       ).length > 0 && (
                         <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                           <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                             Previous conversations
                           </p>
                           {conversations
                             .filter(
                               (c) => c.customer_id === selectedConversation.customer_id && c.id !== selectedConversation.id,
                             )
                             .slice(0, 5)
                             .map((prev) => (
                               <button
                                 key={prev.id}
                                 type="button"
                                 onClick={() => handleSelectConversation(prev)}
                                 className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                               >
                                 <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                                   #{prev.id} {prev.subject || 'No Subject'}
                                 </span>
                                 <span className="flex-shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                                   {formatTimestamp(prev.last_message_at || prev.updated_at)}
                                 </span>
                               </button>
                             ))}
                         </div>
                       )}
                       {selectedConversation.resolved_at && (
                         <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                           <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                           <div className="min-w-0">
                             <p>Conversation resolved</p>
                             <p className="text-[10px] opacity-80">
                               {formatFullTimestamp(selectedConversation.resolved_at)}
                             </p>
                           </div>
                         </div>
                       )}
                       {selectedConversation.closed_at && (
                         <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400">
                           <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-slate-400" />
                           <div className="min-w-0">
                             <p>Conversation closed</p>
                             <p className="text-[10px] text-slate-400 dark:text-slate-500">
                               {formatFullTimestamp(selectedConversation.closed_at)}
                             </p>
                           </div>
                         </div>
                       )}
                     </div>
                   )}
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
        )}
       </aside>

      {/* Modals */}
      {showContactEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Contact</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowContactEdit(false)} aria-label="Close">
                ✕
              </Button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="contact-name">
                  Customer name
                </label>
                <Input
                  id="contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="contact-email">
                  Email
                </label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="customer@example.com"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <Button variant="secondary" onClick={() => setShowContactEdit(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveContact} disabled={savingContact || !contactName.trim()}>
                  {savingContact ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
