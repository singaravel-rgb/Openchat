'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { useAuth } from '@/context/AuthContext';
import { agentApi } from '@/lib/api';
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
  onToggle?: () => void;
}

function NavItem({ 
  item, 
  pathname, 
  collapsed, 
  level = 0,
  expandedGroups,
  onToggleGroup
}: { 
  item: NavGroup; 
  pathname: string; 
  collapsed: boolean;
  level?: number;
  expandedGroups: Set<string>;
  onToggleGroup: (label: string) => void;
}) {
  const isActive = item.href && (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)));
  const hasChildren = item.items && item.items.length > 0;
  const isExpanded = expandedGroups.has(item.label);
  const showChildren = !collapsed && hasChildren && isExpanded;
  const groupId = item.label;

  const baseClasses = 'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors';
  const activeClasses = isActive ? 'bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:text-white hover:bg-slate-800/50';
  const collapsedClasses = collapsed ? 'justify-center' : '';
  const indentClasses = level > 0 ? 'pl-8' : '';

  const handleClick = (e: React.MouseEvent) => {
    if (hasChildren) {
      e.preventDefault();
      onToggleGroup(groupId);
    }
  };

  return (
    <div className="w-full">
      <Link
        key={item.href || item.label}
        href={item.href || '#'}
        className={`${baseClasses} ${activeClasses} ${collapsedClasses} ${indentClasses}`}
        onClick={handleClick}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        {!collapsed && (
          <>
            <span className="font-medium flex-1 truncate">{item.label}</span>
            {hasChildren && (
              <svg
                className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {item.badge && item.badge > 0 && (
              <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </>
        )}
      </Link>
      
      {showChildren && (
        <div className="mt-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
          {item.items!.map((child) => (
            <NavItem
              key={child.href || child.label}
              item={child}
              pathname={pathname}
              collapsed={collapsed}
              level={level + 1}
              expandedGroups={expandedGroups}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ user, navigation, onToggle }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const { logout } = useAuth();
  const [isAvailable, setIsAvailable] = useState(user?.agent_profile?.is_available ?? false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const handleAvailabilityToggle = async () => {
    if (user?.role !== 'agent') return;
    setAvailabilityLoading(true);
    try {
      const newAvailability = !isAvailable;
      await agentApi.setAvailability(newAvailability);
      setIsAvailable(newAvailability);
    } catch (err) {
      console.error('Failed to toggle availability:', err);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const autoExpandGroups = useMemo(() => {
    const groups = new Set<string>();
    
    function findParentGroups(items: NavGroup[], targetPath: string): string[] {
      for (const item of items) {
        if (item.href && (targetPath === item.href || (item.href !== '/' && targetPath.startsWith(item.href)))) {
          return [item.label];
        }
        if (item.items) {
          const found = findParentGroups(item.items, targetPath);
          if (found.length > 0) {
            return [item.label, ...found];
          }
        }
      }
      return [];
    }

    const parents = findParentGroups(navigation, pathname);
    parents.forEach((p) => groups.add(p));
    return groups;
  }, [navigation, pathname]);

  const effectiveExpandedGroups = useMemo(() => {
    const merged = new Set(expandedGroups);
    autoExpandGroups.forEach((g) => merged.add(g));
    return merged;
  }, [expandedGroups, autoExpandGroups]);

  const filteredNavigation = useMemo(() => {
    const filterByRole = (items: NavGroup[]): NavGroup[] => {
      return items
        .map((item) => {
          if (item.items) {
            const filteredChildren = filterByRole(item.items);
            if (filteredChildren.length === 0) return null;
            return { ...item, items: filteredChildren };
          }
          if (item.href) {
            const isAdminRoute = item.href.startsWith('/admin');
            const isAgentRoute = item.href.startsWith('/agent');
            if (isAdminRoute && user.role !== 'admin') return null;
            if (isAgentRoute && user.role === 'customer') return null;
          }
          return item;
        })
        .filter((item): item is NavGroup => item !== null);
    };
    return filterByRole(navigation);
  }, [navigation, user.role]);

  return (
    <aside
      className={`
        fixed left-0 top-0 z-40 h-screen bg-slate-950 text-white transition-all duration-300
        ${collapsed ? 'w-16' : 'w-64'}
        ${!collapsed ? 'lg:w-64' : 'lg:w-16'}
      `}
      aria-label="Main navigation"
    >
      <div className="flex flex-col h-full">
        {/* Logo/Brand */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <Link href="/agent" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            {!collapsed && <span className="font-semibold text-lg">OpenChat</span>}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="text-slate-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            </svg>
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {filteredNavigation.map((item) => (
            <NavItem
              key={item.href || item.label}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              expandedGroups={effectiveExpandedGroups}
              onToggleGroup={toggleGroup}
            />
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-3 border-t border-slate-800">
          {!collapsed && (
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={user.full_name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.full_name}</p>
                <p className="text-xs text-slate-500 capitalize">{user.role}</p>
              </div>
            </div>
          )}
          
          {/* Agent Availability Toggle */}
          {user.role === 'agent' && !collapsed && (
            <div className="mb-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                  <span className="text-sm font-medium text-slate-300">Availability</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAvailable}
                  aria-label={isAvailable ? 'Set to Offline' : 'Set to Online'}
                  onClick={handleAvailabilityToggle}
                  disabled={availabilityLoading}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    isAvailable ? 'bg-emerald-600' : 'bg-slate-600'
                  } ${availabilityLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isAvailable ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
              <p className={`text-xs mt-1 ${isAvailable ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isAvailable ? 'Online - Receiving new conversations' : 'Offline - Not receiving new conversations'}
              </p>
            </div>
          )}
          
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'md'}
            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
            onClick={logout}
            aria-label={collapsed ? 'Logout' : `Logout ${user.full_name}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}

// Navigation icons
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
  resolved: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  categories: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  articles: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
  knowledge: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  analytics: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  ai: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  chat: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  rules: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  teams: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  notifications: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  cannedResponses: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  ),
  customFields: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  automationRules: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
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
  botFlows: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  campaigns: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
};

export function createNavigation(user: User): NavGroup[] {
  const isAdmin = user.role === 'admin';
  const isAgent = user.role === 'agent';

  const navigation: NavGroup[] = [];

  // Primary navigation - role based
  if (isAgent) {
    navigation.push(
      {
        label: 'Inbox',
        href: '/agent',
        icon: NavIcons.inbox,
      }
    );
  }
  if (isAdmin) {
    navigation.push(
      {
        label: 'Dashboard',
        href: '/admin',
        icon: NavIcons.dashboard,
      }
    );
  }

  // Workspace group
  const workspaceItems: NavGroup[] = [];

  if (isAgent) {
    workspaceItems.push(
      { label: 'Inbox', href: '/agent', icon: NavIcons.inbox },
      { label: 'Pending', href: '/agent/pending', icon: NavIcons.pending },
      { label: 'Assigned', href: '/agent/assigned', icon: NavIcons.assigned },
      { label: 'Unassigned', href: '/agent/unassigned', icon: NavIcons.pending },
      { label: 'Resolved', href: '/agent/resolved', icon: NavIcons.resolved }
    );
  }

  if (isAdmin) {
    workspaceItems.push(
      { label: 'All Conversations', href: '/admin/conversations', icon: NavIcons.conversations },
      { label: 'Agents', href: '/admin/agents', icon: NavIcons.agents },
      { label: 'Teams & Departments', href: '/admin/teams', icon: NavIcons.teams }
    );
  }

  if (workspaceItems.length > 0) {
    navigation.push({
      label: 'Workspace',
      icon: NavIcons.workspace,
      items: workspaceItems,
    });
  }

  // Knowledge Base group (admin only)
  if (isAdmin) {
    navigation.push({
      label: 'Knowledge Base',
      icon: NavIcons.knowledge,
      items: [
        { label: 'Categories', href: '/admin/categories', icon: NavIcons.categories },
        { label: 'Articles', href: '/admin/articles', icon: NavIcons.articles },
        { label: 'FAQs', href: '/admin/faqs', icon: NavIcons.faqs },
      ],
    });
  }

  // Analytics group (admin only)
  if (isAdmin) {
    navigation.push({
      label: 'Analytics',
      icon: NavIcons.analytics,
      items: [
        { label: 'Reports', href: '/admin/reports', icon: NavIcons.reports },
        { label: 'SLA', href: '/admin/sla', icon: NavIcons.sla },
      ],
    });
  }

  // Settings group (admin only)
  if (isAdmin) {
    navigation.push({
      label: 'Settings',
      icon: NavIcons.settings,
      items: [
        { label: 'General Settings', href: '/admin/settings', icon: NavIcons.settings },
        { label: 'AI Configuration', href: '/admin/settings/ai', icon: NavIcons.ai },
        { label: 'Chat Widget Configuration', href: '/admin/settings/widget', icon: NavIcons.chat },
        { label: 'Assignment Rules', href: '/admin/settings/rules', icon: NavIcons.rules },
        { label: 'Notification Settings', href: '/admin/settings/notifications', icon: NavIcons.notifications },
        { label: 'Canned Responses', href: '/admin/canned-responses', icon: NavIcons.cannedResponses },
        { label: 'Custom Fields', href: '/admin/custom-fields', icon: NavIcons.customFields },
        { label: 'Business Hours', href: '/admin/business-hours', icon: NavIcons.businessHours },
        { label: 'Webhooks', href: '/admin/webhooks', icon: NavIcons.webhooks },
      ],
    });
  }

  return navigation;
}