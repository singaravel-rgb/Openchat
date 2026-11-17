'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import type { User } from '@/lib/types';

export interface NavGroup {
  label: string;
  icon: React.ReactNode;
  href?: string;
  badge?: number;
  items?: NavGroup[];
}

export interface SidebarProps {
  user: User;
  navigation: NavGroup[];
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItemProps {
  item: NavGroup;
  pathname: string;
  collapsed: boolean;
  expandedGroups: Set<string>;
  onToggleGroup: (label: string, defaultHref?: string) => void;
  level?: number;
}

function NavItem({
  item,
  pathname,
  collapsed,
  expandedGroups,
  onToggleGroup,
  level = 0,
}: NavItemProps) {
  const router = useRouter();
  const isExactMatch = Boolean(item.href) && pathname === item.href;
  const isPrefixMatch =
    Boolean(item.href) &&
    item.href !== '/' &&
    item.href !== '/admin' &&
    item.href !== '/agent' &&
    pathname.startsWith(`${item.href}/`);
  const isActive = isExactMatch || isPrefixMatch;
  const hasChildren = Boolean(item.items && item.items.length > 0);
  const isOpen = expandedGroups.has(item.label);

  const handleClick = (e: React.MouseEvent) => {
    if (hasChildren) {
      e.preventDefault();
      // If group is currently closed, expand it and optionally navigate to its primary child
      if (!isOpen && item.items?.[0]?.href) {
        onToggleGroup(item.label, item.items[0].href);
      } else {
        onToggleGroup(item.label);
      }
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleGroup(item.label);
  };

  return (
    <div className="w-full">
      <Link
        href={item.href || item.items?.[0]?.href || '#'}
        onClick={handleClick}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        className={[
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer select-none',
          level > 0 ? 'pl-8' : '',
          isActive
            ? 'bg-blue-600/20 text-blue-300 font-semibold'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-white',
          collapsed ? 'justify-center' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left font-medium">{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
            {hasChildren && (
              <button
                type="button"
                onClick={handleChevronClick}
                aria-label={isOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}
                className="p-1 -mr-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
              >
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-90 text-white' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </>
        )}
      </Link>

      {hasChildren && isOpen && !collapsed && (
        <div className="mt-1 space-y-1">
          {item.items!.map((child) => (
            <NavItem
              key={child.href || child.label}
              item={child}
              pathname={pathname}
              collapsed={collapsed}
              expandedGroups={expandedGroups}
              onToggleGroup={onToggleGroup}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single application sidebar shared by the Admin and Agent portals.
 * Visual design follows the approved Admin sidebar; only the navigation
 * configuration (role-based) and the collapse state differ.
 */
export function Sidebar({ user, navigation, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Auto-expand groups matching current path
  useEffect(() => {
    function findParents(items: NavGroup[], target: string): string[] {
      for (const item of items) {
        if (
          item.href &&
          (target === item.href ||
            (item.href !== '/' &&
              item.href !== '/admin' &&
              item.href !== '/agent' &&
              target.startsWith(`${item.href}/`)))
        ) {
          return [item.label];
        }
        if (item.items) {
          const found = findParents(item.items, target);
          if (found.length > 0) return [item.label, ...found];
        }
      }
      return [];
    }

    const parents = findParents(navigation, pathname);
    if (parents.length > 0) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        parents.forEach((label) => next.add(label));
        return next;
      });
    }
  }, [navigation, pathname]);

  const handleToggleGroup = (label: string, defaultHref?: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });

    if (defaultHref && pathname !== defaultHref) {
      router.push(defaultHref);
    }
  };

  return (
    <aside
      className={[
        'fixed left-0 top-0 z-40 flex h-screen flex-col bg-slate-950 text-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      ].join(' ')}
      aria-label="Main navigation"
    >
      <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-800 px-3">
        <Link href={user.role === 'admin' ? '/admin' : '/agent'} className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          {!collapsed && <span className="truncate text-lg font-semibold">OpenChat</span>}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex-shrink-0 text-slate-400 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
            />
          </svg>
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Sidebar sections">
        {navigation.map((item) => (
          <NavItem
            key={item.href || item.label}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            expandedGroups={expandedGroups}
            onToggleGroup={handleToggleGroup}
          />
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-slate-800 p-3">
        {!collapsed && (
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={user.full_name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.full_name}</p>
              <p className="text-xs capitalize text-slate-500">{user.role}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'md'}
          className="w-full justify-start text-red-400 hover:bg-red-900/20 hover:text-red-300"
          onClick={() => {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
          }}
          aria-label={collapsed ? 'Logout' : `Logout ${user.full_name}`}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          {!collapsed && <span>Logout</span>}
        </Button>
      </div>
    </aside>
  );
}

// Navigation icons (shared by both portals)
export const NavIcons = {
  inbox: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  pending: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  assigned: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  unassigned: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h-3m3 3h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0H3z" />
    </svg>
  ),
  resolved: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  contacts: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  conversations: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  agents: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  teams: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 006 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  knowledge: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  articles: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  categories: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  faqs: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  reports: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  sla: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  workspace: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  analytics: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  cannedResponses: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  ),
  notifications: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  customFields: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  businessHours: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  webhooks: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  rules: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};

export function createNavigation(user: User): NavGroup[] {
  const isAdmin = user.role === 'admin';
  const isAgent = user.role === 'agent';
  const navigation: NavGroup[] = [];

  if (isAdmin) {
    navigation.push({ label: 'Dashboard', href: '/admin', icon: NavIcons.dashboard });
    navigation.push({
      label: 'Workspace',
      icon: NavIcons.workspace,
      items: [
        { label: 'All Conversations', href: '/admin/conversations', icon: NavIcons.conversations },
        { label: 'Agents', href: '/admin/agents', icon: NavIcons.agents },
        { label: 'Teams', href: '/admin/teams', icon: NavIcons.teams },
      ],
    });
    navigation.push({
      label: 'Knowledge Base',
      icon: NavIcons.knowledge,
      items: [
        { label: 'Categories', href: '/admin/categories', icon: NavIcons.categories },
        { label: 'Articles', href: '/admin/articles', icon: NavIcons.articles },
        { label: 'FAQs', href: '/admin/faqs', icon: NavIcons.faqs },
      ],
    });
    navigation.push({
      label: 'Analytics',
      icon: NavIcons.analytics,
      items: [
        { label: 'Reports', href: '/admin/reports', icon: NavIcons.reports },
        { label: 'SLA', href: '/admin/sla', icon: NavIcons.sla },
      ],
    });
    navigation.push({
      label: 'Settings',
      icon: NavIcons.settings,
      items: [
        { label: 'General', href: '/admin/settings', icon: NavIcons.settings },
        { label: 'AI Configuration', href: '/admin/settings/ai', icon: NavIcons.settings },
        { label: 'Widget', href: '/admin/settings/widget', icon: NavIcons.settings },
        { label: 'Assignment Rules', href: '/admin/settings/rules', icon: NavIcons.rules },
        { label: 'Notifications', href: '/admin/settings/notifications', icon: NavIcons.notifications },
        { label: 'Canned Responses', href: '/admin/canned-responses', icon: NavIcons.cannedResponses },
        { label: 'Custom Fields', href: '/admin/custom-fields', icon: NavIcons.customFields },
        { label: 'Business Hours', href: '/admin/business-hours', icon: NavIcons.businessHours },
        { label: 'Webhooks', href: '/admin/webhooks', icon: NavIcons.webhooks },
      ],
    });
    return navigation;
  }

  if (isAgent) {
    navigation.push(
      { label: 'Inbox', href: '/agent', icon: NavIcons.inbox },
      { label: 'Assigned to Me', href: '/agent/assigned', icon: NavIcons.assigned },
      { label: 'Unassigned', href: '/agent/unassigned', icon: NavIcons.unassigned },
      { label: 'Pending', href: '/agent/pending', icon: NavIcons.pending },
      { label: 'Contacts', href: '/agent/contacts', icon: NavIcons.contacts },
      { label: 'Knowledge Base', href: '/agent/knowledge', icon: NavIcons.knowledge },
      { label: 'Canned Responses', href: '/agent/canned-responses', icon: NavIcons.cannedResponses },
      { label: 'Settings', href: '/agent/settings', icon: NavIcons.settings },
    );
    return navigation;
  }

  return navigation;
}