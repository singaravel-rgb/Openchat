'use client';


import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { agentApi } from '@/lib/api';
import type { ConversationListItem } from '@/lib/types';


interface ContactRow {
  customer_id: number;
  name: string;
  email: string;
  conversation_count: number;
  open_count: number;
  last_activity: string;
  latest_conversation_id: number;
  latest_subject: string;
  channels: string[];
}

function formatDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function AgentContactsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await agentApi.listConversations(undefined, undefined, undefined);
        if (active) setConversations(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load contacts');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const contacts = useMemo<ContactRow[]>(() => {
    const map = new Map<number, ContactRow>();
    for (const c of conversations) {
      const key = c.customer_id;
      const existing = map.get(key);
      const activity = c.last_message_at || c.updated_at;
      if (!existing) {
        map.set(key, {
          customer_id: key,
          name: c.customer_name || 'Unknown Customer',
          email: c.customer_email || '',
          conversation_count: 1,
          open_count: c.status === 'resolved' || c.status === 'closed' ? 0 : 1,
          last_activity: activity,
          latest_conversation_id: c.id,
          latest_subject: c.subject || 'No Subject',
          channels: c.channel ? [c.channel] : [],
        });
      } else {
        existing.conversation_count += 1;
        if (c.status !== 'resolved' && c.status !== 'closed') existing.open_count += 1;
        if (c.channel && !existing.channels.includes(c.channel)) existing.channels.push(c.channel);
        if (new Date(activity).getTime() > new Date(existing.last_activity).getTime()) {
          existing.last_activity = activity;
          existing.latest_conversation_id = c.id;
          existing.latest_subject = c.subject || 'No Subject';
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime(),
    );
  }, [conversations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Contacts</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Customers you are handling, built from your conversation queues.
            </p>
          </div>
          <div className="w-full sm:w-72">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              aria-label="Search contacts"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && (
            <div className="col-span-full flex items-center justify-center py-10 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No contacts found.
            </div>
          )}

          {filtered.map((contact) => (
            <div
              key={contact.customer_id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700"
            >
              <div className="flex items-start gap-3">
                <Avatar name={contact.name} size="md" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{contact.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{contact.email || 'No email'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="default" className="text-[10px]">
                      {contact.conversation_count} conversation{contact.conversation_count === 1 ? '' : 's'}
                    </Badge>
                    {contact.open_count > 0 && (
                      <Badge variant="warning" className="text-[10px]">
                        {contact.open_count} open
                      </Badge>
                    )}
                    {contact.channels.map((ch) => (
                      <Badge key={ch} variant="info" className="text-[10px] capitalize">
                        {ch}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                <p className="truncate text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 dark:text-slate-500">Latest: </span>
                  {contact.latest_subject}
                </p>
                <p className="text-slate-400 dark:text-slate-500">{formatDate(contact.last_activity)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => router.push(`/agent/conversations/${contact.latest_conversation_id}`)}
              >
                Open conversation
              </Button>
            </div>
          ))}
        </div>
      </div>
    
  );
}