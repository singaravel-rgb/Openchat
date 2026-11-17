'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ThreePanelWorkspace from '@/components/ThreePanelWorkspace';
import { useAuth } from '@/context/AuthContext';

export default function AdminConversationPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') return null;

  return (
    <ThreePanelWorkspace
      userRole="admin"
      userId={user.id}
    />
  );
}
