'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar, createNavigation } from '@/components/Sidebar';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { NotificationBell } from '@/components/NotificationBell';
import { useRouter, usePathname } from 'next/navigation';
import type { User } from '@/lib/types';

interface AgentLayoutProps {
  children: ReactNode;
  fullScreen?: boolean;
}

export function AgentLayout({ children, fullScreen = false }: AgentLayoutProps) {
  const { user, isLoading, logout, sessionExpired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  useEffect(() => {
    setMounted(true);
    if (!isLoading && !user) {
      router.push('/login');
    } else if (user && user.role === 'customer') {
      router.push('/customer');
    } else if (user && user.role === 'admin' && pathname.startsWith('/agent')) {
      router.push('/admin');
    }
  }, [user, isLoading, router, pathname]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (sessionExpired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-16 h-16 rounded-full bg-amber-900/30 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Session Expired</h1>
        <p className="text-slate-400 mb-6 max-w-md text-center">Your session has expired. Please log in again to continue.</p>
        <button
          onClick={() => {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
          }}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (!user || (user.role !== 'agent' && user.role !== 'admin')) {
    router.push('/login');
    return null;
  }

  const navigation = createNavigation(user);

  const getPageTitle = (path: string): string => {
    if (path === '/agent') return 'Inbox';
    if (path === '/agent/pending') return 'Pending';
    if (path === '/agent/assigned') return 'Assigned';
    if (path === '/agent/resolved') return 'Resolved';
    if (path === '/admin') return 'Dashboard';
    if (path === '/admin/reports') return 'Reports';
    if (path === '/admin/sla') return 'SLA Configurations';
    if (path === '/admin/agents') return 'Agents';
    if (path === '/admin/conversations') return 'All Conversations';
    if (path === '/admin/categories') return 'Categories';
    if (path === '/admin/articles') return 'Articles';
    if (path === '/admin/faqs') return 'FAQs';
    if (path === '/admin/settings') return 'General Settings';
    if (path === '/admin/settings/ai') return 'AI Configuration';
    if (path === '/admin/settings/widget') return 'Chat Widget Configuration';
    if (path === '/admin/settings/rules') return 'Assignment Rules';
    if (path === '/admin/settings/notifications') return 'Notification Settings';
    if (path.startsWith('/agent/conversations/')) return 'Conversation';
    if (path.startsWith('/admin/conversations/')) return 'Conversation';
    return 'OpenChat';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar user={user} navigation={navigation} />
      <div className="lg:ml-64" style={{ minHeight: '100vh' }}>
        {!fullScreen && (
          <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {getPageTitle(pathname)}
                </h1>
                <div className="hidden sm:block sm:w-64">
                  <Input
                    placeholder="Search conversations..."
                    value={globalSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGlobalSearch(e.target.value)}
                    className="flex-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm placeholder-slate-400 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <NotificationBell />
                <Button variant="ghost" size="sm" onClick={logout}>
                  Logout
                </Button>
              </div>
            </div>
          </header>
        )}
        <main className={`${fullScreen ? 'h-[calc(100vh)]' : 'p-6'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}