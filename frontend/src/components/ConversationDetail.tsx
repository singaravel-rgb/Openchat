'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import type { ConversationDetail, Message, AdminAgent } from '@/lib/types';
import { agentApi, adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/Card';
import { Badge, getStatusBadgeVariant } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { useAuth } from '@/context/AuthContext';
import { SLATimer } from '@/components/SLATimer';

interface AgentListItem {
  id: number;
  full_name: string;
  email: string;
}

interface ConversationDetailProps {
  conversation: ConversationDetail & { assigned_agent_name?: string };
  onUpdate: (conversation: ConversationDetail & { assigned_agent_name?: string }) => void;
  mode?: 'agent' | 'admin';
}

export function ConversationDetailView({ conversation, onUpdate, mode }: ConversationDetailProps) {
  const { user } = useAuth();
  const resolvedMode = mode || (user?.role === 'admin' ? 'admin' : 'agent');
  const api = resolvedMode === 'admin' ? adminApi : agentApi;

  const [messages, setMessages] = useState<Message[]>(conversation.messages);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slaStatus, setSlaStatus] = useState<import('@/lib/types').SLAStatus | null>(null);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [editSubject, setEditSubject] = useState(conversation.subject || '');
  const [editPriority, setEditPriority] = useState(conversation.priority || 'normal');
  const [editTags, setEditTags] = useState((conversation.tags || []).join(', '));
  const [assignAgentId, setAssignAgentId] = useState<string>(conversation.assigned_agent_id ? String(conversation.assigned_agent_id) : '');
  const [resolutionDetails, setResolutionDetails] = useState(conversation.resolution_details || '');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMessages(conversation.messages || []);
    setEditSubject(conversation.subject || '');
    setEditPriority(conversation.priority || 'normal');
    setEditTags((conversation.tags || []).join(', '));
    setAssignAgentId(conversation.assigned_agent_id ? String(conversation.assigned_agent_id) : '');
    setResolutionDetails(conversation.resolution_details || '');
  }, [conversation]);

  useEffect(() => {
    const fetchSLAStatus = async () => {
      try {
        const status = await (agentApi.getConversationSLAStatus?.(conversation.id) || adminApi.getConversationSLAStatus(conversation.id));
        if (status) setSlaStatus(status as any);
      } catch (err) { /* ignore */ }
    };
    fetchSLAStatus();
    const interval = setInterval(fetchSLAStatus, 30000);
    return () => clearInterval(interval);
  }, [conversation.id]);

  useEffect(() => {
    if (resolvedMode === 'admin') {
      agentApi.listAgents().then(setAgents).catch(() => {});
    }
  }, [resolvedMode]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const updated = await api.getConversation(conversation.id);
        setMessages((updated as any).messages || []);
        onUpdate(updated as any);
      } catch (err) { console.error('Failed to poll conversation:', err); }
    }, 15000);
    return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, [conversation.id, onUpdate, resolvedMode]);

  const refresh = async () => {
    const updated = await api.getConversation(conversation.id);
    setMessages((updated as any).messages || []);
    onUpdate(updated as any);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;
    setIsSending(true); setError(null);
    try {
      const clientId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const message = await api.sendMessage(conversation.id, { content: newMessage, is_internal: isInternal, client_message_id: clientId });
      setMessages((prev) => [...prev, message as any]);
      setNewMessage(''); setIsInternal(false);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send message'); }
    finally { setIsSending(false); }
  };

  const runAction = async (fn: () => Promise<any>) => {
    setIsLoading(true); setError(null);
    try { await fn(); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
    finally { setIsLoading(false); }
  };

  const handleTake = () => runAction(() => (api as any).takeConversation(conversation.id));
  const handleResolve = () => runAction(() => resolvedMode === 'admin'
    ? adminApi.updateConversationStatus(conversation.id, 'resolved', resolutionDetails || undefined)
    : (agentApi as any).resolveConversation(conversation.id, resolutionDetails || undefined));
  const handleClose = () => runAction(() => resolvedMode === 'admin'
    ? adminApi.updateConversationStatus(conversation.id, 'closed', resolutionDetails || undefined)
    : (agentApi as any).closeConversation(conversation.id, resolutionDetails || undefined));
  const handleReopen = () => runAction(() => (api as any).reopenConversation(conversation.id));

  const handleSaveProps = () => runAction(async () => {
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    await (api as any).updateConversation(conversation.id, { subject: editSubject, priority: editPriority, tags });
  });

  const handleAssign = () => runAction(async () => {
    const aid = assignAgentId === '' ? null : parseInt(assignAgentId, 10);
    if (resolvedMode === 'admin') await adminApi.assignConversation(conversation.id, aid);
    else await (agentApi as any).assignConversation(conversation.id, aid);
  });

  const getSenderInfo = (message: Message) => {
    switch (message.sender_type) {
      case 'customer': return { name: 'Customer', variant: 'customer' as const, color: 'bg-slate-500' };
      case 'agent': return { name: 'Agent', variant: 'agent' as const, color: 'bg-indigo-500' };
      case 'ai': return { name: 'AI Assistant', variant: 'ai' as const, color: 'bg-purple-500' };
      case 'system': return { name: 'System', variant: 'system' as const, color: 'bg-orange-500' };
      default: return { name: 'Unknown', variant: 'default' as const, color: 'bg-slate-500' };
    }
  };

  const isCurrentUser = (message: Message) => message.sender_id === user?.id;
  const canReply = conversation.status !== 'closed' && conversation.status !== 'resolved';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={String(conversation.customer_id)} size="lg" />
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Conversation #{conversation.id}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={getStatusBadgeVariant(conversation.status)}>{conversation.status.replace('_', ' ')}</Badge>
                  <Badge variant={conversation.priority === 'high' || conversation.priority === 'urgent' ? 'warning' : 'default'}>{conversation.priority || 'normal'}</Badge>
                  {conversation.assigned_agent_id && <Badge variant="primary">Agent #{conversation.assigned_agent_id}</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(conversation.status === 'ai_handling' || conversation.status === 'pending') && resolvedMode === 'agent' && (
                <Button size="sm" onClick={handleTake} disabled={isLoading}>Take</Button>
              )}
              {conversation.status !== 'resolved' && conversation.status !== 'closed' && (
                <>
                  <Button variant="success" size="sm" onClick={handleResolve} disabled={isLoading}>Resolve</Button>
                  <Button variant="outline" size="sm" onClick={handleClose} disabled={isLoading}>Close</Button>
                </>
              )}
              {(conversation.status === 'resolved' || conversation.status === 'closed') && (
                <Button variant="outline" size="sm" onClick={handleReopen} disabled={isLoading}>Reopen</Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Input label="Subject" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
              <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value="low">low</option><option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option>
              </select>
            </div>
            <Input label="Tags (comma separated)" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
            <div className="flex items-end"><Button variant="outline" size="sm" onClick={handleSaveProps} disabled={isLoading}>Save Properties</Button></div>
          </div>

          {resolvedMode === 'admin' && (
            <div className="grid gap-3 md:grid-cols-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assign Agent</label>
                <select value={assignAgentId} onChange={(e) => setAssignAgentId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <option value="">Unassigned (queue)</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
              <div className="md:col-span-1"><Button variant="outline" size="sm" onClick={handleAssign} disabled={isLoading}>Update Assignment</Button></div>
              <Input label="Resolution details" value={resolutionDetails} onChange={(e) => setResolutionDetails(e.target.value)} placeholder="Optional summary for resolve/close" />
            </div>
          )}

          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-4">
            <span>Channel: {conversation.channel}</span>
            <span>Created: {format(new Date(conversation.created_at), 'PPpp')}</span>
            <span>Updated: {format(new Date(conversation.updated_at), 'PPpp')}</span>
            {conversation.resolved_at && <span>Resolved: {format(new Date(conversation.resolved_at), 'PPpp')}</span>}
            {conversation.closed_at && <span>Closed: {format(new Date(conversation.closed_at), 'PPpp')}</span>}
          </div>
        </CardContent>
      </Card>

      <SLATimer status={slaStatus} />

      <Card className="overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">Messages</h3></CardHeader>
        <div className="overflow-y-auto p-4 space-y-4 max-h-[55vh]" role="log" aria-live="polite">
          {messages.map((message) => {
            const senderInfo = getSenderInfo(message);
            const isInternalMsg = message.is_internal;
            const isSystem = message.sender_type === 'system';
            return (
              <div key={message.id} className={`flex gap-3 ${isCurrentUser(message) ? 'flex-row-reverse' : ''} ${isInternalMsg ? 'opacity-80' : ''}`}>
                {!isCurrentUser(message) && !isSystem && <Avatar name={senderInfo.name} size="sm" className={senderInfo.color} />}
                <div className={`flex-1 max-w-[75%] ${isCurrentUser(message) ? 'text-right' : ''}`}>
                  {!isSystem && (
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{senderInfo.name}</span>
                      <Badge variant={senderInfo.variant} className="text-xs">{senderInfo.name}</Badge>
                      {isInternalMsg && <Badge variant="warning" className="text-xs">Internal</Badge>}
                      <time className="text-xs text-slate-500 dark:text-slate-400">{format(new Date(message.created_at), 'HH:mm:ss')}</time>
                      {message.delivery_status && <span className="text-[10px] text-slate-400">{message.delivery_status}</span>}
                    </div>
                  )}
                  <div className={`p-3 rounded-lg ${isInternalMsg ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100' : isSystem ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm' : isCurrentUser(message) ? 'bg-blue-600 text-white' : message.sender_type === 'ai' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`}>
                    {message.content}
                  </div>
                </div>
                {isCurrentUser(message) && !isSystem && <Avatar name={user?.full_name || 'You'} size="sm" className="bg-blue-600" />}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <CardFooter className="p-4 border-t border-slate-200 dark:border-slate-800 block">
          {error && <div className="mb-3 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">{error}</div>}
          {canReply ? (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={isInternal ? 'Internal note (customer will not see this)...' : 'Type your reply...'} rows={2}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="w-4 h-4 text-blue-600 border-slate-300 rounded" /> Internal
                </label>
                <Button onClick={handleSend} disabled={isSending || !newMessage.trim()} size="lg">{isSending ? 'Sending...' : 'Send'}</Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400">Conversation is {conversation.status}. Reopen to continue messaging.</div>
          )}
        </CardFooter>
      </Card>

      {conversation.assignment_history && conversation.assignment_history.length > 0 && (
        <Card>
          <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">Assignment History</h3></CardHeader>
          <CardContent className="p-4">
            <AssignmentTimeline history={conversation.assignment_history as unknown as AssignmentHistoryItem[]} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface AssignmentHistoryItem {
  action: string;
  agent_id?: number;
  agent_name?: string;
  from_agent_id?: number;
  from_agent_name?: string;
  to_agent_id?: number;
  to_agent_name?: string;
  reason?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

function AssignmentTimeline({ history }: { history: AssignmentHistoryItem[] }) {
  const sortedHistory = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const getActionIcon = (action: string | undefined | null) => {
    if (!action) return '📝';
    switch (action) {
      case 'assigned': return '👤';
      case 'reassigned': return '🔄';
      case 'unassigned': return '📤';
      case 'taken': return '✋';
      case 'escalated': return '📈';
      case 'handoff': return '🤝';
      case 'status_changed': return '🔄';
      default: return '📝';
    }
  };

  const getActionLabel = (action: string | undefined | null) => {
    if (!action) return 'Unknown action';
    switch (action) {
      case 'assigned': return 'Assigned to agent';
      case 'reassigned': return 'Reassigned';
      case 'unassigned': return 'Unassigned (returned to queue)';
      case 'taken': return 'Taken by agent';
      case 'escalated': return 'Escalated';
      case 'handoff': return 'Handoff from AI';
      case 'status_changed': return 'Status changed';
      default: return action.replace('_', ' ');
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      return format(new Date(ts), 'PPpp');
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-4">
      {sortedHistory.map((item, index) => (
        <div key={index} className="relative pl-6 pb-4 border-l border-slate-200 dark:border-slate-700 last:border-0 last:pb-0">
          <div className="absolute left-0 top-0 w-2 h-2 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 -ml-2" />
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-lg">
              {getActionIcon(item.action)}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900 dark:text-white">{getActionLabel(item.action)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatTimestamp(item.timestamp)}</span>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {item.agent_name && (
                  <span className="font-medium">{item.agent_name}</span>
                )}
                {item.from_agent_name && item.to_agent_name && (
                  <>
                    <span className="font-medium">{item.from_agent_name}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium">{item.to_agent_name}</span>
                  </>
                )}
                {item.reason && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">— {item.reason}</span>
                )}
              </div>
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">Details</summary>
                  <pre className="mt-1 text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded text-slate-600 dark:text-slate-300 overflow-auto">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
