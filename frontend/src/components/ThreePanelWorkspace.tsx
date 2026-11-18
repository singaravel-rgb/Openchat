'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type { ConversationListItem, Message, CannedResponse, Attachment, ConversationCustomFieldValue, GlobalNoteResponse, ConversationLinkItem } from '@/lib/types';
import { conversationApi, agentApi, attachmentApi, adminApi, cannedResponseApi } from '@/lib/api';
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
    case 'customer': return { name: 'Customer', color: 'bg-slate-500', align: 'left' as const };
    case 'agent': return { name: 'Agent', color: 'bg-blue-600', align: 'right' as const };
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

  // Private note editing
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState<string>('');
  const [savingNoteEdit, setSavingNoteEdit] = useState<boolean>(false);

  // Agent message undo (5-second window)
  const [undoMessage, setUndoMessage] = useState<{ id: number; timeLeft: number } | null>(null);

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
  const activeConversationIdRef = useRef<number | null>(null);
  const requestSeqRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);

  // Link & Merge state
  const [linkedConversations, setLinkedConversations] = useState<ConversationLinkItem[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [confirmCrossCustomer, setConfirmCrossCustomer] = useState(false);
  const [confirmMergeExplicit, setConfirmMergeExplicit] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

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
  const loadConversations = useCallback(async (isRetry = false, isBackground = false) => {
    if (isRetry) {
      setRetryCount(c => c + 1);
    } else if (!isBackground) {
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
      if (!isBackground) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load conversations';
        setError(errorMessage);
        console.error('[ThreePanelWorkspace] Failed to load conversations:', err);
      }
    } finally {
      if (!isRetry && !isBackground) {
        setIsLoading(false);
      }
    }
  }, [userRole, queue, searchTerm, adminFilters]);

  // Load single conversation detail
  const loadConversation = useCallback(async (id: number) => {
    const seq = ++requestSeqRef.current;
    activeConversationIdRef.current = id;
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

      // Drop stale responses if user switched conversations quickly
      if (seq !== requestSeqRef.current || activeConversationIdRef.current !== id) {
        return;
      }

      setConversations((prev) => {
        const existing = prev.find((c) => c.id === id) || null;
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
          merged_into_id: detail.merged_into_id ?? existing?.merged_into_id ?? null,
        };
        setSelectedConversation(existing || fromDetail);
        if (!existing) {
          return [fromDetail, ...prev.filter((c) => c.id !== id)];
        }
        return prev.map((c) => (c.id === id ? { ...c, ...fromDetail } : c));
      });

      setMessages(detail.messages || []);
      setAttachments(detail.attachments || []);
      setCustomFields(detail.custom_fields || []);
      setAssignmentHistory(detail.assignment_history || []);
      setGlobalNote(detail.global_note || '');
      setGlobalNoteDraft(detail.global_note || '');
      setGlobalNoteUpdatedAt(detail.global_note_updated_at || null);
      setGlobalNoteUpdatedByName(detail.global_note_updated_by_name || null);
      setLinkedConversations(detail.linked_conversations || []);
      setIsEditingGlobalNote(false);
    } catch (err) {
      if (seq === requestSeqRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
        setError(errorMessage);
        console.error('[ThreePanelWorkspace] Failed to load conversation:', err);
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoadingConversation(false);
      }
    }
  }, [userRole]);

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

  // Undo countdown timer
  useEffect(() => {
    if (!undoMessage) return;
    if (undoMessage.timeLeft <= 0) {
      setUndoMessage(null);
      return;
    }
    const timer = setTimeout(() => {
      setUndoMessage((prev) => {
        if (!prev) return null;
        if (prev.timeLeft <= 1) return null;
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [undoMessage]);

  const handleUndoMessage = useCallback(async (msgId: number) => {
    if (!selectedConversation) return;
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      await api.retractMessage(selectedConversation.id, msgId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, is_retracted: true, retracted_at: new Date().toISOString() } : m
        )
      );
      setUndoMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo message');
    }
  }, [selectedConversation, userRole]);

  const handleStartEditNote = useCallback((message: Message) => {
    setEditingNoteId(message.id);
    setEditingNoteContent(message.content);
  }, []);

  const handleCancelEditNote = useCallback(() => {
    setEditingNoteId(null);
    setEditingNoteContent('');
  }, []);

  const handleSaveEditNote = useCallback(async (messageId: number) => {
    if (!selectedConversation || !editingNoteContent.trim()) return;
    setSavingNoteEdit(true);
    try {
      const api = userRole === 'admin' ? adminApi : agentApi;
      const updated = await api.editMessage(selectedConversation.id, messageId, editingNoteContent.trim());
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: updated.content,
                edited_at: updated.edited_at,
                edited_by_id: updated.edited_by_id,
              }
            : m
        )
      );
      setEditingNoteId(null);
      setEditingNoteContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit note');
    } finally {
      setSavingNoteEdit(false);
    }
  }, [selectedConversation, editingNoteContent, userRole]);

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

  // Periodic background polling for new incoming conversations in queue/all chats
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations(false, true);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Load conversation when selected (with duplicate fetch prevention)
  const lastLoadedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedConversation) {
      if (lastLoadedIdRef.current !== selectedConversation.id) {
        lastLoadedIdRef.current = selectedConversation.id;
        loadConversation(selectedConversation.id);
      }
    } else {
      lastLoadedIdRef.current = null;
      setMessages([]);
      setAttachments([]);
      setCustomFields([]);
      setAssignmentHistory([]);
      setLinkedConversations([]);
    }
  }, [selectedConversation?.id, loadConversation]);

  // Light polling keeps new customer/agent messages visible without touching composer state
  useEffect(() => {
    if (!selectedConversation || isLoadingConversation) return;
    const conversationId = selectedConversation.id;
    const interval = setInterval(async () => {
      try {
        if (activeConversationIdRef.current !== conversationId) return;
        const detail =
          userRole === 'admin'
            ? await adminApi.getConversation(conversationId)
            : await agentApi.getConversation(conversationId);
        if (activeConversationIdRef.current !== conversationId) return;
        setMessages((prev) => {
          if (
            prev.length === detail.messages.length &&
            prev.every((m, i) => m.id === detail.messages[i].id && m.content === detail.messages[i].content)
          ) {
            return prev;
          }
          return detail.messages;
        });
        setAttachments((prev) =>
          prev.length === (detail.attachments || []).length ? prev : detail.attachments || [],
        );
        if (detail.linked_conversations) {
          setLinkedConversations(detail.linked_conversations);
        }
      } catch {
        // ignore transient polling failures
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedConversation?.id, isLoadingConversation, userRole]);

  // Handle initial conversation from URL
  useEffect(() => {
    const convId = params.id ? parseInt(Array.isArray(params.id) ? params.id[0] : params.id, 10) : null;
    if (convId && (!selectedConversation || selectedConversation.id !== convId)) {
      lastLoadedIdRef.current = convId;
      loadConversation(convId);
    }
  }, [params.id, selectedConversation, loadConversation]);

  // Auto-scroll messages only when user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSelectConversation = useCallback((conv: ConversationListItem) => {
    lastLoadedIdRef.current = conv.id;
    setSelectedConversation(conv);
    loadConversation(conv.id);
    // Update URL
    const basePath = userRole === 'admin' ? '/admin' : '/agent';
    router.push(`${basePath}/conversations/${conv.id}`);
  }, [router, userRole, loadConversation]);

  // Link & Merge handlers
  const handleLinkConversation = useCallback(async () => {
    if (!selectedConversation || !linkTargetId.trim()) return;
    const targetIdNum = parseInt(linkTargetId.trim(), 10);
    if (!targetIdNum || isNaN(targetIdNum)) {
      setError('Please enter a valid numeric conversation ID');
      return;
    }
    setIsLinking(true);
    setError(null);
    try {
      await agentApi.linkConversation(selectedConversation.id, targetIdNum);
      setShowLinkModal(false);
      setLinkTargetId('');
      const links = await agentApi.listLinks(selectedConversation.id);
      setLinkedConversations(links);
      await loadConversation(selectedConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link conversation');
    } finally {
      setIsLinking(false);
    }
  }, [selectedConversation, linkTargetId, loadConversation]);

  const handleUnlinkConversation = useCallback(async (targetId: number) => {
    if (!selectedConversation) return;
    try {
      await agentApi.unlinkConversation(selectedConversation.id, targetId);
      const links = await agentApi.listLinks(selectedConversation.id);
      setLinkedConversations(links);
      await loadConversation(selectedConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink conversation');
    }
  }, [selectedConversation, loadConversation]);

  const handleMergeConversation = useCallback(async () => {
    if (!selectedConversation || !mergeTargetId.trim() || !confirmMergeExplicit) return;
    const targetIdNum = parseInt(mergeTargetId.trim(), 10);
    if (!targetIdNum || isNaN(targetIdNum)) {
      setError('Please enter a valid numeric target conversation ID');
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
      await agentApi.mergeConversation(
        selectedConversation.id,
        targetIdNum,
        confirmCrossCustomer,
      );
      setShowMergeModal(false);
      setMergeTargetId('');
      setConfirmCrossCustomer(false);
      setConfirmMergeExplicit(false);
      await loadConversations();
      lastLoadedIdRef.current = targetIdNum;
      await loadConversation(targetIdNum);
      const basePath = userRole === 'admin' ? '/admin' : '/agent';
      router.push(`${basePath}/conversations/${targetIdNum}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge conversations');
    } finally {
      setIsMerging(false);
    }
  }, [selectedConversation, mergeTargetId, confirmCrossCustomer, confirmMergeExplicit, loadConversations, loadConversation, router, userRole]);

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
      const sentIsInternal = isInternal;
      const newMsg = await api.sendMessage(selectedConversation.id, {
        content: messageInput,
        is_internal: sentIsInternal,
        client_message_id: clientId,
      });
      setMessages(prev => [...prev, newMsg]);
      setMessageInput('');
      setIsInternal(false);

      // 5-second undo window for customer-facing agent messages
      if (!sentIsInternal && newMsg && newMsg.id) {
        setUndoMessage({ id: newMsg.id, timeLeft: 5 });
      }

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
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 sticky top-0 z-10">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar
                    name={selectedConversation.customer_name || 'Unknown'}
                    size="md"
                    className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex-shrink-0"
                  />
                  <div className="min-w-[120px] flex-1">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                      {selectedConversation.subject || 'No Subject'}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[160px]">{selectedConversation.customer_name || 'Unknown Customer'}</span>
                      <Badge variant="success" className="text-[10px] px-1 py-0 flex-shrink-0 inline-flex items-center">
                        <svg className="mr-0.5 h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Verified
                      </Badge>
                      {selectedConversation.customer_email && (
                        <>
                          <span className="flex-shrink-0">•</span>
                          <span className="truncate max-w-[200px]">{selectedConversation.customer_email}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink min-w-0">
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

                  {/* Status Dropdown (replaces Resolve button) */}
                  <div className="relative">
                    <Button
                      id="header-status-dropdown"
                      aria-label="Change conversation status"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowStatusMenu((v) => !v)}
                      className="capitalize inline-flex items-center"
                    >
                      <span
                        className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                          selectedConversation.status === 'open'
                            ? 'bg-blue-500'
                            : selectedConversation.status === 'pending'
                            ? 'bg-amber-500'
                            : selectedConversation.status === 'waiting_on_customer'
                            ? 'bg-purple-500'
                            : selectedConversation.status === 'on_hold'
                            ? 'bg-slate-500'
                            : selectedConversation.status === 'resolved' || selectedConversation.status === 'closed'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500'
                        }`}
                      />
                      {selectedConversation.status === 'waiting_on_customer'
                        ? 'Waiting on Customer'
                        : selectedConversation.status === 'on_hold'
                        ? 'On Hold'
                        : selectedConversation.status.charAt(0).toUpperCase() + selectedConversation.status.slice(1)}
                      <svg className="ml-1.5 h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>

                    {showStatusMenu && (
                      <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Change Status
                        </div>
                        {[
                          { key: 'open', label: 'Open', desc: 'Actively being handled', dot: 'bg-blue-500' },
                          { key: 'pending', label: 'Pending', desc: 'Waiting for assignment', dot: 'bg-amber-500' },
                          { key: 'waiting_on_customer', label: 'Waiting on Customer', desc: 'Waiting for customer reply', dot: 'bg-purple-500' },
                          { key: 'on_hold', label: 'On Hold', desc: 'Paused & unassigned', dot: 'bg-slate-500' },
                          { key: 'resolved', label: 'Resolved', desc: 'Issue marked resolved', dot: 'bg-emerald-500' },
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
                            className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                              selectedConversation.status === item.key
                                ? 'bg-slate-100 font-semibold text-blue-600 dark:bg-slate-800 dark:text-blue-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                              <div>
                                <p className="font-medium leading-none">{item.label}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{item.desc}</p>
                              </div>
                            </div>
                            {selectedConversation.status === item.key && (
                              <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-xs"
                      onClick={() => { setLinkTargetId(''); setShowLinkModal(true); }}
                      title="Link related conversation"
                    >
                      🔗 Link conversation
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-xs"
                      onClick={() => { setMergeTargetId(''); setConfirmCrossCustomer(false); setConfirmMergeExplicit(false); setShowMergeModal(true); }}
                      title="Merge duplicate conversation"
                      disabled={selectedConversation.status === 'merged' || Boolean(selectedConversation.merged_into_id)}
                    >
                      🔀 Merge conversation
                    </Button>
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

              {/* Merged Banner */}
              {selectedConversation.merged_into_id && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-4 py-2 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-700 dark:text-amber-300">MERGED:</span>
                    <span>This conversation was merged into <strong>#{selectedConversation.merged_into_id}</strong>.</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => handleSelectConversation({ id: selectedConversation.merged_into_id! } as ConversationListItem)}
                  >
                    View Conversation #{selectedConversation.merged_into_id} →
                  </Button>
                </div>
              )}

            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              ref={messagesContainerRef}
              role="log"
              aria-live="polite"
              onScroll={() => {
                const el = messagesContainerRef.current;
                if (el) {
                  isNearBottomRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) <= 150;
                }
              }}
            >
              {isLoadingConversation && messages.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-500 dark:text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-2xl mb-4">
                    💬
                  </div>
                  <p className="text-lg font-medium text-slate-900 dark:text-white">No messages yet</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Start the conversation by sending a message below</p>
                </div>
              ) : (
                <>
                  {isLoadingConversation && (
                    <div className="sticky top-0 z-10 flex items-center justify-center py-1 bg-blue-50/80 dark:bg-blue-900/30 backdrop-blur text-xs text-blue-600 dark:text-blue-400 border-b border-blue-100 dark:border-blue-800 rounded">
                      <span className="animate-pulse">Refreshing…</span>
                    </div>
                  )}
                  {messages.map((message) => {
                  const info = senderInfo(message);
                  const isSystemEvent =
                    message.message_type === 'system_event' || String(message.sender_type) === 'system';
                  if (isSystemEvent) {
                    return (
                      <div key={message.id} className="flex justify-center my-2">
                        <div className="max-w-[80%] rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-center text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {cleanDemoPrefix(message.content)}{' '}
                          <span className="text-slate-400 dark:text-slate-500">
                            {formatFullTimestamp(message.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // Retracted message display (visible only to agents/admins)
                  if (message.is_retracted) {
                    return (
                      <div key={message.id} className="flex justify-end my-1.5">
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-3 py-1.5 text-xs italic text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Message retracted
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 not-italic">
                              {formatTimestamp(message.retracted_at || message.created_at)}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const isInternalNote = message.message_type === 'internal_note' || message.is_internal;

                  // Requirement 4 & 5: Private Note (Internal collaboration card)
                  if (isInternalNote) {
                    const canEdit = userRole === 'admin' || (message.sender_id === userId);
                    return (
                      <div
                        key={message.id}
                        className="mx-auto my-2 w-full max-w-2xl rounded-lg border border-amber-200 bg-amber-50/90 p-3 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-1.5 mb-2 dark:border-amber-800/40">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                              <svg className="w-3 h-3 text-amber-700 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              PRIVATE NOTE / INTERNAL
                            </span>
                            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                              {message.sender_id === userId ? 'You' : (userRole === 'admin' ? 'Agent/Admin' : 'Colleague')}
                            </span>
                            {message.edited_at && (
                              <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80 italic">
                                (edited {formatTimestamp(message.edited_at)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <time className="text-[11px] text-amber-800/70 dark:text-amber-400/70">
                              {formatFullTimestamp(message.created_at)}
                            </time>
                            {canEdit && editingNoteId !== message.id && (
                              <button
                                type="button"
                                onClick={() => handleStartEditNote(message)}
                                className="text-xs font-medium text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100 underline ml-2"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>

                        {editingNoteId === message.id ? (
                          <div className="space-y-2 mt-2">
                            <textarea
                              value={editingNoteContent}
                              onChange={(e) => setEditingNoteContent(e.target.value)}
                              rows={3}
                              className="w-full rounded border border-amber-300 bg-white p-2 text-xs text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-100"
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={handleCancelEditNote}
                                disabled={savingNoteEdit}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() => handleSaveEditNote(message.id)}
                                disabled={savingNoteEdit || !editingNoteContent.trim()}
                              >
                                {savingNoteEdit ? 'Saving...' : 'Save'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs leading-relaxed text-amber-950 dark:text-amber-100 whitespace-pre-wrap">
                            {message.content.split(/(@[a-zA-Z0-9_\s.-]+?)(?=[,\.!?\s]|$)/g).map((part, i) =>
                              part.startsWith('@') ? (
                                <span key={i} className="inline-flex items-center rounded bg-amber-200/80 px-1 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                                  {part}
                                </span>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isAiMessage = info.name === 'AI Assistant' || String(message.sender_type) === 'ai';
                  const isAgent = message.sender_type === 'agent' || info.align === 'right';

                  // Requirement 5: WhatsApp-style alignment
                  // Customer or AI: Aligned to LEFT
                  if (!isAgent) {
                    return (
                      <div key={message.id} className="flex gap-3 justify-start items-start">
                        {isAiMessage ? (
                          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40">
                            <svg className="h-4 w-4 text-purple-700 dark:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                        ) : (
                          <Avatar
                            name={selectedConversation?.customer_name || 'Customer'}
                            size="sm"
                            className="bg-slate-400 text-white flex-shrink-0"
                          />
                        )}
                        <div className="max-w-[75%]">
                          <div className="mb-1 flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isAiMessage ? 'text-purple-700 dark:text-purple-300' : 'text-slate-800 dark:text-slate-200'}`}>
                              {isAiMessage ? 'AI Assistant' : (selectedConversation?.customer_name || 'Customer')}
                            </span>
                            {isAiMessage && (
                              <Badge variant="info" className="text-[10px]">
                                AI
                              </Badge>
                            )}
                            <time className="text-[11px] text-slate-400 dark:text-slate-500">
                              {formatTimestamp(message.created_at)}
                            </time>
                          </div>
                          <div className={`rounded-lg rounded-tl-none p-3 shadow-sm text-sm ${
                            isAiMessage
                              ? 'border border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-100'
                              : 'border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                          }`}>
                            {isAiMessage && String(message.content).startsWith('[DEMO AI]') && (
                              <Badge variant="info" className="mr-1 text-[10px]">
                                Demo
                              </Badge>
                            )}
                            <div className="whitespace-pre-wrap">{cleanDemoPrefix(message.content)}</div>
                            {message.original_conversation_id && message.original_conversation_id !== selectedConversation?.id && (
                              <span className="block mt-1 text-[10px] text-slate-400 italic">
                                (merged from #{message.original_conversation_id})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Agent: Aligned to RIGHT (WhatsApp style)
                  const isCurrentUser = message.sender_id === userId;
                  const agentDisplayName = isCurrentUser ? 'You' : (userRole === 'admin' ? 'Agent' : 'Staff');

                  return (
                    <div key={message.id} className="flex gap-3 justify-end items-start">
                      <div className="max-w-[75%] flex flex-col items-end">
                        <div className="mb-1 flex items-center gap-2">
                          <time className="text-[11px] text-slate-400 dark:text-slate-500">
                            {formatTimestamp(message.created_at)}
                          </time>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {agentDisplayName}
                          </span>
                        </div>
                        <div className="rounded-lg rounded-tr-none bg-blue-600 text-white p-3 shadow-sm text-sm whitespace-pre-wrap">
                          {message.content}
                          {message.original_conversation_id && message.original_conversation_id !== selectedConversation?.id && (
                            <span className="block mt-1 text-[10px] text-blue-200 italic">
                              (merged from #{message.original_conversation_id})
                            </span>
                          )}
                        </div>
                      </div>
                      <Avatar
                        name={agentDisplayName}
                        size="sm"
                        className="bg-blue-600 text-white flex-shrink-0"
                      />
                    </div>
                  );
                })}
              </>
            )}
              <div ref={messagesEndRef} />
            </div>

            {/* Requirement 6: 5-Second Undo Toast Banner */}
            {undoMessage && undoMessage.timeLeft > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg shadow-lg border border-slate-700 dark:border-slate-300 mx-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2.5 text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Message sent to customer. Undo window: <strong>{undoMessage.timeLeft}s</strong></span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="h-6 px-2.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={() => handleUndoMessage(undoMessage.id)}
                >
                  Undo
                </Button>
              </div>
            )}

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

                 {/* Linked Conversations */}
                 <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                   <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                     <span>Linked Conversations ({linkedConversations.length})</span>
                     <Button
                       variant="ghost"
                       size="sm"
                       className="h-6 text-[11px] px-2"
                       onClick={() => { setLinkTargetId(''); setShowLinkModal(true); }}
                     >
                       + Link conversation
                     </Button>
                   </div>
                   <div className="mt-2 space-y-2 text-xs">
                     {linkedConversations.length === 0 ? (
                       <p className="text-slate-400 dark:text-slate-500 italic py-1">No linked conversations</p>
                     ) : (
                       linkedConversations.map((link) => (
                         <div
                           key={link.id}
                           className="flex items-center justify-between gap-2 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                         >
                           <button
                             type="button"
                             onClick={() => handleSelectConversation({ id: link.linked_conversation_id } as ConversationListItem)}
                             className="text-left font-medium text-blue-600 dark:text-blue-400 hover:underline truncate"
                             title={`Go to conversation #${link.linked_conversation_id}`}
                           >
                             #{link.linked_conversation_id} • {link.subject || link.customer_name || 'Conversation'}
                             <span className="block text-[10px] text-slate-400 font-normal">
                               Status: {link.status}
                             </span>
                           </button>
                           <Button
                             variant="ghost"
                             size="sm"
                             className="h-5 px-1.5 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                             onClick={() => handleUnlinkConversation(link.linked_conversation_id)}
                             title="Unlink"
                           >
                             Unlink
                           </Button>
                         </div>
                       ))
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

      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Link Related Conversation</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowLinkModal(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Linking connects two conversations so agents can quickly navigate between them. Histories and messages remain separate.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Conversation ID
                </label>
                <Input
                  value={linkTargetId}
                  onChange={(e) => setLinkTargetId(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLinkConversation();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={() => setShowLinkModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleLinkConversation} disabled={isLinking || !linkTargetId.trim()}>
                  {isLinking ? 'Linking...' : 'Link conversation'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMergeModal && (() => {
        const targetConv = conversations.find(c => String(c.id) === mergeTargetId.trim());
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-lg w-full">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Merge Conversation</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowMergeModal(false)}>
                  ✕
                </Button>
              </div>
              <div className="p-4 space-y-4">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
                  <strong>Warning:</strong> All messages, notes, and attachments from this conversation (#{selectedConversation?.id}) will be moved into the target conversation. This conversation will be permanently marked as <strong>Merged</strong> and closed for new replies.
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Target Conversation ID to Merge Into
                  </label>
                  <Input
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    placeholder="e.g. 101"
                    className="w-full"
                  />
                </div>

                {/* Source & Target Comparison Details */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Merge Comparison</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-slate-900 dark:text-white mb-1">Source (Will be Closed)</div>
                      <div className="text-slate-600 dark:text-slate-400"><strong>ID:</strong> #{selectedConversation?.id}</div>
                      <div className="text-slate-600 dark:text-slate-400 truncate"><strong>Subject:</strong> {selectedConversation?.subject || 'No subject'}</div>
                      <div className="text-slate-600 dark:text-slate-400 truncate"><strong>Customer:</strong> {selectedConversation?.customer_name || 'Customer'} {selectedConversation?.customer_email ? `(${selectedConversation.customer_email})` : ''}</div>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-slate-900 dark:text-white mb-1">Target (Will Receive Messages)</div>
                      <div className="text-slate-600 dark:text-slate-400"><strong>ID:</strong> {mergeTargetId.trim() ? `#${mergeTargetId.trim()}` : '—'}</div>
                      <div className="text-slate-600 dark:text-slate-400 truncate"><strong>Subject:</strong> {targetConv?.subject || (mergeTargetId.trim() ? 'Target conversation' : '—')}</div>
                      <div className="text-slate-600 dark:text-slate-400 truncate"><strong>Customer:</strong> {targetConv ? `${targetConv.customer_name} (${targetConv.customer_email || 'No email'})` : (mergeTargetId.trim() ? 'Verified on merge' : '—')}</div>
                    </div>
                  </div>
                </div>

                {/* Explicit confirmation requirement */}
                <div className="flex items-start gap-2 pt-1 p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40">
                  <input
                    id="confirm-merge-explicit"
                    type="checkbox"
                    checked={confirmMergeExplicit}
                    onChange={(e) => setConfirmMergeExplicit(e.target.checked)}
                    className="mt-0.5 rounded border-red-300 text-red-600 focus:ring-red-500"
                  />
                  <label htmlFor="confirm-merge-explicit" className="text-xs text-red-900 dark:text-red-200 font-medium cursor-pointer">
                    I confirm that I want to merge Source #{selectedConversation?.id} into Target #{mergeTargetId.trim() || '___'}, moving all messages and closing Source #{selectedConversation?.id}.
                  </label>
                </div>

                <div className="flex items-start gap-2 pt-1">
                  <input
                    id="confirm-cross-customer"
                    type="checkbox"
                    checked={confirmCrossCustomer}
                    onChange={(e) => setConfirmCrossCustomer(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="confirm-cross-customer" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    Confirm cross-customer merge (if target conversation belongs to a different customer account, administrator permission required)
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <Button variant="secondary" onClick={() => setShowMergeModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleMergeConversation}
                    disabled={isMerging || !mergeTargetId.trim() || !confirmMergeExplicit}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isMerging ? 'Merging...' : 'Merge conversation'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
