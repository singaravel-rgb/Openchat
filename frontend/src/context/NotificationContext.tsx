'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { notificationApi } from '@/lib/api';
import type { Notification, NotificationList } from '@/lib/types';
import {
  registerNotificationServiceWorker,
  dispatchDesktopNotification,
  isDesktopNotificationSupported,
} from '@/lib/desktopNotifications';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const knownNotificationIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);

  const fetchNotifications = async (silent = false) => {
    // Poll silently: before the auth token is hydrated (login/refresh) the API
    // answers 401, which must not spam the console or clear the badge.
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      if (!silent) setIsLoading(true);
      const [listResult, countResult] = await Promise.all([
        notificationApi.list({ limit: 50 }),
        notificationApi.getUnreadCount(),
      ]);
      setNotifications(listResult.notifications);
      setUnreadCount(countResult.unread_count);

      // Check for new unread notifications to dispatch desktop notifications
      if (listResult.notifications && listResult.notifications.length > 0) {
        if (isInitialLoadRef.current) {
          listResult.notifications.forEach((n) => knownNotificationIdsRef.current.add(n.id));
          isInitialLoadRef.current = false;
        } else {
          for (const n of listResult.notifications) {
            if (!knownNotificationIdsRef.current.has(n.id)) {
              knownNotificationIdsRef.current.add(n.id);
              if (!n.is_read) {
                dispatchDesktopNotification({
                  id: n.id,
                  type: n.type,
                  title: n.title,
                  message: n.message || '',
                  referenceType: n.reference_type || undefined,
                  referenceId: n.reference_id,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      // 401 triggers a redirect in the API client; ignore transient failures.
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      const updated = await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? updated : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  useEffect(() => {
    registerNotificationServiceWorker();
    fetchNotifications();

    const intervalId = setInterval(() => {
      fetchNotifications(true);
    }, 8000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}