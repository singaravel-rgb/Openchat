'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AgentLayout } from '@/components/AgentLayout';
import ThreePanelWorkspace from '@/components/ThreePanelWorkspace';
import { useAuth } from '@/context/AuthContext';

export default function AdminConversationsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') return null;

  return (
    <AgentLayout fullScreen>
      <ThreePanelWorkspace userRole="admin" userId={user.id} />
    </AgentLayout>
  );
}