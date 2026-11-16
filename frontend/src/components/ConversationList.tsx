'use client';

import { formatDistanceToNow } from 'date-fns';
import { ConversationListItem } from '@/lib/types';
import { Card, CardContent } from '@/components/Card';
import { Badge, getStatusBadgeVariant } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import Link from 'next/link';

interface ConversationListProps {
  conversations: ConversationListItem[];
  emptyMessage?: string;
  currentUserId?: number;
  hrefBase?: string;
}

export function ConversationList({ conversations, emptyMessage = 'No conversations found', currentUserId, hrefBase = '/agent/conversations' }: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg className="w-16 h-16 text-slate-300 dark:text-slate-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`${hrefBase}/${conversation.id}`}
          className="block"
        >
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={conversation.customer_name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                          {conversation.customer_name}
                        </h3>
                        <Badge variant={getStatusBadgeVariant(conversation.status)}>
                          {conversation.status.replace('_', ' ')}
                        </Badge>
                        {conversation.priority && conversation.priority !== 'normal' && (
                          <Badge variant={conversation.priority === 'high' || conversation.priority === 'urgent' ? 'warning' : 'default'}>
                            {conversation.priority}
                          </Badge>
                        )}
                        {conversation.unread_count > 0 && (
                          <Badge variant="danger">{conversation.unread_count} unread</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-1">
                        {conversation.customer_email}
                      </p>
                      {conversation.tags && conversation.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {conversation.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      {conversation.last_message_at && (
                        <time className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                        </time>
                      )}
                      {conversation.assigned_agent_name && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ? {conversation.assigned_agent_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {conversation.last_message && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {conversation.last_message}
                    </p>
                  )}
                  {conversation.subject && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Subject: {conversation.subject}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
