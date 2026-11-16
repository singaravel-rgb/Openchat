export type NotificationType =
  | 'new_message'
  | 'conversation_assigned'
  | 'conversation_reopened'
  | 'mention'
  | 'sla_warning'
  | 'sla_breach'
  | 'agent_invited'
  | 'article_published'
  | 'faq_published'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string | null;
  reference_type: string | null;
  reference_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationList {
  notifications: Notification[];
  unread_count: number;
}