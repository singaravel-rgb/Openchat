'use client';

import { ReactNode, useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Sidebar, createNavigation } from '@/components/Sidebar';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Avatar } from '@/components/Avatar';
import { NotificationBell } from '@/components/NotificationBell';
import { agentApi, conversationApi } from '@/lib/api';
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
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean>(user?.agent_profile?.is_available ?? false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    if (user?.agent_profile?.is_available !== undefined) {
      setIsAvailable(user.agent_profile.is_available);
    }
  }, [user?.agent_profile?.is_available]);

  const handleAvailabilityToggle = async () => {
    if (user?.role !== 'agent' || availabilityLoading) return;
    const next = !isAvailable;
    setAvailabilityLoading(true);
    setIsAvailable(next);
    try {
      await agentApi.setAvailability(next);
    } catch (err) {
      setIsAvailable(!next);
      console.error('Failed to toggle availability:', err);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (!isLoading && !user) {
      router.push('/login');
    } else if (user && user.role === 'customer') {
      router.push('/customer');
    } else if (user && (user.role === 'admin' || user.role === 'super_admin') && pathname === '/agent') {
      router.push('/admin/conversations');
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

  if (!user || (user.role !== 'agent' && user.role !== 'admin' && user.role !== 'super_admin')) {
    router.push('/login');
    return null;
  }

  const navigation = createNavigation(user);

  // Workspace routes own the full viewport below the header (no page padding),
  // so the four-area layout can size itself without a nested scroll container.
  const isWorkspaceRoute =
    pathname === '/agent' ||
    pathname.startsWith('/agent/conversations/') ||
    /^\/agent\/(pending|assigned|unassigned|resolved)$/.test(pathname) ||
    pathname === '/admin/conversations' ||
    pathname.startsWith('/admin/conversations/');
  const useFullScreen = fullScreen || isWorkspaceRoute;

  const getPageTitle = (path: string): string => {
    if (path === '/agent') return 'Inbox';
    if (path === '/agent/pending') return 'Pending';
    if (path === '/agent/assigned') return 'Assigned to Me';
    if (path === '/agent/unassigned') return 'Unassigned';
    if (path === '/agent/resolved') return 'Resolved';
    if (path === '/agent/contacts') return 'Contacts';
    if (path === '/agent/knowledge') return 'Knowledge Base';
    if (path === '/agent/canned-responses') return 'Canned Responses';
    if (path === '/agent/settings') return 'Settings';
    if (path === '/agent/notifications') return 'Notifications';
    if (path === '/admin') return 'Dashboard';
    if (path === '/admin/reports') return 'Reports';
    if (path === '/admin/sla') return 'SLA Configurations';
    if (path === '/admin/audit-logs') return 'Audit Logs';
    if (path === '/admin/agents') return 'Agents';
    if (path === '/admin/teams') return 'Teams';
    if (path === '/admin/conversations') return 'All Conversations';
    if (path === '/admin/categories') return 'Categories';
    if (path === '/admin/articles') return 'Articles';
    if (path === '/admin/faqs') return 'FAQs';
    if (path === '/admin/settings') return 'General Settings';
    if (path === '/admin/settings/ai-flow') return 'AI Agent Flow & Rules';
    if (path === '/admin/settings/ai') return 'AI Configuration';
    if (path === '/admin/settings/widget') return 'Chat Widget Configuration';
    if (path === '/admin/settings/rules') return 'Assignment Rules';
    if (path === '/admin/settings/notifications') return 'Notification Settings';
    if (path === '/admin/canned-responses') return 'Canned Responses';
    if (path === '/admin/custom-fields') return 'Custom Fields';
    if (path === '/admin/business-hours') return 'Business Hours';
    if (path === '/admin/webhooks') return 'Webhooks';
    if (path.startsWith('/agent/conversations/')) return 'Conversation';
    if (path.startsWith('/admin/conversations/')) return 'Conversation';
    return 'OpenChat';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        user={user}
        navigation={navigation}
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed((value) => !value)}
      />
      <div
        className={`transition-all duration-300 ${navCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}
        style={{ minHeight: '100vh' }}
      >
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4 px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-lg lg:text-xl font-bold text-slate-900 dark:text-white whitespace-nowrap">
                {getPageTitle(pathname)}
              </h1>
              <div className="hidden md:block w-64">
                <Input
                  placeholder="Global search..."
                  value={globalSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGlobalSearch(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && globalSearch.trim()) {
                      e.preventDefault();
                      router.push(`/agent?q=${encodeURIComponent(globalSearch.trim())}`);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="flex-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm placeholder-slate-400 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-3">
              {user?.role === 'agent' && (
                <button
                  type="button"
                  onClick={handleAvailabilityToggle}
                  disabled={availabilityLoading}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isAvailable
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
                  } ${availabilityLoading ? 'opacity-60 cursor-wait' : 'hover:brightness-[0.98]'}`}
                  aria-pressed={isAvailable}
                  aria-label={isAvailable ? 'Online, click to go offline' : 'Offline, click to go online'}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>{isAvailable ? 'Online' : 'Offline'}</span>
                </button>
              )}
              <NotificationBell />
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  aria-label="Open profile menu"
                  className="rounded-full"
                >
                  <Avatar name={user?.full_name || 'Agent'} size="sm" />
                </Button>
                {profileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 z-50">
                      <div className="px-2 py-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.full_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                      </div>
                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          router.push(
                            user?.role === 'admin' || user?.role === 'super_admin'
                              ? '/admin/settings'
                              : '/agent/settings'
                          );
                        }}
                        className="w-full rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          logout();
                        }}
                        className="w-full rounded px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className={useFullScreen ? 'h-[calc(100vh-57px)] overflow-hidden' : 'p-6'}>
          {children}
        </main>
      </div>
    </div>
  );
}