'use client';

import { useEffect, useMemo, useState } from 'react';
import { customerApi } from '@/lib/api';
import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { format } from 'date-fns';
import Script from 'next/script';

interface HelpFAQ {
  id: number;
  question: string;
  answer: string;
  category?: string | { name?: string } | null;
  show_chat_action?: boolean;
  chat_action_text?: string | null;
}

interface HelpConversation {
  id: number;
  subject?: string | null;
  status: string;
  updated_at: string;
  last_message?: string | null;
}

interface HelpPageData {
  active_conversations: HelpConversation[];
  faqs: HelpFAQ[];
  widget?: { hide_launcher_on_help_page?: boolean };
}

export default function HelpPage() {
  const [data, setData] = useState<HelpPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  useEffect(() => {
    fetchHelpPage();
  }, []);

  const fetchHelpPage = async () => {
    setIsLoading(true);
    try {
      // public FAQ endpoints are readable without auth
      const faqs = await customerApi.listFAQs({ limit: 50 }).catch(() => []);
      setData({ active_conversations: [], faqs: faqs as any });
    } catch (err) {
      try {
        const faqs = await customerApi.listFAQs({ limit: 50 }).catch(() => []);
        setData({ active_conversations: [], faqs: faqs as any });
      } catch {
        setError(err instanceof Error ? err.message : 'Failed to load help page');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const categoryName = (f: HelpFAQ) => typeof f.category === 'string' ? (f.category || 'General') : (f.category?.name || 'General');

  const categories = useMemo(() => {
    const names = new Set<string>(['All']);
    (data?.faqs || []).forEach(f => names.add(categoryName(f)));
    return Array.from(names);
  }, [data]);

  const filteredFAQs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (data?.faqs || []).filter(faq => {
      const cat = categoryName(faq);
      if (activeCategory !== 'All' && cat !== activeCategory) return false;
      if (!q) return true;
      return faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [data, searchQuery, activeCategory]);

  const handleStartChat = () => {
    // Trigger the widget to open if it's embedded on this page
    if (typeof window !== 'undefined') {
      const launchBtn = document.querySelector('#ocw-launch') as HTMLElement;
      if (launchBtn) {
        launchBtn.click();
      } else {
        // Widget not loaded - show a message or redirect to a contact page
        alert('Chat widget is not available on this page. Please check the widget configuration.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Script
        strategy="lazyOnload"
        src="http://localhost:8000/api/v1/widget/embed.js"
        id="openchat-widget-script"
      />
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Help & Support</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Browse FAQs or start a conversation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleStartChat}>New Conversation</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && <div className="mb-6 p-4 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">{error}</div>}

        {/* FAQs */}
        <section className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
            <div className="flex-1 max-w-xl">
              <Input placeholder="Search FAQs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="text-sm text-slate-500">Launcher can be hidden on this page via widget settings.</div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-3 py-1.5 rounded-full text-sm border ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>{cat}</button>
            ))}
          </div>

          <div className="space-y-6">
            {(() => {
              const byCat = new Map<string, HelpFAQ[]>();
              filteredFAQs.forEach(f => { const c = categoryName(f); if (!byCat.has(c)) byCat.set(c, []); byCat.get(c)!.push(f); });
              const catNames = Array.from(byCat.keys());
              if (catNames.length === 0) {
                return (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <p>No FAQs found matching your search.</p>
                    <Button variant="outline" className="mt-4" onClick={handleStartChat}>Start a conversation instead</Button>
                  </div>
                );
              }
              return catNames.map((catName) => (
                <div key={catName} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700"><h3 className="font-semibold text-slate-900 dark:text-white">{catName}</h3></div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {byCat.get(catName)!.map((faq) => (
                      <details key={faq.id} className="group p-4">
                        <summary className="flex items-center justify-between cursor-pointer list-none">
                          <span className="font-medium text-slate-900 dark:text-white pr-8">{faq.question}</span>
                          <svg className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </summary>
                        <div className="mt-4 text-slate-600 dark:text-slate-300 prose prose-sm max-w-none"><p className="whitespace-pre-wrap">{faq.answer}</p></div>
                        {faq.show_chat_action && (
                          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <Button variant="outline" size="sm" onClick={handleStartChat}>{faq.chat_action_text || 'Chat with us'}</Button>
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>

        <section className="text-center">
          <Card>
            <CardContent className="p-8">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Still need help?</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Can&apos;t find what you&apos;re looking for? Start a conversation and our AI will assist you first.</p>
              <Button size="lg" onClick={handleStartChat}>Start a Conversation</Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}