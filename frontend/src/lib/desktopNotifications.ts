/**
 * OpenChat Desktop Notifications (Slack Windows Style Reference)
 * Native Web Notification API & Service Worker integration
 */

export interface DesktopNotificationPreferences {
  enabled: boolean;
  sound: boolean;
  newMessages: boolean;
  assignments: boolean;
  privateNotes: boolean;
  slaBreaches: boolean;
  unassignedAttention: boolean;
}

const DEFAULT_PREFERENCES: DesktopNotificationPreferences = {
  enabled: true,
  sound: true,
  newMessages: true,
  assignments: true,
  privateNotes: true,
  slaBreaches: true,
  unassignedAttention: true,
};

const PREFS_STORAGE_KEY = 'openchat_desktop_notification_prefs';
const SHOWN_TAGS_KEY = 'openchat_shown_notification_ids';

export function getNotificationPreferences(): DesktopNotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveNotificationPreferences(prefs: Partial<DesktopNotificationPreferences>): DesktopNotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  const current = getNotificationPreferences();
  const updated = { ...current, ...prefs };
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function isDesktopNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isDesktopNotificationSupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return 'denied';
  }
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[OpenChat] Service Worker registration failed:', err);
    return null;
  }
}

export interface DispatchNotificationOptions {
  id: number | string;
  type?: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: number | string | null;
  userRole?: string;
}

export async function dispatchDesktopNotification(opts: DispatchNotificationOptions): Promise<void> {
  if (!isDesktopNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const prefs = getNotificationPreferences();
  if (!prefs.enabled) return;

  // Filter based on event preferences
  const typeStr = (opts.type || '').toLowerCase();
  const titleStr = opts.title.toLowerCase();

  if (titleStr.includes('private note') && !prefs.privateNotes) return;
  if (titleStr.includes('assigned') && !prefs.assignments) return;
  if (titleStr.includes('sla') && !prefs.slaBreaches) return;
  if (titleStr.includes('unassigned') && !prefs.unassignedAttention) return;
  if (typeStr === 'new_message' && !prefs.newMessages) return;

  // Deduplication check via sessionStorage
  const tag = `openchat-notif-${opts.id}`;
  try {
    const shown = JSON.parse(sessionStorage.getItem(SHOWN_TAGS_KEY) || '[]');
    if (shown.includes(tag)) return;
    shown.push(tag);
    if (shown.length > 200) shown.shift();
    sessionStorage.setItem(SHOWN_TAGS_KEY, JSON.stringify(shown));
  } catch {}

  // Determine navigation URL
  const basePath = opts.userRole === 'admin' ? '/admin' : '/agent';
  let targetUrl = `${basePath}/conversations`;
  if (opts.referenceType === 'conversation' && opts.referenceId) {
    targetUrl = `${basePath}/conversations/${opts.referenceId}`;
  }

  // Windows Slack-style formatting:
  // App Name banner handled by OS/browser, Title gives context, Body quotes preview
  const notificationOptions: NotificationOptions = {
    body: opts.message || 'New activity in OpenChat Support',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: tag,
    data: { url: targetUrl },
    requireInteraction: false,
    silent: !prefs.sound,
  };

  try {
    // If Service Worker is available, use showNotification for background activation
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(opts.title, notificationOptions);
        return;
      }
    }

    // Fallback to direct Web Notification API
    const n = new Notification(opts.title, notificationOptions);
    n.onclick = function (event) {
      event.preventDefault();
      window.focus();
      if (window.location.pathname !== targetUrl) {
        window.location.href = targetUrl;
      }
      n.close();
    };
  } catch (err) {
    console.warn('[OpenChat] Could not display desktop notification:', err);
  }
}
