'use client';

import ThreePanelWorkspace from '@/components/ThreePanelWorkspace';
import { useAuth } from '@/context/AuthContext';

export default function AdminConversationsPage() {
  const { user } = useAuth();

  if (!user || user.role !== 'admin') return null;

  return <ThreePanelWorkspace userRole="admin" userId={user.id} />;
}