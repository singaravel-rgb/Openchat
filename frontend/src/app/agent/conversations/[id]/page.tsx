'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AgentLayout } from '@/components/AgentLayout';
import ThreePanelWorkspace from '@/components/ThreePanelWorkspace';
import { useAuth } from '@/context/AuthContext';

export default function AgentConversationPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user || user.role !== 'agent') return null;

  return (
    <AgentLayout fullScreen>
      <ThreePanelWorkspace userRole="agent" userId={user.id} />
    </AgentLayout>
  );
}