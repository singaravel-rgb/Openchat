'use client';

import { Suspense } from 'react';
import { AgentLayout } from '@/components/AgentLayout';

export default function AgentLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div></div>}>
      <AgentLayout>{children}</AgentLayout>
    </Suspense>
  );
}