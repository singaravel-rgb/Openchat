'use client';


import ThreePanelWorkspace from '@/components/ThreePanelWorkspace';
import { useAuth } from '@/context/AuthContext';


export default function ResolvedPage() {
  const { user } = useAuth();

  if (!user || user.role !== 'agent') return null;

  return <ThreePanelWorkspace userRole="agent" userId={user.id} />;
}
