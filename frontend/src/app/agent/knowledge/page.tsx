'use client';


import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { customerApi } from '@/lib/api';


interface SearchHit {
  type: string;
  id: number;
  title: string;
  content: string;
  excerpt?: string | null;
  category?: string | null;
}

export default function AgentKnowledgePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const data = await customerApi.searchKnowledge(query.trim(), 15);
        if (active) setHits(data);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Search failed');
          setHits([]);
        }
      } finally {
        if (active) setIsSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Knowledge Base</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Search published articles and FAQs to answer customers faster.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search knowledge base (min 2 characters)..."
              aria-label="Search knowledge base"
            />
          </div>
          <Button variant="outline" onClick={() => router.push('/help')}>
            Open help centre
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {query.trim().length < 2 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Type at least two characters to search articles and FAQs.
          </div>
        )}

        {isSearching && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {!isSearching && query.trim().length >= 2 && hits.length === 0 && !error && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No results for &ldquo;{query}&rdquo;.
          </div>
        )}

        <div className="space-y-2">
          {hits.map((hit, index) => (
            <div
              key={`${hit.type}-${hit.id}-${index}`}
              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{hit.title}</p>
                <Badge variant={hit.type === 'faq' ? 'info' : 'default'} className="text-[10px] uppercase">
                  {hit.type}
                </Badge>
              </div>
              {hit.category && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hit.category}</p>
              )}
              <p className="mt-1 line-clamp-3 text-xs text-slate-600 dark:text-slate-300">
                {hit.excerpt || hit.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    
  );
}